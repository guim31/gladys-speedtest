// -----------------------------------------------------------------------------
// Dashboard widget content builders: pure functions, checked against the
// core vocabulary with the validator the SDK exports.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import {
  ALREADY_RUNNING_TOAST,
  CHARTS,
  DEFAULT_CHART,
  DEFAULT_INTERVAL,
  INTERVALS,
  TTL_IDLE_SECONDS,
  TTL_RUNNING_SECONDS,
  WIDGET_ACTION,
  buildSpeedContent,
  fit,
  formatLastTest,
  formatServer,
  normalizeSettings,
  resultToast,
  widgetLanguage,
} from '../src/widgets.js';

const FEATURES = {
  download: 'ext:speedtest:speedtest:internet-connection:download',
  upload: 'ext:speedtest:speedtest:internet-connection:upload',
  ping: 'ext:speedtest:speedtest:internet-connection:ping',
  jitter: 'ext:speedtest:speedtest:internet-connection:jitter',
};

const NOW = new Date('2026-10-05T14:30:00Z');

const LAST_RESULT = {
  at: '2026-10-05T14:05:00.000Z',
  download: 921.4,
  upload: 848.2,
  ping: 3.1,
  jitter: 0.4,
  server: { id: '32565', sponsor: 'Free', name: 'Marseille', country: 'France' },
};

const byType = (content, type) => content.components.filter((c) => c.type === type);

test('widgetLanguage falls back to English', () => {
  assert.equal(widgetLanguage('fr'), 'fr');
  assert.equal(widgetLanguage('en'), 'en');
  assert.equal(widgetLanguage('de'), 'en');
  assert.equal(widgetLanguage(undefined), 'en');
});

test('fit cuts long texts with an ellipsis and keeps short ones', () => {
  assert.equal(fit('short', 10), 'short');
  assert.equal(fit('  padded  ', 10), 'padded');
  const cut = fit('a'.repeat(50), 40);
  assert.equal(cut.length, 40);
  assert.ok(cut.endsWith('…'));
});

test('normalizeSettings applies the manifest defaults to unknown values', () => {
  assert.deepEqual(normalizeSettings(), { chart: DEFAULT_CHART, interval: DEFAULT_INTERVAL });
  assert.deepEqual(normalizeSettings({ chart: 'nope', interval: 'last-year' }), {
    chart: DEFAULT_CHART,
    interval: DEFAULT_INTERVAL,
  });
  assert.deepEqual(normalizeSettings({ chart: 'latency', interval: 'last-month' }), {
    chart: 'latency',
    interval: 'last-month',
  });
  assert.ok(CHARTS.includes(DEFAULT_CHART));
  assert.ok(INTERVALS.includes(DEFAULT_INTERVAL));
});

test('formatLastTest: relative under an hour, short localized date beyond, ≤ 40 chars', () => {
  const base = { now: NOW, timeZone: 'UTC' };
  assert.equal(formatLastTest('2026-10-05T14:29:40Z', { ...base, language: 'fr' }), "à l'instant");
  assert.equal(formatLastTest('2026-10-05T14:29:40Z', { ...base, language: 'en' }), 'just now');
  assert.equal(formatLastTest(LAST_RESULT.at, { ...base, language: 'fr' }), 'il y a 25 min');
  assert.equal(formatLastTest(LAST_RESULT.at, { ...base, language: 'en' }), '25 min ago');

  const olderFr = formatLastTest('2026-10-04T08:05:00Z', { ...base, language: 'fr' });
  const olderEn = formatLastTest('2026-10-04T08:05:00Z', { ...base, language: 'en' });
  assert.match(olderFr, /4 oct/);
  assert.match(olderFr, /08:05/);
  assert.match(olderEn, /4 Oct/);
  assert.match(olderEn, /08:05/);
  assert.ok(olderFr.length <= 40 && olderEn.length <= 40);

  // The time zone shifts the displayed hour (the supervisor injects TZ).
  assert.match(
    formatLastTest('2026-10-04T08:05:00Z', { now: NOW, timeZone: 'Europe/Paris', language: 'fr' }),
    /10:05/,
  );
  // A date from the future (clock skew) is not "x min ago".
  assert.match(formatLastTest('2026-10-05T15:00:00Z', { ...base, language: 'en' }), /5 Oct/);
  assert.equal(formatLastTest('garbage', { ...base, language: 'fr' }), 'Inconnu');
});

test('formatServer: "sponsor · city", the id alone as a fallback, null when unknown', () => {
  assert.equal(formatServer(LAST_RESULT.server), 'Free · Marseille');
  assert.equal(formatServer({ sponsor: 'Orange' }), 'Orange');
  assert.equal(formatServer({ id: '42' }), '#42');
  assert.equal(formatServer({}), null);
  assert.equal(formatServer(undefined), null);
  assert.ok(formatServer({ sponsor: 'x'.repeat(30), name: 'y'.repeat(30) }).length <= 40);
});

