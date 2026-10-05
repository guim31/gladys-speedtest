// -----------------------------------------------------------------------------
// Dashboard widget (Gladys 5.1+), content builders — pure functions.
//
//   - speed : the connection at a glance: four live tiles bound to the sensors
//             (download, upload, ping, jitter), a history chart of two of them
//             (a widget setting picks the pair and the window), when the last
//             test ran and against which server, and a button to run one.
//
// Everything that moves is bound to the device features: the tiles and the
// chart follow the published states over the core's real-time path, so the
// content only changes when a test starts or ends (requestWidgetRefresh) —
// building it costs no network call. The `primary` button style is never
// used (Gladys paints it like the others in dark mode): a test under way is
// shown by the button icon and a status row in the `info` color.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';

/** Widget keys, declared in the manifest `widgets` (forever: never rename). */
export const WIDGET = {
  SPEED: 'speed',
};

/** Widget action keys (the buttons), unique within a content. */
export const WIDGET_ACTION = {
  RUN_TEST: 'run_test',
};

/** The `chart` setting: which pair of sensors the chart draws. */
export const CHARTS = ['speeds', 'latency'];
export const DEFAULT_CHART = 'speeds';

/** The `interval` setting: the history window of the chart. */
export const INTERVALS = ['last-day', 'last-week', 'last-month'];
export const DEFAULT_INTERVAL = 'last-week';

/** Freshness of the content: short while a test runs, long otherwise. */
export const TTL_RUNNING_SECONDS = 10;
export const TTL_IDLE_SECONDS = 300;

// Bounds of the core vocabulary the builders fit their texts to.
const STATUS_VALUE_MAX = 40;
const TOAST_MAX = 200;

const TEXTS = {
  download: { en: 'Download', fr: 'Descendant' },
  upload: { en: 'Upload', fr: 'Montant' },
  ping: { en: 'Ping', fr: 'Ping' },
  jitter: { en: 'Jitter', fr: 'Gigue' },
  speedsChart: { en: 'Download / Upload', fr: 'Débit descendant / montant' },
  latencyChart: { en: 'Ping / Jitter', fr: 'Ping / Gigue' },
  lastTest: { en: 'Last test', fr: 'Dernier test' },
  server: { en: 'Server', fr: 'Serveur' },
  status: { en: 'Status', fr: 'État' },
  running: { en: 'Test in progress', fr: 'Test en cours' },
  unknown: { en: 'Unknown', fr: 'Inconnu' },
  runTest: { en: 'Run a test', fr: 'Lancer un test' },
  empty: {
    en: 'No result since the integration started: run a test, or wait for the next scheduled one.',
    fr: "Aucun résultat depuis le démarrage de l'intégration : lancez un test, ou attendez le prochain test planifié.",
  },
};

/**
 * The language of a widget: Gladys sends the user's, the texts exist in two.
 * @param {string} language the user's language
 * @returns {'fr'|'en'}
 */
export function widgetLanguage(language) {
  return language === 'fr' ? 'fr' : 'en';
}

/**
 * A text cut to a bound (the core would cut it, and say so in its logs).
 * @param {string} text the text
 * @param {number} max the bound
 * @returns {string} the text, with an ellipsis when cut
 */
export function fit(text, max) {
  const value = String(text).trim();
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The widget settings as the builders use them: unknown or missing values
 * fall back to the defaults declared in the manifest.
 * @param {Record<string, unknown>} [settings] the instance settings
 * @returns {{ chart: string, interval: string }}
 */
export function normalizeSettings(settings = {}) {
  const chart = CHARTS.includes(settings?.chart) ? settings.chart : DEFAULT_CHART;
  const interval = INTERVALS.includes(settings?.interval) ? settings.interval : DEFAULT_INTERVAL;
  return { chart, interval };
}

/**
 * When the last test ran, in at most 40 characters: minutes ago under an
 * hour, a short localized date and time beyond.
 * @param {string|Date} at when the test ran
 * @param {object} [options]
 * @param {string} [options.language] `fr` or `en`
 * @param {Date} [options.now] the current time (tests)
 * @param {string} [options.timeZone] an IANA time zone (default: the process one, TZ)
 * @returns {string}
 */
export function formatLastTest(at, { language = 'en', now = new Date(), timeZone } = {}) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return TEXTS.unknown[widgetLanguage(language)];
  }
  const fr = widgetLanguage(language) === 'fr';
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes >= 0 && minutes < 1) {
    return fr ? "à l'instant" : 'just now';
  }
  if (minutes >= 1 && minutes < 60) {
    return fr ? `il y a ${minutes} min` : `${minutes} min ago`;
  }
  const formatted = new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
  return fit(formatted, STATUS_VALUE_MAX);
}

