// -----------------------------------------------------------------------------
// Cloudflare speed test engine.
//
// The endpoints behind https://speed.cloudflare.com, free and without an
// account (the same ones the official page and Home Assistant's
// cloudflare_speed_test integration use):
//   - GET  https://speed.cloudflare.com/cdn-cgi/trace   -> key=value lines:
//          the point of presence (`colo`, an IATA airport code), the country
//          (`loc`) and the public IP address seen by Cloudflare (`ip`)
//   - GET  https://speed.cloudflare.com/__down?bytes=N  -> N bytes to download
//          (25 MB accepted, 100 MB refused with a 403: checked 20/10/2026)
//   - POST https://speed.cloudflare.com/__up            -> sink
//
// The throughput is measured exactly like the Speedtest.net engine
// (src/speedtest.js: same parallel connections, warmup and window), only the
// request paths change. The latency is the time to the response headers of an
// empty download, minus the processing time the server reports in its
// `Server-Timing` header (the method of the official page).
//
// The public IP address is personal data: it is returned to the caller, which
// keeps it only when the user asked for it, and it is NEVER logged.
// -----------------------------------------------------------------------------

import https from 'node:https';
import { createLogger } from '@gladysassistant/integration-sdk';
import { USER_AGENT, computePingStats, measureDownload, measureUpload } from './speedtest.js';

const logger = createLogger({ name: 'cloudflare-engine' });

export const CLOUDFLARE_HOST = 'speed.cloudflare.com';
// Bytes asked per download request (the largest round size Cloudflare's own
// page asks for; 100 MB is refused).
const DOWNLOAD_REQUEST_BYTES = 25_000_000;
// Latency samples: empty requests, a few hundred bytes each.
const PING_SAMPLES = 20;

export const CLOUDFLARE_PATHS = {
  download: () => `/__down?bytes=${DOWNLOAD_REQUEST_BYTES}`,
  upload: () => '/__up',
};

// One keep-alive connection for the latency samples, so that no sample pays
// a TCP and TLS handshake.
const pingAgent = new https.Agent({ keepAlive: true, maxSockets: 1 });

/**
 * Parse the `key=value` lines of /cdn-cgi/trace.
 * @param {string} text the response body
 * @returns {Record<string, string>}
 */
export function parseTrace(text) {
  const trace = {};
  for (const line of String(text).split('\n')) {
    const index = line.indexOf('=');
    if (index > 0) {
      trace[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
  }
  return trace;
}

/**
 * The server processing time of a `Server-Timing` header: the sum of its
 * `dur` values, in milliseconds (`cfSpeedEdge;dur=6, cfSpeedWorker;dur=41`
 * gives 47). The `cfL4` entry carries no `dur`. 0 when absent.
 * @param {string|null|undefined} header
 * @returns {number}
 */
export function serverProcessingMs(header) {
  let total = 0;
  for (const match of String(header ?? '').matchAll(/(?:^|[;,\s])dur=([\d.]+)/g)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      total += value;
    }
  }
  return total;
}

/**
 * Fetch the trace: point of presence, country and public IP.
 * @returns {Promise<{ colo: string|null, loc: string|null, ip: string|null }>}
 */
export async function fetchTrace() {
  const res = await fetch(`https://${CLOUDFLARE_HOST}/cdn-cgi/trace`, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Cloudflare trace request failed (HTTP ${res.status})`);
  }
  const trace = parseTrace(await res.text());
  return { colo: trace.colo || null, loc: trace.loc || null, ip: trace.ip || null };
}

/**
 * One latency sample (milliseconds): time to the headers of an empty
 * download, minus the server processing time.
 */
function pingOnce() {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const req = https.get(
      {
        agent: pingAgent,
        hostname: CLOUDFLARE_HOST,
        path: '/__down?bytes=0',
        headers: { 'user-agent': USER_AGENT },
        timeout: 5_000,
      },
      (res) => {
        const elapsed = performance.now() - started;
        res.resume();
        if (res.statusCode !== 200) {
          reject(new Error(`Cloudflare latency probe failed (HTTP ${res.statusCode})`));
          return;
        }
        resolve(Math.max(0, elapsed - serverProcessingMs(res.headers['server-timing'])));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Cloudflare latency probe timed out')));
    req.on('error', reject);
  });
}

/**
 * Sequential latency samples. Failed samples are dropped; throws only if
 * every sample failed. The first sample opens the connection: it is
 * discarded.
 */
async function measurePing(count) {
  const samples = [];
  let lastError;
  for (let i = 0; i <= count; i += 1) {
    try {
      const sample = await pingOnce();
      if (i > 0) {
        samples.push(sample);
      }
    } catch (err) {
      lastError = err;
    }
  }
  if (samples.length === 0) {
    throw lastError ?? new Error('No latency sample succeeded against Cloudflare');
  }
  return samples;
}

/**
 * Cloudflare answers 429 when an address downloads or uploads too much in a
 * short time (seen after two gigabit tests in five minutes): say so, rather
 * than a bare HTTP code.
 * @param {Error} err
 * @returns {Error}
 */
export function rateLimitError(err) {
  if (!/HTTP 429/.test(err?.message ?? '')) {
    return err;
  }
  return new Error(
    'Cloudflare rate-limited the test (HTTP 429): too much traffic from this address lately. ' +
      'The next test will try again; lengthen the interval if it keeps happening.',
  );
}

/**
 * Full Cloudflare test: trace, then latency -> download -> upload,
 * sequentially so each measurement gets the whole link to itself.
 * @param {{ connections: number, duration: number }} config
 * @returns {Promise<{ ping, jitter, download, upload, server, ip }>}
 */
export async function runCloudflareTest(config) {
  const trace = await fetchTrace();
  logger.debug(`Testing against Cloudflare (${trace.colo ?? 'unknown point of presence'})`);

  const { ping, jitter } = computePingStats(await measurePing(PING_SAMPLES));
  const options = { connections: config.connections, duration: config.duration };
  let download;
  let upload;
  try {
    download = await measureDownload(CLOUDFLARE_HOST, options, CLOUDFLARE_PATHS);
    upload = await measureUpload(CLOUDFLARE_HOST, options, CLOUDFLARE_PATHS);
  } catch (err) {
    throw rateLimitError(err);
  }

  // No IP address here, ever (see the header of this file).
  logger.debug(`Result: ↓${download} Mbit/s ↑${upload} Mbit/s ping ${ping} ms jitter ${jitter} ms`);
  return {
    ping,
    jitter,
    download,
    upload,
    server: { id: trace.colo, sponsor: 'Cloudflare', name: trace.colo, country: trace.loc },
    ip: trace.ip,
  };
}
