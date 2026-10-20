// -----------------------------------------------------------------------------
// The Cloudflare engine: parsing (fixtures recorded against
// speed.cloudflare.com on 20/10/2026, IP replaced by a documentation address),
// engine choice, and the public IP kept only on request, never logged.
//
// CLOUDFLARE_LIVE=1 also runs one real, short test (1 connection, 5 s per
// direction): a few tens of MB on a fast line.
// -----------------------------------------------------------------------------

import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  CLOUDFLARE_PATHS,
  fetchTrace,
  parseTrace,
  rateLimitError,
  runCloudflareTest,
  serverProcessingMs,
} from '../src/cloudflare.js';
import { normalizeConfig } from '../src/config.js';
import { measureDownload } from '../src/speedtest.js';
import {
  getLastResult,
  setEngineForTests,
  setStoreForTests,
  speedtest,
} from '../src/devices/speedtest.js';
import { createResultStore, LAST_RESULT_FILE } from '../src/store.js';
import { WIDGET } from '../src/widgets.js';

const TRACE = await readFile(new URL('./fixtures/cloudflare-trace.txt', import.meta.url), 'utf8');
const IP = '198.51.100.23';
// The Server-Timing headers of an empty download, as received.
const SERVER_TIMING =
  'cfSpeedEdge;dur=6, cfSpeedWorker;dur=41, cfL4;desc="?proto=TCP&rtt=13735&min_rtt=13734&rtt_var=5153&sent=4&recv=6&lost=0&retrans=0&sent_bytes=2855&recv_bytes=717&delivery_rate=210648&cwnd=52&unsent_bytes=0&cid=fb8fd31cd727cd77&ts=71&x=0"';

const CLOUDFLARE_RESULT = {
  ping: 13.2,
  jitter: 0.8,
  download: 895.98,
  upload: 850.35,
  server: { id: 'CDG', sponsor: 'Cloudflare', name: 'CDG', country: 'FR' },
  ip: IP,
};

const realFetch = globalThis.fetch;
let dataDir;
before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'speedtest-cloudflare-'));
});
after(async () => {
  setStoreForTests(null);
  await rm(dataDir, { recursive: true, force: true });
});
afterEach(() => {
  setEngineForTests(null);
  globalThis.fetch = realFetch;
});

async function freshStore() {
  const dir = await mkdtemp(path.join(dataDir, 'store-'));
  setStoreForTests(createResultStore(dir));
  return dir;
}

/** Capture the lines of the SDK logger at the given LOG_LEVEL. */
function captureLogs(t, level) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    if (previous === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  return () => lines.join('\n');
}

test('parseTrace reads the point of presence, the country and the IP', () => {
  const trace = parseTrace(TRACE);
  assert.equal(trace.colo, 'CDG');
  assert.equal(trace.loc, 'FR');
  assert.equal(trace.ip, IP);
  assert.equal(trace.uag, 'gladys-speedtest (+https://github.com/guim31/gladys-speedtest)');
  assert.deepEqual(parseTrace(''), {});
});

test('fetchTrace keeps colo, loc and ip, and surfaces HTTP failures', async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => TRACE });
  assert.deepEqual(await fetchTrace(), { colo: 'CDG', loc: 'FR', ip: IP });
  globalThis.fetch = async () => ({ ok: false, status: 429 });
  await assert.rejects(fetchTrace(), /HTTP 429/);
});

test('serverProcessingMs sums the dur values, ignoring cfL4', () => {
  assert.equal(serverProcessingMs(SERVER_TIMING), 47);
  assert.equal(serverProcessingMs(undefined), 0);
  assert.equal(serverProcessingMs('cfL4;desc="?rtt=13735"'), 0);
});

test('the request paths stay within what Cloudflare accepts', () => {
  const bytes = Number(new URL(CLOUDFLARE_PATHS.download(), 'https://x').searchParams.get('bytes'));
  assert.ok(bytes > 0 && bytes < 100_000_000, '100 MB per request is refused (403)');
  assert.equal(CLOUDFLARE_PATHS.upload(), '/__up');
});

test('a rate limit mid-measurement fails it instead of a falsely low speed', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: true, body: [new Uint8Array(1_000_000)] };
    }
    return { ok: false, status: 429, body: null };
  };
  const options = { connections: 1, duration: 5 };
  await assert.rejects(measureDownload('speed.example', options, CLOUDFLARE_PATHS), /HTTP 429/);
  calls = 0;
  const mbps = await measureDownload('speed.example', options, {
    ...CLOUDFLARE_PATHS,
    failOnRateLimit: false,
  });
  assert.ok(mbps > 0, 'the Speedtest.net engine keeps its former behaviour');
});

test('the engine field defaults to Speedtest.net and the IP to hidden', () => {
  assert.equal(normalizeConfig().engine, 'speedtest');
  assert.equal(normalizeConfig({ engine: 'cloudflare' }).engine, 'cloudflare');
  assert.equal(normalizeConfig({ engine: 'other' }).engine, 'speedtest');
  assert.equal(normalizeConfig().show_ip, false);
  assert.equal(normalizeConfig({ show_ip: 'true' }).show_ip, true);
});

