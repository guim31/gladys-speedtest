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
import * as speedtestEngine from '../speedtest.js';
import { runCloudflareTest } from '../cloudflare.js';
import { format } from '../i18n.js';
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

// The messages of the Configuration buttons, in the four languages
// (test/i18n.test.js). `{name}` placeholders are filled in by format().
export const ACTION_TEXTS = {
  testResult: {
    en: '↓ {download} Mbit/s · ↑ {upload} Mbit/s · ping {ping} ms (server: {where})',
    fr: '↓ {download} Mbit/s · ↑ {upload} Mbit/s · ping {ping} ms (serveur : {where})',
    de: '↓ {download} Mbit/s · ↑ {upload} Mbit/s · Ping {ping} ms (Server: {where})',
    es: '↓ {download} Mbit/s · ↑ {upload} Mbit/s · ping {ping} ms (servidor: {where})',
  },
  configuredServer: {
    en: 'Configured server: {id}. Closest servers (ID — sponsor):\n{lines}',
    fr: 'Serveur configuré : {id}. Serveurs les plus proches (ID — opérateur) :\n{lines}',
    de: 'Konfigurierter Server: {id}. Nächstgelegene Server (ID — Betreiber):\n{lines}',
    es: 'Servidor configurado: {id}. Servidores más cercanos (ID — operador):\n{lines}',
  },
  cloudflareEngine: {
    en: 'The Cloudflare engine is selected: it picks its point of presence by itself, these servers only serve the Speedtest.net engine.\n{lines}',
    fr: "Le moteur Cloudflare est choisi : il trouve seul son point de présence, ces serveurs ne servent qu'au moteur Speedtest.net.\n{lines}",
    de: 'Die Cloudflare-Engine ist gewählt und findet ihren Standort selbst; diese Server gelten nur für die Speedtest.net-Engine.\n{lines}',
    es: 'El motor Cloudflare está seleccionado: elige por sí mismo su punto de presencia; estos servidores solo sirven para el motor Speedtest.net.\n{lines}',
  },
  autoSelection: {
    en: 'Auto-selection is active. Closest servers (ID — sponsor):\n{lines}',
    fr: 'La sélection automatique est active. Serveurs les plus proches (ID — opérateur) :\n{lines}',
    de: 'Die automatische Auswahl ist aktiv. Nächstgelegene Server (ID — Betreiber):\n{lines}',
    es: 'La selección automática está activa. Servidores más cercanos (ID — operador):\n{lines}',
  },
};

// Feature keys, kept in one place so discovery and publication always agree.
const FEATURE = {
  DOWNLOAD: 'download',
  UPLOAD: 'upload',
  PING: 'ping',
  JITTER: 'jitter',
};

