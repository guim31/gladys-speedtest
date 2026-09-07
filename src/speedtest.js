// -----------------------------------------------------------------------------
// Speed test engine.
//
// Pure JavaScript client for the HTTP endpoints served by every Speedtest.net
// (OoklaServer) host — the same endpoints the official web client falls back
// to when WebSocket is unavailable:
//   - GET  https://<host>/hi?nocache=<id>            -> latency probe ("hello")
//   - GET  https://<host>/download?nocache=&size=N   -> N bytes to download
//   - POST https://<host>/upload?nocache=<id>        -> sink, replies "size=N"
//
// No Ookla binary is bundled: the official CLI's license forbids
// redistribution, and the Gladys sandbox mounts the rootfs read-only anyway.
//
// Server discovery uses the public catalog endpoint
// https://www.speedtest.net/api/js/servers (JSON, sorted by distance).
// Some listed servers are broken (plain 500 on every path), so auto-selection
// probes several candidates and keeps the fastest HEALTHY one.
// -----------------------------------------------------------------------------

import https from 'node:https';
import { randomUUID, randomBytes } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'speedtest-engine' });

const SERVER_LIST_URL = 'https://www.speedtest.net/api/js/servers';
// OoklaServer answers 500 to any request WITHOUT a User-Agent header: always
// send one (found the hard way — the 500 arrives before the upload body).
const USER_AGENT = 'gladys-speedtest (+https://github.com/guim31/gladys-speedtest)';
// Bytes asked per download request: big enough to keep the socket busy for a
// while at gigabit speeds, small enough to cycle on slow links.
const DOWNLOAD_REQUEST_BYTES = 25_000_000;
// Bytes sent per upload request: the size the official web client uses.
const UPLOAD_REQUEST_BYTES = 25_000_000;
// Reuse upload connections across requests: a fresh TLS handshake per POST
// restarts the TCP congestion window and floors the measurement.
const uploadAgent = new https.Agent({ keepAlive: true, maxSockets: 16 });
// One shared random payload, re-written over and over by the upload workers.
// 1 MB per write: every write() waits one event-loop turn for its drain, so
// small chunks cap the whole measurement (64 KB chunks topped out far below
// the real capacity on a 700 Mbit/s line).
const UPLOAD_CHUNK = randomBytes(1024 * 1024);
// Seconds of traffic discarded before measuring (TCP slow start, cache warmup).
const WARMUP_SECONDS = 2;
// Latency samples on the chosen server / on each auto-selection candidate.
const PING_SAMPLES = 8;
const CANDIDATE_PING_SAMPLES = 3;
// How many nearby servers the auto-selection races against each other.
const CANDIDATE_COUNT = 5;

/**
 * Convert a byte count over a time window to Mbit/s (2 decimals).
 */
export function toMbps(bytes, seconds) {
  if (!(seconds > 0)) {
    return 0;
  }
  return Math.round(((bytes * 8) / seconds / 1e6) * 100) / 100;
}

/**
 * Latency statistics from raw samples (milliseconds).
 * ping   = best sample (standard practice: the network floor, not the jitter);
 * jitter = mean absolute difference between successive samples (RFC 3550-ish).
 */
export function computePingStats(samples) {
  if (samples.length === 0) {
    throw new Error('No latency sample succeeded');
  }
  const ping = Math.min(...samples);
  let jitter = 0;
  if (samples.length > 1) {
    let sum = 0;
    for (let i = 1; i < samples.length; i += 1) {
      sum += Math.abs(samples[i] - samples[i - 1]);
    }
    jitter = sum / (samples.length - 1);
  }
  return { ping: Math.round(ping * 10) / 10, jitter: Math.round(jitter * 10) / 10 };
}

/**
 * Fetch the closest Speedtest.net servers (already sorted by distance).
 * @param {object} [options]
 * @param {number} [options.limit] how many servers to return (max 100)
 * @returns {Promise<Array<{id, host, sponsor, name, country, distance}>>}
 */
