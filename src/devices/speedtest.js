// -----------------------------------------------------------------------------
// Device type: SPEEDTEST
// A single virtual device carrying four read-only sensors, refreshed by
// polling: download / upload bitrate (Mbit/s), ping and jitter (ms).
// The heavy lifting lives in src/speedtest.js (the engine).
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import * as defaultEngine from '../speedtest.js';

const DEVICE_TYPE = 'speedtest';

// There is exactly ONE virtual device per installation: the internet
// connection itself. The platform id is therefore a constant.
const PLATFORM_DEVICE_ID = 'internet-connection';

const logger = createLogger({ name: DEVICE_TYPE });

// Feature keys, kept in one place so discovery and publication always agree.
const FEATURE = {
  DOWNLOAD: 'download',
  UPLOAD: 'upload',
  PING: 'ping',
  JITTER: 'jitter',
};

// Engine indirection: tests swap the real network engine for a fake one
// (same pattern as the template's `simulateLanSession` hook).
let engine = defaultEngine;
export function setEngineForTests(fakeEngine) {
  engine = fakeEngine ?? defaultEngine;
}

// A speed test saturates the link for ~25 s: never run two at once. The
// pending run is shared, so a manual action during a poll reuses its result.
let currentRun = null;

/**
 * Run one speed test (unless one is already running) and publish the four
 * sensor values to Gladys.
 */
async function runAndPublish(gladys, config) {
  if (currentRun) {
    logger.info('A speed test is already running, reusing it');
    return currentRun;
  }
  currentRun = (async () => {
    const result = await engine.runSpeedtest(config);
    const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
    await gladys.publishStates([
      { device_feature_external_id: ids.feature(FEATURE.DOWNLOAD), state: result.download },
      { device_feature_external_id: ids.feature(FEATURE.UPLOAD), state: result.upload },
      { device_feature_external_id: ids.feature(FEATURE.PING), state: result.ping },
      { device_feature_external_id: ids.feature(FEATURE.JITTER), state: result.jitter },
    ]);
    return result;
  })();
  try {
    return await currentRun;
  } finally {
    currentRun = null;
  }
}

export const speedtest = {
  key: DEVICE_TYPE,

  deviceExternalId(gladys) {
    return gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID).device;
  },

  buildDevice(gladys, config) {
    const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
    return {
      name: 'Speedtest',
      external_id: ids.device,
      // Automatic tests are plain Gladys polling; omitting poll_frequency
      // disables them, leaving only the manual action.
      ...(config.auto_test ? { poll_frequency: config.poll_frequency } : {}),
      features: [
        {
          name: 'Download',
          external_id: ids.feature(FEATURE.DOWNLOAD),
          category: DEVICE_FEATURE_CATEGORIES.DATARATE,
          type: DEVICE_FEATURE_TYPES.DATARATE.RATE,
          unit: DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND,
          min: 0,
          max: 10000,
          read_only: true,
          has_feedback: false,
          keep_history: true, // the whole point: chart the line over time
        },
        {
          name: 'Upload',
          external_id: ids.feature(FEATURE.UPLOAD),
          category: DEVICE_FEATURE_CATEGORIES.DATARATE,
          type: DEVICE_FEATURE_TYPES.DATARATE.RATE,
          unit: DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND,
          min: 0,
          max: 10000,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Ping',
          external_id: ids.feature(FEATURE.PING),
          category: DEVICE_FEATURE_CATEGORIES.DURATION,
          type: DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
          unit: DEVICE_FEATURE_UNITS.MILLISECONDS,
          min: 0,
          max: 60000,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
        {
          name: 'Jitter',
          external_id: ids.feature(FEATURE.JITTER),
          category: DEVICE_FEATURE_CATEGORIES.DURATION,
          type: DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
          unit: DEVICE_FEATURE_UNITS.MILLISECONDS,
          min: 0,
          max: 60000,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
      ],
    };
  },

  async onPoll(gladys, config) {
    logger.info('Scheduled speed test starting...');
    await runAndPublish(gladys, config);
  },

  // Manifest actions (buttons in the Configuration screen).
  actions: {
    async run_speedtest(gladys, { config }) {
      logger.info('Manual speed test requested');
      const { download, upload, ping, server } = await runAndPublish(gladys, config);
      const where = `${server.sponsor}, ${server.name}`;
      return {
        en: `↓ ${download} Mbit/s · ↑ ${upload} Mbit/s · ping ${ping} ms (server: ${where})`,
        fr: `↓ ${download} Mbit/s · ↑ ${upload} Mbit/s · ping ${ping} ms (serveur : ${where})`,
      };
    },

    async list_servers(gladys, { config }) {
      logger.info('Listing nearby Speedtest.net servers');
      const servers = await engine.listServers({ limit: 10 });
      const lines = servers
        .map((s) => `${s.id} — ${s.sponsor} (${s.name}, ${s.country}) · ${s.distance} km`)
        .join('\n');
      const currentEn = config.server_id
        ? `Configured server: ${config.server_id}.`
        : 'Auto-selection is active.';
      const currentFr = config.server_id
        ? `Serveur configuré : ${config.server_id}.`
        : 'La sélection automatique est active.';
      return {
        en: `${currentEn} Closest servers (ID — sponsor):\n${lines}`,
        fr: `${currentFr} Serveurs les plus proches (ID — opérateur) :\n${lines}`,
      };
    },
  },
};
