// -----------------------------------------------------------------------------
// Dashboard widget (Gladys 5.1+), content builders — pure functions.
//
//   - speed : the connection at a glance: two tiles (download, upload), a
//             history area chart of two sensors (a widget setting picks the
//             pair and the window), then ping, jitter, when the last test ran
//             and against which server as status rows, and a button to run one.
//
// The two tiles carry the figures of the last result, formatted here: a tile
// bound to a feature shows the core's "716.6 Mbit/s", which the tile cuts on
// a phone (see SPEED_TILE_* below). Ping and jitter go to status rows, so the
// tiles fill one line two by two and never leave one alone on a second line.
// The content changes when a test starts or ends (requestWidgetRefresh), the
// chart reads the history Gladys keeps — building it costs no network call.
// The `primary` button style is never
// used (Gladys paints it like the others in dark mode): a test under way is
// shown by the button icon and a status row in the `info` color.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LANGUAGES, format, pickLanguage } from './i18n.js';

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

/** The chart type of both chart settings (core WIDGET_CHART_TYPES). */
export const CHART_TYPE = 'area';

// What a speed tile holds without being cut, in the core front 5.1.4
// (external-widget/style.css). A tile is `flex: 1 1 96px` (border-box) in a
// wrapping row with an 8px gap, 8px of side padding and a 1px border: two
// tiles sit side by side from a 200px-wide card body up, each then at least
// 96px wide, so 96 - 2 × 8 - 2 × 1 = 78px for its text; below 200px each
// tile takes the whole line, wider still. The value is 1.25rem (20px)
// semibold, the unit 0.75rem (12px), 2px apart. Rendered in Chromium with
// that CSS, "838 Mb/s" takes 61px in Arial metrics and 72px in DejaVu Sans
// (a wide font, for the margin); "10,0 Gb/s" takes 79px in DejaVu Sans, one
// too many. Hence 3 characters for the value and 4 for the unit, and
// test/widgets.test.js holds every formatted speed to them.
export const SPEED_TILE_VALUE_MAX = 3;
export const SPEED_TILE_UNIT_MAX = 4;

/** The tile of a speed not measured yet. */
const NO_VALUE = '—';

