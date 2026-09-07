import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { toMbps, computePingStats, listServers, selectServer } from '../src/speedtest.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const SERVER_FIXTURE = [
  {
    id: 32565,
    host: 'a.example:8080',
    sponsor: 'Free',
    name: 'Marseille',
    country: 'France',
    distance: 267,
  },
  {
    id: 70682,
    host: 'b.example:8080',
    sponsor: 'fcnet',
    name: 'Besançon',
    country: 'France',
    distance: 10,
  },
];

test('toMbps converts bytes over a window to Mbit/s', () => {
  assert.equal(toMbps(1_250_000, 1), 10); // 1.25 MB in 1 s = 10 Mbit/s
  assert.equal(toMbps(0, 10), 0);
  assert.equal(toMbps(1000, 0), 0, 'a zero-length window must not divide by zero');
});

test('computePingStats returns the best sample and the mean successive delta', () => {
  const { ping, jitter } = computePingStats([20, 30, 25]);
  assert.equal(ping, 20);
  assert.equal(jitter, 7.5); // (|30-20| + |25-30|) / 2
});

test('computePingStats handles a single sample and rejects none', () => {
  assert.deepEqual(computePingStats([42.34]), { ping: 42.3, jitter: 0 });
  assert.throws(() => computePingStats([]), /No latency sample/);
});

test('listServers parses the catalog and stringifies ids', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => SERVER_FIXTURE });
  const servers = await listServers({ limit: 2 });
  assert.equal(servers.length, 2);
  assert.equal(servers[0].id, '32565');
  assert.equal(servers[0].host, 'a.example:8080');
});

test('listServers surfaces HTTP failures and empty catalogs', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(listServers(), /HTTP 503/);
  globalThis.fetch = async () => ({ ok: true, json: async () => [] });
  await assert.rejects(listServers(), /empty server list/);
});

test('selectServer honors a pinned server id', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => SERVER_FIXTURE });
  const server = await selectServer({ server_id: '70682' });
  assert.equal(server.host, 'b.example:8080');
});

test('selectServer explains an unknown pinned server id', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => SERVER_FIXTURE });
  await assert.rejects(selectServer({ server_id: '99999' }), /99999 not found/);
});

test('selectServer auto-selection skips servers that fail the latency probe', async () => {
  // Catalog answers normally; the latency probe (GET /hi) only succeeds on
  // host b — host a simulates the broken-server case seen in the wild (500).
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/api/js/servers')) {
      return { ok: true, json: async () => SERVER_FIXTURE };
    }
    if (target.startsWith('https://b.example:8080/hi')) {
      return { ok: true, text: async () => 'hello' };
    }
    return { ok: false, status: 500, text: async () => '' };
  };
  const server = await selectServer({ server_id: '' });
  assert.equal(server.host, 'b.example:8080');
});

test('selectServer fails clearly when every candidate is broken', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/js/servers')) {
      return { ok: true, json: async () => SERVER_FIXTURE };
    }
    return { ok: false, status: 500, text: async () => '' };
  };
  await assert.rejects(selectServer({ server_id: '' }), /None of the closest/);
});