test('speed: nominal content — four live tiles, a speeds chart, status, button', () => {
  const content = buildSpeedContent({
    features: FEATURES,
    lastResult: LAST_RESULT,
    running: false,
    settings: {},
    language: 'fr',
    now: NOW,
    timeZone: 'UTC',
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.ttl_seconds, TTL_IDLE_SECONDS);
  assert.ok(content.components.length <= 8);

  const tiles = byType(content, 'value');
  assert.deepEqual(
    tiles.map((t) => t.device_feature),
    [FEATURES.download, FEATURES.upload, FEATURES.ping, FEATURES.jitter],
  );
  assert.deepEqual(
    tiles.map((t) => t.icon),
    ['download', 'upload', 'clock', 'activity'],
  );
  for (const tile of tiles) {
    assert.equal(tile.value, undefined, 'live tiles carry no inline value');
  }

  const [chart] = byType(content, 'chart');
  assert.deepEqual(chart.device_features, [FEATURES.download, FEATURES.upload]);
  assert.equal(chart.interval, DEFAULT_INTERVAL);
  assert.equal(chart.unit, 'Mbit/s');

  const [status] = byType(content, 'status');
  assert.equal(status.items.length, 2);
  assert.equal(status.items[0].label.fr, 'Dernier test');
  assert.equal(status.items[0].value, 'il y a 25 min');
  assert.equal(status.items[1].label.fr, 'Serveur');
  assert.equal(status.items[1].value, 'Free · Marseille');
  assert.equal(byType(content, 'text').length, 0, 'no empty-state text with a result');

  const [button] = byType(content, 'button');
  assert.equal(button.action.key, WIDGET_ACTION.RUN_TEST);
  assert.equal(button.icon, 'play');
  assert.equal(button.style, undefined, 'never the primary style (invisible in dark mode)');
  assert.equal(button.label.fr, 'Lancer un test');
});

test('speed: the chart setting switches to ping and jitter, with the interval', () => {
  const content = buildSpeedContent({
    features: FEATURES,
    lastResult: LAST_RESULT,
    running: false,
    settings: { chart: 'latency', interval: 'last-month' },
    language: 'en',
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const [chart] = byType(content, 'chart');
  assert.deepEqual(chart.device_features, [FEATURES.ping, FEATURES.jitter]);
  assert.equal(chart.interval, 'last-month');
  assert.equal(chart.unit, 'ms');
  assert.equal(byType(content, 'chart').length, 1, 'one focal component');
});

test('speed: a running test shows an info row, a loader icon and a short ttl', () => {
  const content = buildSpeedContent({
    features: FEATURES,
    lastResult: LAST_RESULT,
    running: true,
    language: 'fr',
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.ttl_seconds, TTL_RUNNING_SECONDS);
  const [status] = byType(content, 'status');
  const running = status.items.at(-1);
  assert.equal(running.value.fr, 'Test en cours');
  assert.equal(running.color, WIDGET_COLORS.INFO);
  const [button] = byType(content, 'button');
  assert.equal(button.icon, 'loader');
  assert.equal(button.action.key, WIDGET_ACTION.RUN_TEST, 'the button stays: the action declines');
});

test('speed: empty state — no result and no test running is an explicit text', () => {
  const content = buildSpeedContent({
    features: FEATURES,
    lastResult: null,
    running: false,
    language: 'fr',
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(byType(content, 'status').length, 0);
  const [text] = byType(content, 'text');
  assert.equal(text.variant, 'body');
  assert.match(text.text.fr, /Aucun résultat/);
  // The live tiles and the chart stay: Gladys keeps the history even when
  // the container forgot (first start after an update).
  assert.equal(byType(content, 'value').length, 4);
  assert.equal(byType(content, 'chart').length, 1);
  assert.equal(byType(content, 'button').length, 1);
});

test('speed: running with no previous result shows the status row only', () => {
  const content = buildSpeedContent({ features: FEATURES, lastResult: null, running: true });
  assert.deepEqual(validateWidgetContent(content), []);
  const [status] = byType(content, 'status');
  assert.equal(status.items.length, 1);
  assert.equal(status.items[0].value.en, 'Test in progress');
  assert.equal(byType(content, 'text').length, 0);
});

test('speed: a stored result with an unknown server shows the date only', () => {
  const content = buildSpeedContent({
    features: FEATURES,
    lastResult: { ...LAST_RESULT, server: { id: null, sponsor: null, name: null, country: null } },
    running: false,
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const [status] = byType(content, 'status');
  assert.equal(status.items.length, 1);
  assert.equal(status.items[0].label.en, 'Last test');
});

test('speed: every text exists in English and French, within the core bounds', () => {
  for (const running of [false, true]) {
    for (const lastResult of [LAST_RESULT, null]) {
      const content = buildSpeedContent({ features: FEATURES, lastResult, running, now: NOW });
      for (const component of content.components) {
        for (const text of [component.label, component.title, component.text]) {
          if (text !== undefined) {
            assert.equal(typeof text.en, 'string');
            assert.equal(typeof text.fr, 'string');
          }
        }
        for (const item of component.items ?? []) {
          assert.ok(item.label.en && item.label.fr);
          const values = typeof item.value === 'string' ? [item.value] : Object.values(item.value);
          for (const value of values) {
            assert.ok(value.length <= 40, `status value too long: ${value}`);
          }
        }
      }
    }
  }
});

test('toasts stay under 200 characters per language', () => {
  const toast = resultToast({
    download: 921.4,
    upload: 848.2,
    ping: 3.1,
    server: LAST_RESULT.server,
  });
  assert.equal(toast.fr, '↓ 921.4 Mbit/s · ↑ 848.2 Mbit/s · ping 3.1 ms · Free · Marseille');
  assert.ok(toast.en.length <= 200);
  const noServer = resultToast({ download: 1, upload: 2, ping: 3 });
  assert.equal(noServer.en, '↓ 1 Mbit/s · ↑ 2 Mbit/s · ping 3 ms');
  for (const text of Object.values(ALREADY_RUNNING_TOAST)) {
    assert.ok(text.length <= 200);
  }
});
