// Scene trigger "test_failed" (automatic tests only) and scene action
// "run_test" (its result as outputs), against the fake Gladys of the SDK.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  SCENE_ACTION,
  SCENE_TRIGGER,
  speedtest,
  setEngineForTests,
  setStoreForTests,
} from '../src/devices/speedtest.js';
import { normalizeConfig } from '../src/config.js';
import { createResultStore } from '../src/store.js';

const config = normalizeConfig();
const RESULT = { ping: 12.3, jitter: 1.4, download: 842.5, upload: 512.25, server: {} };

let dataDir;
before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'speedtest-scenes-'));
  setStoreForTests(createResultStore(dataDir));
});
after(async () => {
  setStoreForTests(null);
  await rm(dataDir, { recursive: true, force: true });
});
afterEach(() => setEngineForTests(null));

async function settle() {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('a failed automatic test fires "test_failed", a good one does not', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const gladys = createFakeGladys();
  let online = false;
  setEngineForTests({
    runSpeedtest: async () => {
      if (!online) throw new Error('getaddrinfo EAI_AGAIN www.speedtest.net');
      return RESULT;
    },
  });
  const stop = speedtest.startPush(gladys, config);
  t.after(stop);
  for (let i = 0; i < 2; i += 1) {
    t.mock.timers.tick(config.poll_frequency * 1000);
    await settle();
  }
  const events = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGER.TEST_FAILED);
  assert.equal(events.length, 2);
  assert.match(events[0].data.error, /EAI_AGAIN/);
  assert.deepEqual(
    events.map((e) => e.data.failures),
    [1, 2],
  );
  online = true;
  t.mock.timers.tick(config.poll_frequency * 1000);
  await settle();
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('"run_test": the result as outputs; a failure is an output, never a loop', async () => {
  const gladys = createFakeGladys();
  for (const [key, handler] of Object.entries(speedtest.sceneActions)) {
    gladys.onSceneAction(key, (fields) => handler(gladys, { fields, config }));
  }
  setEngineForTests({ runSpeedtest: async () => RESULT });
  const ok = await gladys.fake.sceneAction(SCENE_ACTION.RUN_TEST, {});
  assert.equal(ok.success, true, ok.error);
  assert.deepEqual(ok.data.outputs, {
    success: true,
    download: 842.5,
    upload: 512.25,
    ping: 12.3,
    jitter: 1.4,
    error: '',
  });
  setEngineForTests({
    runSpeedtest: async () => {
      throw new Error('server down');
    },
  });
  const failed = await gladys.fake.sceneAction(SCENE_ACTION.RUN_TEST, {});
  assert.equal(failed.success, true, 'the action itself succeeds');
  assert.equal(failed.data.outputs.success, false);
  assert.match(failed.data.outputs.error, /server down/);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'no "test_failed" from a scene action');
});