// Engine indirection: tests swap the real network engines for fake ones
// (same pattern as the template's `simulateLanSession` hook).
const defaultEngine = {
  runSpeedtest: speedtestEngine.runSpeedtest,
  listServers: speedtestEngine.listServers,
  runCloudflareTest,
};
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
    logger.debug('A speed test is already running, reusing it');
    return currentRun;
  }
  currentRun = (async () => {
    // "Last test" dates the launch of the test, not its end.
    const at = new Date().toISOString();
    const { ip, ...measured } =
      config.engine === 'cloudflare'
        ? await engine.runCloudflareTest(config)
        : await engine.runSpeedtest(config);
    // The public IP is kept (in memory and in /data) only on request.
    const result = config.show_ip && ip ? { ...measured, ip } : measured;
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
      // Never polled by Gladys: its polling only accepts intervals up to a
      // minute (60000 ms), useless for an hourly test, and needs
      // should_poll: true AND a poll_frequency. The schedule lives in
      // startPush() below, inside the container, so the device says so
      // explicitly and carries no poll_frequency.
      should_poll: false,
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
  // test every poll_frequency seconds (the config field, in seconds; nothing
  // to do with the device poll_frequency of Gladys). The first automatic run
  // happens after a full interval — the manual button covers the "right now"
  // need, and a config save must not silently burn hundreds of MB.
  //
  // Logs: a normal run writes nothing at info (LOG_LEVEL=debug shows it). A
  // failure that repeats (connection down for hours) is logged once, then
  // once when the tests work again.
  startPush(gladys, config) {
    // Called on every connection and config save: the option turned off
    // forgets the IP kept by an earlier test, in memory and in /data.
    if (!config.show_ip && lastResult?.ip) {
      lastResult = store.save({ ...lastResult, ip: null }) ?? { ...lastResult, ip: null };
    }
    if (!config.auto_test) {
      logger.info('Automatic tests disabled');
      return () => {};
    }
    logger.info(`Automatic test scheduled every ${config.poll_frequency} s`);
    let failures = 0;
    const timer = setInterval(() => {
      logger.debug('Scheduled speed test starting...');
      runAndPublish(gladys, config).then(
        () => {
          if (failures > 0) {
            logger.info(`Scheduled speed tests work again (after ${failures} failed)`);
          }
          failures = 0;
        },
        (err) => {
          failures += 1;
          if (failures === 1) {
            logger.error(`Scheduled speed test failed: ${err.message}`);
          } else {
            logger.debug(
              `Scheduled speed test failed again (${failures} in a row): ${err.message}`,
            );
          }
        },
      );
    }, config.poll_frequency * 1000);
    return () => clearInterval(timer);
  },

  // The device has just been added in Gladys: the states published before
  // were dropped by the core (unknown features), so publish the last result
  // again rather than leaving the sensors empty until the next test.
  async onDeviceCreated(gladys) {
    if (!lastResult) {
      return;
    }
    const states = Object.values(FEATURE)
      .filter((key) => Number.isFinite(lastResult[key]))
      .map((key) => ({
        device_feature_external_id: gladys
          .externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID)
          .feature(key),
        state: lastResult[key],
      }));
    if (states.length > 0) {
      await gladys.publishStates(states);
    }
    refreshWidget(gladys);
  },

  // Manifest actions (buttons in the Configuration screen).
  actions: {
    async run_speedtest(gladys, { config }) {
      logger.info('Manual speed test requested');
      const { download, upload, ping, server, ip } = await runAndPublish(gladys, config);
      const where = [server.sponsor, server.name].filter(Boolean).join(', ');
      const message = format(ACTION_TEXTS.testResult, { download, upload, ping, where });
      // "IP" reads the same in the four languages.
      return ip
        ? Object.fromEntries(
            Object.entries(message).map(([lang, text]) => [lang, `${text} · IP ${ip}`]),
          )
        : message;
    },

    async list_servers(gladys, { config }) {
      logger.info('Listing nearby Speedtest.net servers');
      const describe = (servers) =>
        servers
          .map((s) => `${s.id} — ${s.sponsor} (${s.name}, ${s.country}) · ${s.distance} km`)
          .join('\n');
      if (config.engine === 'cloudflare') {
        // The list is a bonus here: say which engine runs even without it.
        const lines = await engine.listServers({ limit: 10 }).then(describe, () => '');
        return format(ACTION_TEXTS.cloudflareEngine, { lines });
      }
      const lines = describe(await engine.listServers({ limit: 10 }));
      return config.server_id
        ? format(ACTION_TEXTS.configuredServer, { id: config.server_id, lines })
        : format(ACTION_TEXTS.autoSelection, { lines });
    },
  },

  // Dashboard widgets (Gladys 5.1+), keyed by the widget `key` declared in
  // gladys-assistant-integration.json: `get` resolves the content,
  // `action` answers its buttons. Both are served from memory: no network.
  widgets: {
    [WIDGET.SPEED]: {
      get(gladys, { settings, language, config }) {
        const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_DEVICE_ID);
        return buildSpeedContent({
          features: {
            download: ids.feature(FEATURE.DOWNLOAD),
            upload: ids.feature(FEATURE.UPLOAD),
            ping: ids.feature(FEATURE.PING),
            jitter: ids.feature(FEATURE.JITTER),
          },
          lastResult: lastResult?.ip && !config?.show_ip ? { ...lastResult, ip: null } : lastResult,
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