/** Every text of the widget, in the four languages (test/i18n.test.js). */
export const TEXTS = {
  download: { en: 'Download', fr: 'Descendant', de: 'Download', es: 'Descarga' },
  upload: { en: 'Upload', fr: 'Montant', de: 'Upload', es: 'Subida' },
  ping: { en: 'Ping', fr: 'Ping', de: 'Ping', es: 'Ping' },
  jitter: { en: 'Jitter', fr: 'Gigue', de: 'Jitter', es: 'Jitter' },
  speedsChart: {
    en: 'Download / Upload',
    fr: 'Débit descendant / montant',
    de: 'Download / Upload',
    es: 'Descarga / Subida',
  },
  latencyChart: {
    en: 'Ping / Jitter',
    fr: 'Ping / Gigue',
    de: 'Ping / Jitter',
    es: 'Ping / Jitter',
  },
  lastTest: { en: 'Last test', fr: 'Dernier test', de: 'Letzter Test', es: 'Última prueba' },
  server: { en: 'Server', fr: 'Serveur', de: 'Server', es: 'Servidor' },
  publicIp: { en: 'Public IP', fr: 'IP publique', de: 'Öffentliche IP', es: 'IP pública' },
  status: { en: 'Status', fr: 'État', de: 'Status', es: 'Estado' },
  running: { en: 'Test in progress', fr: 'Test en cours', de: 'Test läuft', es: 'Prueba en curso' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  justNow: { en: 'just now', fr: "à l'instant", de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  runTest: { en: 'Run a test', fr: 'Lancer un test', de: 'Test starten', es: 'Iniciar prueba' },
  empty: {
    en: 'No result since the integration started: run a test, or wait for the next scheduled one.',
    fr: "Aucun résultat depuis le démarrage de l'intégration : lancez un test, ou attendez le prochain test planifié.",
    de: 'Noch kein Ergebnis seit dem Start der Integration: Starte einen Test oder warte auf den nächsten geplanten.',
    es: 'Ningún resultado desde el inicio de la integración: inicie una prueba o espere a la próxima programada.',
  },
};

/** The locale of the dates and figures, per language. */
const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/**
 * The language of a widget: Gladys sends the user's, the texts exist in four.
 * @param {string} language the user's language
 * @returns {'en'|'fr'|'de'|'es'}
 */
export function widgetLanguage(language) {
  return pickLanguage(language);
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
 * @param {string} [options.language] `en`, `fr`, `de` or `es`
 * @param {Date} [options.now] the current time (tests)
 * @param {string} [options.timeZone] an IANA time zone (default: the process one, TZ)
 * @returns {string}
 */
export function formatLastTest(at, { language = 'en', now = new Date(), timeZone } = {}) {
  const date = new Date(at);
  const lang = widgetLanguage(language);
  if (Number.isNaN(date.getTime())) {
    return TEXTS.unknown[lang];
  }
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes >= 0 && minutes < 1) {
    return TEXTS.justNow[lang];
  }
  if (minutes >= 1 && minutes < 60) {
    return format(TEXTS.minutesAgo, { n: minutes })[lang];
  }
  const formatted = new Intl.DateTimeFormat(LOCALES[lang], {
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
 * A speed as a tile shows it: whole Mb/s below 1 000, Gb/s with one decimal
 * in the language's format beyond (1,2 Gb/s), whole Gb/s from 10 Gb/s (the
 * tile has room for 3 characters), a dash when unknown. Only the
 * widget rounds: the states published to Gladys keep their decimals.
 * @param {number|null|undefined} mbps the speed in Mbit/s
 * @param {string} [language] `en`, `fr`, `de` or `es`
 * @returns {{ value: string, unit?: string }}
 */
export function formatSpeed(mbps, language = 'en') {
  if (typeof mbps !== 'number' || !Number.isFinite(mbps) || mbps < 0) {
    return { value: NO_VALUE };
  }
  const rounded = Math.round(mbps);
  if (rounded < 1000) {
    return { value: String(rounded), unit: 'Mb/s' };
  }
  const gbps = mbps / 1000;
  const digits = Math.round(gbps * 10) / 10 < 10 ? 1 : 0;
  const value = new Intl.NumberFormat(LOCALES[widgetLanguage(language)], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(gbps);
  return { value, unit: 'Gb/s' };
}

/**
 * A latency as a status row shows it: one decimal at most, in the
 * language's format ("14,5 ms").
 * @param {number|null|undefined} ms the latency in milliseconds
 * @param {string} [language] `en`, `fr`, `de` or `es`
 * @returns {string|null} null when unknown
 */
export function formatLatency(ms, language = 'en') {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return null;
  }
  const value = new Intl.NumberFormat(LOCALES[widgetLanguage(language)], {
    maximumFractionDigits: 1,
  }).format(ms);
  return fit(`${value} ms`, STATUS_VALUE_MAX);
}

/**
 * A speed tile.
 * @param {Record<string, string>} label the tile label
 * @param {string} icon the tile icon
 * @param {number|null|undefined} mbps the speed in Mbit/s
 * @param {string} language the widget language
 * @returns {object} a `value` component
 */
function speedTile(label, icon, mbps, language) {
  const { value, unit } = formatSpeed(mbps, language);
  return { type: 'value', label, icon, value, ...(unit ? { unit } : {}) };
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
    speedTile(TEXTS.download, 'download', lastResult?.download, lang),
    speedTile(TEXTS.upload, 'upload', lastResult?.upload, lang),
    chart === 'latency'
      ? {
          type: 'chart',
          device_features: [features.ping, features.jitter],
          interval,
          chart_type: CHART_TYPE,
          title: TEXTS.latencyChart,
          unit: 'ms',
        }
      : {
          type: 'chart',
          device_features: [features.download, features.upload],
          interval,
          chart_type: CHART_TYPE,
          title: TEXTS.speedsChart,
          unit: 'Mb/s',
        },
  ];

  const items = [];
  if (lastResult) {
    const ping = formatLatency(lastResult.ping, lang);
    if (ping) {
      items.push({ label: TEXTS.ping, value: ping, icon: 'clock' });
    }
    const jitter = formatLatency(lastResult.jitter, lang);
    if (jitter) {
      items.push({ label: TEXTS.jitter, value: jitter, icon: 'activity' });
    }
    items.push({
      label: TEXTS.lastTest,
      value: formatLastTest(lastResult.at, { language: lang, now, timeZone }),
      icon: 'calendar',
    });
    const server = formatServer(lastResult.server);
    if (server) {
      items.push({ label: TEXTS.server, value: server, icon: 'server' });
    }
    // Only stored when the user turned the option on (Cloudflare engine).
    if (lastResult.ip) {
      items.push({
        label: TEXTS.publicIp,
        value: fit(lastResult.ip, STATUS_VALUE_MAX),
        icon: 'globe',
      });
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
 * @returns {Record<string, string>} one text per language
 */
export function resultToast(result) {
  const { download, upload, ping } = result;
  const server = formatServer(result.server);
  const where = (server ? ` · ${server}` : '') + (result.ip ? ` · IP ${result.ip}` : '');
  // Figures, units and the server name read the same in every language.
  const text = fit(
    `↓ ${download} Mbit/s · ↑ ${upload} Mbit/s · ping ${ping} ms${where}`,
    TOAST_MAX,
  );
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, text]));
}

/** The toast when a test is asked while one already runs. */
export const ALREADY_RUNNING_TOAST = {
  en: 'A test is already running, its result will show in a moment.',
  fr: "Un test est déjà en cours, son résultat s'affichera dans un instant.",
  de: 'Es läuft bereits ein Test, sein Ergebnis erscheint gleich.',
  es: 'Ya hay una prueba en curso, su resultado aparecerá en un momento.',
};