export async function listServers({ limit = 10 } = {}) {
  const params = new URLSearchParams({
    engine: 'js',
    https_functional: 'true',
    limit: String(limit),
  });
  const res = await fetch(`${SERVER_LIST_URL}?${params}`, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Server list request failed (HTTP ${res.status})`);
  }
  const servers = await res.json();
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error('Speedtest.net returned an empty server list');
  }
  return servers.map((s) => ({
    id: String(s.id),
    host: s.host,
    sponsor: s.sponsor,
    name: s.name,
    country: s.country,
    distance: s.distance,
  }));
}

/**
 * One latency sample: time a GET /hi round-trip (milliseconds).
 */
async function pingOnce(host) {
  const started = performance.now();
  const res = await fetch(`https://${host}/hi?nocache=${randomUUID()}`, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(5_000),
  });
  await res.text();
  if (!res.ok) {
    throw new Error(`Latency probe failed (HTTP ${res.status})`);
  }
  return performance.now() - started;
}

/**
 * Sequential latency samples against one server. Failed samples are dropped;
 * throws only if EVERY sample failed.
 */
async function measurePing(host, count) {
  const samples = [];
  let lastError;
  for (let i = 0; i < count; i += 1) {
    try {
      samples.push(await pingOnce(host));
    } catch (err) {
      lastError = err;
    }
  }
  if (samples.length === 0) {
    throw lastError ?? new Error(`No latency sample succeeded against ${host}`);
  }
  return samples;
}

/**
 * Choose the target server.
 * - `config.server_id` set: find that exact server in the catalog (closest 100).
 * - otherwise: probe the closest candidates and keep the lowest healthy ping.
 *   Broken servers (HTTP 500 on everything) are silently skipped here.
 */
export async function selectServer(config) {
  if (config.server_id) {
    const servers = await listServers({ limit: 100 });
    const server = servers.find((s) => s.id === config.server_id);
    if (!server) {
      throw new Error(
        `Server ID ${config.server_id} not found among the 100 closest servers. ` +
          'Clear the field to auto-select, or pick an ID from the "List nearby servers" action.',
      );
    }
    return server;
  }

  const candidates = (await listServers({ limit: 10 })).slice(0, CANDIDATE_COUNT);
  const probed = await Promise.allSettled(
    candidates.map(async (server) => {
      const samples = await measurePing(server.host, CANDIDATE_PING_SAMPLES);
      return { server, ping: Math.min(...samples) };
    }),
  );
  const healthy = probed.filter((p) => p.status === 'fulfilled').map((p) => p.value);
  if (healthy.length === 0) {
    throw new Error('None of the closest Speedtest.net servers answered the latency probe');
  }
  healthy.sort((a, b) => a.ping - b.ping);
  logger.info(
    `Auto-selected server ${healthy[0].server.id} (${healthy[0].server.sponsor}, ` +
      `${healthy[0].server.name}) at ${Math.round(healthy[0].ping)} ms`,
  );
  return healthy[0].server;
}

/**
 * Shared measurement clock: warmup traffic is discarded, then bytes are
 * counted over exactly `duration` seconds and every worker is stopped.
 */
function createMeasurementWindow(duration, onStop) {
  const counter = { bytes: 0, measuredSeconds: duration };
  const warmupTimer = setTimeout(() => {
    counter.bytes = 0;
    counter.startedAt = performance.now();
  }, WARMUP_SECONDS * 1000);
  const stopTimer = setTimeout(
    () => {
      if (counter.startedAt) {
        counter.measuredSeconds = (performance.now() - counter.startedAt) / 1000;
      }
      onStop();
    },
    (WARMUP_SECONDS + duration) * 1000,
  );
  return {
    counter,
    clear() {
      clearTimeout(warmupTimer);
      clearTimeout(stopTimer);
    },
  };
}

/**
 * Download throughput: `connections` parallel workers loop on
 * GET /download?size=N, discarding the bytes and counting them.
 * @returns {Promise<number>} Mbit/s
 */
export async function measureDownload(host, { connections, duration }) {
  const controller = new AbortController();
  const window = createMeasurementWindow(duration, () => controller.abort());

  const worker = async () => {
    let consecutiveErrors = 0;
    for (;;) {
      try {
        const res = await fetch(
          `https://${host}/download?nocache=${randomUUID()}&size=${DOWNLOAD_REQUEST_BYTES}`,
          { headers: { 'user-agent': USER_AGENT }, signal: controller.signal },
        );
        if (!res.ok) {
          throw new Error(`Download request failed (HTTP ${res.status})`);
        }
        for await (const chunk of res.body) {
          window.counter.bytes += chunk.length;
        }
        consecutiveErrors = 0;
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3) {
          throw err;
        }
      }
    }
  };

  try {
    const results = await Promise.allSettled(Array.from({ length: connections }, () => worker()));
    if (window.counter.bytes === 0) {
      const failure = results.find((r) => r.status === 'rejected');
      throw failure?.reason ?? new Error('Download test received no data');
    }
    return toMbps(window.counter.bytes, window.counter.measuredSeconds);
  } finally {
    window.clear();
    controller.abort();
  }
}

