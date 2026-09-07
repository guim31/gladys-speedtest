import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_UNITS } from '@gladysassistant/integration-sdk';
import {
  DEVICE_BLUEPRINTS,
  buildDiscoveredDevices,
  findBlueprintByDevice,
} from '../src/devices/index.js';
import { speedtest, setEngineForTests } from '../src/devices/speedtest.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const config = normalizeConfig();

const FAKE_RESULT = {
  ping: 12.3,
  jitter: 1.4,
  download: 842.5,
  upload: 512.25,
  server: {
    id: '32565',
    host: 'example:8080',
    sponsor: 'Free',
    name: 'Marseille',
    country: 'France',
    distance: 267,
  },
};

afterEach(() => setEngineForTests(null));

test('every blueprint exposes the required shape', () => {
  for (const bp of DEVICE_BLUEPRINTS) {
    assert.equal(typeof bp.key, 'string', 'key must be a string');
    assert.equal(typeof bp.deviceExternalId, 'function', 'deviceExternalId must be a function');
    assert.equal(typeof bp.buildDevice, 'function', 'buildDevice must be a function');
  }
});

test('buildDiscoveredDevices returns one payload per blueprint', () => {
  const gladys = createFakeGladys();
  const devices = buildDiscoveredDevices(gladys, config);
  assert.equal(devices.length, DEVICE_BLUEPRINTS.length);
  for (const device of devices) {
    assert.equal(typeof device.name, 'string');
    assert.ok(device.external_id, 'each device has an external_id');
    assert.ok(Array.isArray(device.features) && device.features.length > 0);
  }
});

test('findBlueprintByDevice routes an external_id back to its owner blueprint', () => {
  const gladys = createFakeGladys();
  const external_id = speedtest.deviceExternalId(gladys);
  assert.equal(findBlueprintByDevice(gladys, { external_id }), speedtest);
  assert.equal(findBlueprintByDevice(gladys, { external_id: 'does-not-exist' }), undefined);
});

test('the device carries the four expected read-only sensors', () => {
  const gladys = createFakeGladys();
  const device = speedtest.buildDevice(gladys, config);
  assert.equal(device.features.length, 4);

  const byCategory = (cat) => device.features.filter((f) => f.category === cat);
  const rates = byCategory(DEVICE_FEATURE_CATEGORIES.DATARATE);
  const durations = byCategory(DEVICE_FEATURE_CATEGORIES.DURATION);
  assert.equal(rates.length, 2, 'download + upload');
  assert.equal(durations.length, 2, 'ping + jitter');

  for (const feature of device.features) {
    assert.equal(feature.read_only, true);
    assert.equal(feature.keep_history, true, 'history is the whole point of the integration');
    assert.ok(feature.external_id.startsWith(device.external_id), 'features belong to the device');
  }
  for (const rate of rates) {
    assert.equal(rate.unit, DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND);
  }
  for (const duration of durations) {
    assert.equal(duration.unit, DEVICE_FEATURE_UNITS.MILLISECONDS);
  }
});

test('the device never declares a poll_frequency (Gladys caps polling at 60 s)', () => {
  const gladys = createFakeGladys();
  const device = speedtest.buildDevice(gladys, config);
  assert.equal(device.poll_frequency, undefined);
});

test('startPush schedules a test every poll_frequency seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const gladys = createFakeGladys();
  let calls = 0;
  setEngineForTests({
    runSpeedtest: async () => {
      calls += 1;
      return FAKE_RESULT;
    },
  });

  const stop = speedtest.startPush(gladys, normalizeConfig({ poll_frequency: 3600 }));
  t.mock.timers.tick(3600 * 1000);
  await Promise.resolve(); // let the async run settle
  assert.equal(calls, 1, 'one test after one interval');

  stop();
  t.mock.timers.tick(3600 * 1000);
  assert.equal(calls, 1, 'no test after the schedule is stopped');
});

test('startPush is a no-op when automatic tests are disabled', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const gladys = createFakeGladys();
  let calls = 0;
  setEngineForTests({
    runSpeedtest: async () => {
      calls += 1;
      return FAKE_RESULT;
    },
  });

  const stop = speedtest.startPush(gladys, normalizeConfig({ auto_test: false }));
  t.mock.timers.tick(86400 * 1000);
  assert.equal(calls, 0);
  stop();
});

test('a scheduled run publishes the four states', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const gladys = createFakeGladys();
  setEngineForTests({ runSpeedtest: async () => FAKE_RESULT });

  const stop = speedtest.startPush(gladys, config);
  t.mock.timers.tick(config.poll_frequency * 1000);
  stop();
  // Drain the microtask chain of the async run (engine -> publishStates).
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }

  assert.equal(gladys.published.length, 4);
  const byId = Object.fromEntries(gladys.published.map((p) => [p.featureExternalId, p.state]));
  const ids = gladys.externalIds('speedtest', 'internet-connection');
  assert.equal(byId[ids.feature('download')], FAKE_RESULT.download);
  assert.equal(byId[ids.feature('upload')], FAKE_RESULT.upload);
  assert.equal(byId[ids.feature('ping')], FAKE_RESULT.ping);
  assert.equal(byId[ids.feature('jitter')], FAKE_RESULT.jitter);
});

test('concurrent runs share a single engine invocation', async () => {
  const gladys = createFakeGladys();
  let calls = 0;
  setEngineForTests({
    runSpeedtest: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return FAKE_RESULT;
    },
  });

  await Promise.all([
    speedtest.actions.run_speedtest(gladys, { fields: {}, config }),
    speedtest.actions.run_speedtest(gladys, { fields: {}, config }),
  ]);

  assert.equal(calls, 1, 'the second action must reuse the run already in flight');
  assert.equal(gladys.published.length, 4, 'states are published once');
});

test('the run_speedtest action returns a multi-language summary', async () => {
  const gladys = createFakeGladys();
  setEngineForTests({ runSpeedtest: async () => FAKE_RESULT });

  const message = await speedtest.actions.run_speedtest(gladys, { fields: {}, config });
  assert.match(message.en, /842\.5/);
  assert.match(message.en, /512\.25/);
  assert.match(message.fr, /12\.3/);
  assert.match(message.fr, /Free, Marseille/);
});

test('the list_servers action lists IDs and reflects the configured server', async () => {
  const gladys = createFakeGladys();
  setEngineForTests({
    listServers: async () => [FAKE_RESULT.server],
  });

  const auto = await speedtest.actions.list_servers(gladys, { fields: {}, config });
  assert.match(auto.en, /Auto-selection/);
  assert.match(auto.en, /32565 — Free \(Marseille, France\)/);

  const pinned = await speedtest.actions.list_servers(gladys, {
    fields: {},
    config: normalizeConfig({ server_id: '32565' }),
  });
  assert.match(pinned.fr, /Serveur configuré : 32565/);
});