/**
 * The server of a result as the status shows it: "sponsor · city".
 * @param {{ sponsor?: string|null, name?: string|null, id?: string|null }} [server]
 * @returns {string|null} null when nothing is known of it
 */
export function formatServer(server) {
  const parts = [server?.sponsor, server?.name].filter(Boolean);
  if (parts.length === 0) {
    return server?.id ? fit(`#${server.id}`, STATUS_VALUE_MAX) : null;
  }
  return fit(parts.join(' · '), STATUS_VALUE_MAX);
}

/**
 * The content of the speed widget.
 * @param {object} view
 * @param {{ download: string, upload: string, ping: string, jitter: string }} view.features
 *   the external_id of each sensor
 * @param {object|null} view.lastResult the last result (see store.js), null when none
 * @param {boolean} view.running whether a test is under way
 * @param {Record<string, unknown>} [view.settings] the instance settings
 * @param {string} [view.language] the user's language
 * @param {Date} [view.now] the current time (tests)
 * @param {string} [view.timeZone] an IANA time zone (tests)
 * @returns {import('@gladysassistant/integration-sdk').WidgetContent}
 */
export function buildSpeedContent({
  features,
  lastResult,
  running,
  settings,
  language,
  now,
  timeZone,
}) {
  const { chart, interval } = normalizeSettings(settings);
  const lang = widgetLanguage(language);
  const components = [
    { type: 'value', label: TEXTS.download, icon: 'download', device_feature: features.download },
    { type: 'value', label: TEXTS.upload, icon: 'upload', device_feature: features.upload },
    { type: 'value', label: TEXTS.ping, icon: 'clock', device_feature: features.ping },
    { type: 'value', label: TEXTS.jitter, icon: 'activity', device_feature: features.jitter },
    chart === 'latency'
      ? {
          type: 'chart',
          device_features: [features.ping, features.jitter],
          interval,
          chart_type: 'line',
          title: TEXTS.latencyChart,
          unit: 'ms',
        }
      : {
          type: 'chart',
          device_features: [features.download, features.upload],
          interval,
          chart_type: 'line',
          title: TEXTS.speedsChart,
          unit: 'Mbit/s',
        },
  ];

  const items = [];
  if (lastResult) {
    items.push({
      label: TEXTS.lastTest,
      value: formatLastTest(lastResult.at, { language: lang, now, timeZone }),
      icon: 'calendar',
    });
    const server = formatServer(lastResult.server);
    if (server) {
      items.push({ label: TEXTS.server, value: server, icon: 'server' });
    }
  }
  if (running) {
    items.push({
      label: TEXTS.status,
      value: TEXTS.running,
      icon: 'loader',
      color: WIDGET_COLORS.INFO,
    });
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  } else {
    components.push({ type: 'text', variant: 'body', text: TEXTS.empty });
  }

  components.push({
    type: 'button',
    label: TEXTS.runTest,
    icon: running ? 'loader' : 'play',
    action: { key: WIDGET_ACTION.RUN_TEST },
  });

  return {
    ttl_seconds: running ? TTL_RUNNING_SECONDS : TTL_IDLE_SECONDS,
    components,
  };
}

/**
 * The toast of a finished test (≤ 200 characters per language).
 * @param {{ download: number, upload: number, ping: number, server?: object }} result
 * @returns {{ en: string, fr: string }}
 */
export function resultToast(result) {
  const { download, upload, ping } = result;
  const server = formatServer(result.server);
  const where = server ? ` · ${server}` : '';
  return {
    en: fit(`↓ ${download} Mbit/s · ↑ ${upload} Mbit/s · ping ${ping} ms${where}`, TOAST_MAX),
    fr: fit(`↓ ${download} Mbit/s · ↑ ${upload} Mbit/s · ping ${ping} ms${where}`, TOAST_MAX),
  };
}

/** The toast when a test is asked while one already runs. */
export const ALREADY_RUNNING_TOAST = {
  en: 'A test is already running, its result will show in a moment.',
  fr: "Un test est déjà en cours, son résultat s'affichera dans un instant.",
};
