import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createResultStore, LAST_RESULT_FILE, normalizeResult } from '../src/store.js';

const RESULT = {
  at: '2026-10-05T14:05:00.000Z',
  download: 921.4,
  upload: 848.2,
  ping: 3.1,
  jitter: 0.4,
  server: {
    id: '32565',
    host: 'example:8080',
    sponsor: 'Free',
    name: 'Marseille',
    country: 'France',
    distance: 267,
  },
};

async function withDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'speedtest-store-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('normalizeResult keeps what the widget needs, and only that', () => {
  assert.deepEqual(normalizeResult(RESULT), {
    at: RESULT.at,
    download: 921.4,
    upload: 848.2,
    ping: 3.1,
    jitter: 0.4,
    server: { id: '32565', sponsor: 'Free', name: 'Marseille', country: 'France' },
  });
  assert.equal(normalizeResult(null), null);
  assert.equal(normalizeResult({ download: 1 }), null, 'a result without a date is useless');
  assert.equal(normalizeResult({ at: 'not a date' }), null);
  const sparse = normalizeResult({ at: RESULT.at, download: 'x' });
  assert.equal(sparse.download, null);
  assert.deepEqual(sparse.server, { id: null, sponsor: null, name: null, country: null });
});

test('save then load round-trips through the data directory', async () => {
  await withDir(async (dir) => {
    const store = createResultStore(path.join(dir, 'nested'));
    assert.equal(store.load(), null, 'nothing stored yet');
    const stored = store.save(RESULT);
    assert.equal(stored.server.sponsor, 'Free');
    assert.deepEqual(createResultStore(path.join(dir, 'nested')).load(), stored);
    const raw = JSON.parse(await readFile(path.join(dir, 'nested', LAST_RESULT_FILE), 'utf8'));
    assert.equal(raw.server.host, undefined, 'the host is not persisted');
  });
});

test('a corrupt or unwritable store never throws', async () => {
  await withDir(async (dir) => {
    await writeFile(path.join(dir, LAST_RESULT_FILE), '{not json');
    const store = createResultStore(dir);
    assert.equal(store.load(), null);
    assert.equal(store.save({ nope: true }), null, 'an invalid result is not written');
  });
  // A directory that cannot be created (a file is in the way).
  await withDir(async (dir) => {
    const blocked = path.join(dir, 'file');
    await writeFile(blocked, '');
    const store = createResultStore(path.join(blocked, 'sub'));
    assert.doesNotThrow(() => store.save(RESULT));
    assert.equal(store.load(), null);
  });
});