/**
 * One upload POST: writes random 64 KB chunks (respecting backpressure) up to
 * UPLOAD_REQUEST_BYTES, counting each flushed chunk. Stops early when the
 * window closes. Bytes are counted at socket-write time, the same
 * approximation browser-based speed tests rely on.
 */
function uploadOnce(host, counter, active, signal) {
  return new Promise((resolve, reject) => {
    const [hostname, port] = host.split(':');
    const req = https.request({
      agent: uploadAgent,
      hostname,
      port: Number(port) || 443,
      path: `/upload?nocache=${randomUUID()}`,
      method: 'POST',
      headers: {
        'user-agent': USER_AGENT,
        'content-type': 'application/octet-stream',
        'content-length': UPLOAD_REQUEST_BYTES,
      },
    });
    active.add(req);
    let sent = 0;

    const finish = (err) => {
      active.delete(req);
      if (err && !signal.aborted) {
        reject(err);
      } else {
        resolve();
      }
    };

    req.on('error', (err) => finish(err));
    req.on('response', (res) => {
      res.resume();
      // A refusal arrives BEFORE the body is consumed: surface it, otherwise
      // the worker would happily keep pumping bytes into a closed socket.
      if (res.statusCode !== 200) {
        finish(new Error(`Upload request failed (HTTP ${res.statusCode})`));
        req.destroy();
        return;
      }
      res.on('end', () => finish());
      res.on('error', (err) => finish(err));
    });

    const writeMore = () => {
      while (!signal.aborted && sent < UPLOAD_REQUEST_BYTES) {
        const chunk =
          UPLOAD_REQUEST_BYTES - sent >= UPLOAD_CHUNK.length
            ? UPLOAD_CHUNK
            : UPLOAD_CHUNK.subarray(0, UPLOAD_REQUEST_BYTES - sent);
        // Count on the flush callback (data handed to the kernel), not at
        // write() time: buffered-but-unsent bytes must not inflate the result.
        const ok = req.write(chunk, () => {
          counter.bytes += chunk.length;
        });
        sent += chunk.length;
        if (!ok) {
          req.once('drain', writeMore);
          return;
        }
      }
      if (signal.aborted) {
        req.destroy();
        finish();
      } else {
        req.end();
      }
    };
    writeMore();
  });
}

/**
 * Upload throughput: `connections` parallel workers loop on POST /upload.
 * @returns {Promise<number>} Mbit/s
 */
export async function measureUpload(host, { connections, duration }) {
  const controller = new AbortController();
  const active = new Set();
  const window = createMeasurementWindow(duration, () => {
    controller.abort();
    for (const req of active) {
      req.destroy();
    }
  });

  const worker = async () => {
    let consecutiveErrors = 0;
    while (!controller.signal.aborted) {
      try {
        await uploadOnce(host, window.counter, active, controller.signal);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3) {
          throw err;
        }
      }
    }
  };

  try {
    const results = await Promise.allSettled(Array.from({ length: connections }, () => worker()));
    if (window.counter.bytes === 0) {
      const failure = results.find((r) => r.status === 'rejected');
      throw failure?.reason ?? new Error('Upload test sent no data');
    }
    return toMbps(window.counter.bytes, window.counter.measuredSeconds);
  } finally {
    window.clear();
    controller.abort();
  }
}

/**
 * Full test run: pick a server, then latency -> download -> upload,
 * sequentially so each measurement gets the whole link to itself.
 * @returns {Promise<{ping, jitter, download, upload, server}>}
 */
export async function runSpeedtest(config) {
  const server = await selectServer(config);
  logger.info(`Testing against ${server.host} (${server.sponsor}, ${server.name})`);

  const { ping, jitter } = computePingStats(await measurePing(server.host, PING_SAMPLES));
  const options = { connections: config.connections, duration: config.duration };
  const download = await measureDownload(server.host, options);
  const upload = await measureUpload(server.host, options);

  logger.info(`Result: ↓${download} Mbit/s ↑${upload} Mbit/s ping ${ping} ms jitter ${jitter} ms`);
  return { ping, jitter, download, upload, server };
}
