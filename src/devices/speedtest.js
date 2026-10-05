// -----------------------------------------------------------------------------
// Device type: SPEEDTEST
// A single virtual device carrying four read-only sensors, refreshed by an
// internal schedule: download / upload bitrate (Mbit/s), ping and jitter (ms).
// The heavy lifting lives in src/speedtest.js (the engine).
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import * as defaultEngine from '../speedtest.js';
import { createResultStore } from '../store.js';
import {
  ALREADY_RUNNING_TOAST,
  WIDGET,
  WIDGET_ACTION,
  buildSpeedContent,
  resultToast,
} from '../widgets.js';

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

// The last result, kept in /data so the widget is filled after a restart.
// Tests point the store at a temporary folder.
let store = createResultStore();
let lastResult = store.load();
export function setStoreForTests(fakeStore) {
  store = fakeStore ?? createResultStore();
  lastResult = store.load();
}

// A speed test saturates the link for ~25 s: never run two at once. The
// pending run is shared, so a manual action during a poll reuses its result.
let currentRun = null;

/** Whether a test is under way (the widget shows it). */
export function isRunning() {
  return currentRun !== null;
}

/** The last result known (see store.js), null when none. */
export function getLastResult() {
  return lastResult;
}

/**
 * Ask the core to re-pull the widget: a fire-and-forget nudge, rate-limited
 * core-side, that a Gladys older than 5.1 (or a test double) may not offer.
 */
function refreshWidget(gladys) {
  try {
    gladys.requestWidgetRefresh?.(WIDGET.SPEED);
  } catch (err) {
    logger.debug(`Widget refresh request failed: ${err.message}`);
  }
}

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
    // "Last test" dates the launch of the test, not its end.
    const at = new Date().toISOString();
    const result = await engine.runSpeedtest(config);
    const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
    await gladys.publishStates([
      { device_feature_external_id: ids.feature(FEATURE.DOWNLOAD), state: result.download },
      { device_feature_external_id: ids.feature(FEATURE.UPLOAD), state: result.upload },
      { device_feature_external_id: ids.feature(FEATURE.PING), state: result.ping },
      { device_feature_external_id: ids.feature(FEATURE.JITTER), state: result.jitter },
    ]);
    lastResult = store.save({ ...result, at }) ?? lastResult;
    return result;
  })();
  // The widget shows "test in progress" right away, then the result: two
  // nudges at least ~14 s apart (a test lasts ~2 × (2 s warmup + duration)
  // plus the ping samples: ~15 s at the minimum duration of 5 s, ~24 s by
  // default), under the core's rate limit of one per 10 s.
  refreshWidget(gladys);
  try {
    return await currentRun;
  } finally {
    currentRun = null;
    refreshWidget(gladys);
  }
}

export const speedtest = {
  key: DEVICE_TYPE,

  deviceExternalId(gladys) {
    return gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID).device;
  },

  buildDevice(gladys, _config) {
    const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
    return {
      name: 'Speedtest',
      external_id: ids.device,
      // No poll_frequency: Gladys polling only accepts sub-minute intervals
      // (60000 ms max), useless for an hourly test. The schedule lives in
      // startPush() below, inside the container.
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

  // Internal scheduler (the "push subscription" of this integration): one
  // test every poll_frequency seconds. The first automatic run happens after
  // a full interval — the manual button covers the "right now" need, and a
  // config save must not silently burn hundreds of MB.
  startPush(gladys, config) {
    if (!config.auto_test) {
      logger.info('Automatic tests disabled');
      return () => {};
    }
    logger.info(`Automatic test scheduled every ${config.poll_frequency} s`);
    const timer = setInterval(() => {
      logger.info('Scheduled speed test starting...');
      runAndPublish(gladys, config).catch((err) => {
        logger.error('Scheduled speed test failed', err);
      });
    }, config.poll_frequency * 1000);
    return () => clearInterval(timer);
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

  // Dashboard widgets (Gladys 5.1+), keyed by the widget `key` declared in
  // gladys-assistant-integration.json: `get` resolves the content,
  // `action` answers its buttons. Both are served from memory: no network.
  widgets: {
    [WIDGET.SPEED]: {
      get(gladys, { settings, language }) {
        const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
        return buildSpeedContent({
          features: {
            download: ids.feature(FEATURE.DOWNLOAD),
            upload: ids.feature(FEATURE.UPLOAD),
            ping: ids.feature(FEATURE.PING),
            jitter: ids.feature(FEATURE.JITTER),
          },
          lastResult,
          running: isRunning(),
          settings,
          language,
        });
      },

      async action(gladys, { actionKey, config }) {
        if (actionKey !== WIDGET_ACTION.RUN_TEST) {
          throw new Error(`Unknown widget action "${actionKey}"`);
        }
        if (isRunning()) {
          // Politely decline: the running test will refresh the widget by
          // itself when it ends.
          return ALREADY_RUNNING_TOAST;
        }
        logger.info('Speed test requested from the dashboard widget');
        return resultToast(await runAndPublish(gladys, config));
      },
    },
  },
};
