// -----------------------------------------------------------------------------
// Polling and logs, against the fake Gladys of the SDK (a real
// GladysIntegration whose host API checks the payloads like the core does).
//
// - Gladys polls a device only with should_poll: true AND a poll_frequency
//   among DEVICE_POLL_FREQUENCIES (GladysAssistant/Gladys#3198). The speed
//   test is hourly: the device must say should_poll: false, and the states
//   must arrive from the internal timer, without any onPoll.
// - At the default level (info), a normal test writes nothing; a failure that
//   repeats is logged once, and once when the tests work again.
// -----------------------------------------------------------------------------

import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildDiscoveredDevices } from '../src/devices/index.js';
import { speedtest, setEngineForTests, setStoreForTests } from '../src/devices/speedtest.js';
import { normalizeConfig } from '../src/config.js';
import { createResultStore } from '../src/store.js';
import { WIDGET } from '../src/widgets.js';

const config = normalizeConfig();
const INTERVAL_MS = config.poll_frequency * 1000;

const FAKE_RESULT = {
  ping: 12.3,
  jitter: 1.4,
  download: 842.5,
  upload: 512.25,
  server: { id: '32565', host: 'example:8080', sponsor: 'Free', name: 'Marseille' },
};

let dataDir;
before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'speedtest-polling-'));
});
after(async () => {
  setStoreForTests(null);
  await rm(dataDir, { recursive: true, force: true });
});
afterEach(() => setEngineForTests(null));

/** A fresh, empty result store for each test. */
async function freshStore() {
  const dir = await mkdtemp(path.join(dataDir, 'store-'));
  setStoreForTests(createResultStore(dir));
}

/** Let the async run (engine -> publishStates -> store) settle. */
async function settle() {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Capture the lines of the SDK logger at the given LOG_LEVEL. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    if (previous === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({ stream, text: args.map(String).join(' ') });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return { lines, texts: () => lines.map((line) => line.text), clear: () => lines.splice(0) };
}

test('the device is accepted by Gladys and never polled by it', async () => {
  const gladys = createFakeGladys();
  // The fake refuses a poll_frequency outside DEVICE_POLL_FREQUENCIES (400).
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
  const devices = gladys.fake.discoveredDevices;
  assert.equal(devices.length, 1);
  for (const device of devices) {
    assert.equal(device.should_poll, false, 'the schedule lives in the container');
    assert.equal(device.poll_frequency, undefined);
    // should_poll: true if and only if a valid poll_frequency is published.
    assert.equal(
      device.should_poll,
      Object.values(DEVICE_POLL_FREQUENCIES).includes(device.poll_frequency),
    );
  }
});

test('the internal timer publishes the states, with no onPoll at all', async (t) => {
  await freshStore();
  t.mock.timers.enable({ apis: ['setInterval'] });
  const gladys = createFakeGladys();
  setEngineForTests({ runSpeedtest: async () => FAKE_RESULT });

  const stop = speedtest.startPush(gladys, config);
  t.after(stop);
  t.mock.timers.tick(INTERVAL_MS);
  await settle();

  const ids = gladys.externalIds('speedtest', 'internet-connection');
  assert.equal(gladys.fake.lastState(ids.feature('download')), FAKE_RESULT.download);
  assert.equal(gladys.fake.lastState(ids.feature('upload')), FAKE_RESULT.upload);
  assert.equal(gladys.fake.lastState(ids.feature('ping')), FAKE_RESULT.ping);
  assert.equal(gladys.fake.lastState(ids.feature('jitter')), FAKE_RESULT.jitter);
  // A Gladys poll would find no handler: the integration does not register one.
  const [device] = buildDiscoveredDevices(gladys, config);
  const ack = await gladys.fake.poll(device);
  assert.equal(ack.success, false);
});

test('adding the device in Gladys publishes the last result again', async () => {
  await freshStore();
  const gladys = createFakeGladys();
  setEngineForTests({ runSpeedtest: async () => FAKE_RESULT });
  await speedtest.actions.run_speedtest(gladys, { fields: {}, config });
  const before = gladys.fake.states.length;

  await speedtest.onDeviceCreated(gladys);
  const republished = gladys.fake.states.slice(before);
  assert.equal(republished.length, 4, 'the four sensors');
  const ids = gladys.externalIds('speedtest', 'internet-connection');
  assert.equal(gladys.fake.lastState(ids.feature('download')), FAKE_RESULT.download);
  assert.equal(gladys.fake.widgetRefreshes.at(-1), WIDGET.SPEED);
});

test('adding the device before any test publishes nothing', async () => {
  await freshStore();
  const gladys = createFakeGladys();
  await speedtest.onDeviceCreated(gladys);
  assert.equal(gladys.fake.states.length, 0);
});

test('a normal scheduled test writes nothing at info', async (t) => {
  await freshStore();
  const logs = captureLogs(t);
  t.mock.timers.enable({ apis: ['setInterval'] });
  const gladys = createFakeGladys();
  setEngineForTests({ runSpeedtest: async () => FAKE_RESULT });

  const stop = speedtest.startPush(gladys, config);
  t.after(stop);
  assert.equal(logs.lines.length, 1, 'the schedule is logged once, at start');
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    t.mock.timers.tick(INTERVAL_MS);
    await settle();
  }
  assert.equal(gladys.fake.states.length, 20, 'five tests ran');
  assert.deepEqual(logs.texts(), []);
});

test('a test that keeps failing is logged once, and once when it works again', async (t) => {
  await freshStore();
  const logs = captureLogs(t);
  t.mock.timers.enable({ apis: ['setInterval'] });
  const gladys = createFakeGladys();
  let online = false;
  setEngineForTests({
    runSpeedtest: async () => {
      if (!online) throw new Error('getaddrinfo EAI_AGAIN www.speedtest.net');
      return FAKE_RESULT;
    },
  });

  const stop = speedtest.startPush(gladys, config);
  t.after(stop);
  logs.clear();
  for (let i = 0; i < 6; i += 1) {
    t.mock.timers.tick(INTERVAL_MS);
    await settle();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');
  assert.match(logs.lines[0].text, /EAI_AGAIN/);

  logs.clear();
  online = true;
  for (let i = 0; i < 3; i += 1) {
    t.mock.timers.tick(INTERVAL_MS);
    await settle();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /work again \(after 6 failed\)/);
});

test('LOG_LEVEL=debug shows each test and each failure', async (t) => {
  await freshStore();
  const logs = captureLogs(t, 'debug');
  t.mock.timers.enable({ apis: ['setInterval'] });
  const gladys = createFakeGladys();
  setEngineForTests({
    runSpeedtest: async () => {
      throw new Error('server down');
    },
  });
  const stop = speedtest.startPush(gladys, config);
  t.after(stop);
  for (let i = 0; i < 2; i += 1) {
    t.mock.timers.tick(INTERVAL_MS);
    await settle();
  }
  const text = logs.texts().join('\n');
  assert.match(text, /\[DEBUG\].*Scheduled speed test starting/);
  assert.match(text, /\[DEBUG\].*failed again \(2 in a row\)/);
});