function engines(calls) {
  return {
    runSpeedtest: async () => {
      calls.push('speedtest');
      return { ...CLOUDFLARE_RESULT, server: { id: '1', sponsor: 'Free', name: 'Paris' } };
    },
    runCloudflareTest: async () => {
      calls.push('cloudflare');
      return { ...CLOUDFLARE_RESULT };
    },
  };
}

test('the configured engine runs, and the same four sensors are published', async () => {
  await freshStore();
  const calls = [];
  setEngineForTests(engines(calls));
  const gladys = createFakeGladys();
  await gladys.publishDiscoveredDevices([speedtest.buildDevice(gladys, normalizeConfig())]);

  await speedtest.actions.run_speedtest(gladys, { config: normalizeConfig() });
  await speedtest.actions.run_speedtest(gladys, {
    config: normalizeConfig({ engine: 'cloudflare' }),
  });
  assert.deepEqual(calls, ['speedtest', 'cloudflare']);
  assert.equal(getLastResult().server.sponsor, 'Cloudflare');
});

test('without the option, the IP is neither kept, stored nor shown', async () => {
  const dir = await freshStore();
  setEngineForTests(engines([]));
  const gladys = createFakeGladys();
  const message = await speedtest.actions.run_speedtest(gladys, {
    config: normalizeConfig({ engine: 'cloudflare' }),
  });
  assert.doesNotMatch(JSON.stringify(message), /198\.51\.100\.23/);
  assert.equal(getLastResult().ip, null);
  const stored = await readFile(path.join(dir, LAST_RESULT_FILE), 'utf8');
  assert.doesNotMatch(stored, /198\.51\.100\.23/);
  const content = speedtest.widgets[WIDGET.SPEED].get(gladys, { settings: {}, language: 'fr' });
  assert.doesNotMatch(JSON.stringify(content), /198\.51\.100\.23/);
});

test('with the option, the IP shows in the widget and the result, never in the logs', async (t) => {
  await freshStore();
  const logs = captureLogs(t, 'debug');
  setEngineForTests(engines([]));
  const gladys = createFakeGladys();
  const config = normalizeConfig({ engine: 'cloudflare', show_ip: true });
  const message = await speedtest.actions.run_speedtest(gladys, { config });
  for (const text of Object.values(message)) {
    assert.match(text, /Cloudflare, CDG.* · IP 198\.51\.100\.23$/);
  }
  const content = speedtest.widgets[WIDGET.SPEED].get(gladys, {
    settings: {},
    language: 'fr',
    config,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(rows.find((row) => row.value === IP)?.label, {
    en: 'Public IP',
    fr: 'IP publique',
    de: 'Öffentliche IP',
    es: 'IP pública',
  });
  assert.ok(rows.some((row) => row.value === 'Cloudflare · CDG'));
  const toast = await speedtest.widgets[WIDGET.SPEED].action(gladys, {
    actionKey: 'run_test',
    config,
  });
  assert.match(toast.fr, /IP 198\.51\.100\.23/);
  assert.doesNotMatch(logs(), /198\.51\.100\.23/);
});

test('a rate limit says so, and how to avoid it', async () => {
  assert.match(
    rateLimitError(new Error('Download request failed (HTTP 429)')).message,
    /rate-limit/,
  );
  const other = new Error('Download request failed (HTTP 500)');
  assert.equal(rateLimitError(other), other);
});

test('turning the option off forgets the IP kept by an earlier test', async () => {
  const dir = await freshStore();
  setEngineForTests(engines([]));
  const gladys = createFakeGladys();
  const on = normalizeConfig({ engine: 'cloudflare', show_ip: true });
  await speedtest.actions.run_speedtest(gladys, { config: on });
  assert.equal(getLastResult().ip, IP);
  const off = normalizeConfig({ engine: 'cloudflare', auto_test: false });
  const content = speedtest.widgets[WIDGET.SPEED].get(gladys, { settings: {}, config: off });
  assert.doesNotMatch(JSON.stringify(content), /198\.51\.100\.23/, 'hidden right away');
  speedtest.startPush(gladys, off)();
  assert.equal(getLastResult().ip, null);
  const stored = await readFile(path.join(dir, LAST_RESULT_FILE), 'utf8');
  assert.doesNotMatch(stored, /198\.51\.100\.23/);
});

test('list_servers names the Cloudflare engine even when Speedtest.net is down', async () => {
  setEngineForTests({
    listServers: async () => {
      throw new Error('down');
    },
  });
  const message = await speedtest.actions.list_servers(createFakeGladys(), {
    config: normalizeConfig({ engine: 'cloudflare' }),
  });
  assert.match(message.en, /Cloudflare engine is selected/);
});

test(
  'a real Cloudflare test measures, and keeps the IP out of the logs',
  { skip: process.env.CLOUDFLARE_LIVE !== '1' && 'set CLOUDFLARE_LIVE=1 to run' },
  async (t) => {
    const logs = captureLogs(t, 'debug');
    const result = await runCloudflareTest({ connections: 1, duration: 5 });
    assert.ok(result.download > 0 && result.upload > 0, JSON.stringify(result.server));
    assert.ok(result.ping > 0 && result.ping < 1000);
    assert.ok(result.jitter >= 0);
    assert.match(result.server.id, /^[A-Z]{3}$/);
    assert.ok(result.ip, 'the trace gives the public IP');
    assert.ok(!logs().includes(result.ip), 'the IP never reaches the logs');
  },
);
