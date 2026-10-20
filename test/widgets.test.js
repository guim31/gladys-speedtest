// -----------------------------------------------------------------------------
// Dashboard widget content builders: pure functions, checked against the
// core vocabulary with the validator the SDK exports.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import {
  ALREADY_RUNNING_TOAST,
  CHART_TYPE,
  CHARTS,
  DEFAULT_CHART,
  DEFAULT_INTERVAL,
  INTERVALS,
  SPEED_TILE_UNIT_MAX,
  SPEED_TILE_VALUE_MAX,
  TTL_IDLE_SECONDS,
  TTL_RUNNING_SECONDS,
  WIDGET_ACTION,
  buildSpeedContent,
  fit,
  formatLastTest,
  formatLatency,
  formatServer,
  formatSpeed,
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
  assert.equal(widgetLanguage('de'), 'de');
  assert.equal(widgetLanguage('es'), 'es');
  assert.equal(widgetLanguage('it'), 'en');
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
  assert.deepEqual(normalizeSettings(), {
    chart: DEFAULT_CHART,
    interval: DEFAULT_INTERVAL,
    display: 'full',
  });
  assert.deepEqual(normalizeSettings({ chart: 'nope', interval: 'last-year', display: 'x' }), {
    chart: DEFAULT_CHART,
    interval: DEFAULT_INTERVAL,
    display: 'full',
  });
  assert.deepEqual(
    normalizeSettings({ chart: 'latency', interval: 'last-month', display: 'compact' }),
    { chart: 'latency', interval: 'last-month', display: 'compact' },
  );
  assert.ok(CHARTS.includes(DEFAULT_CHART));
  assert.ok(INTERVALS.includes(DEFAULT_INTERVAL));
});

test('formatLastTest: relative under an hour, short localized date beyond, ≤ 40 chars', () => {
  const base = { now: NOW, timeZone: 'UTC' };
  assert.equal(formatLastTest('2026-10-05T14:29:40Z', { ...base, language: 'fr' }), "à l'instant");
  assert.equal(formatLastTest('2026-10-05T14:29:40Z', { ...base, language: 'en' }), 'just now');
  assert.equal(formatLastTest(LAST_RESULT.at, { ...base, language: 'fr' }), 'il y a 25 min');
  assert.equal(formatLastTest(LAST_RESULT.at, { ...base, language: 'en' }), '25 min ago');
  assert.equal(formatLastTest(LAST_RESULT.at, { ...base, language: 'de' }), 'vor 25 Min.');
  assert.equal(formatLastTest(LAST_RESULT.at, { ...base, language: 'es' }), 'hace 25 min');

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

test('formatSpeed: whole Mb/s below 1 000, Gb/s with one localized decimal beyond', () => {
  assert.deepEqual(formatSpeed(716.6, 'fr'), { value: '717', unit: 'Mb/s' });
  assert.deepEqual(formatSpeed(838.4, 'fr'), { value: '838', unit: 'Mb/s' });
  assert.deepEqual(formatSpeed(0.4, 'en'), { value: '0', unit: 'Mb/s' });
  assert.deepEqual(formatSpeed(999.4, 'en'), { value: '999', unit: 'Mb/s' });
  // 999.5 rounds to 1 000: no "1000 Mb/s", already Gb/s.
  assert.deepEqual(formatSpeed(999.5, 'en'), { value: '1.0', unit: 'Gb/s' });
  assert.deepEqual(formatSpeed(1234, 'fr'), { value: '1,2', unit: 'Gb/s' });
  assert.deepEqual(formatSpeed(1234, 'en'), { value: '1.2', unit: 'Gb/s' });
  assert.deepEqual(formatSpeed(1234, 'de'), { value: '1,2', unit: 'Gb/s' });
  assert.deepEqual(formatSpeed(1234, 'es'), { value: '1,2', unit: 'Gb/s' });
  assert.deepEqual(formatSpeed(8000, 'fr'), { value: '8,0', unit: 'Gb/s' });
  assert.deepEqual(formatSpeed(9949, 'fr'), { value: '9,9', unit: 'Gb/s' });
  // From 10 Gb/s, whole Gb/s: "10,0" would not fit the tile.
  assert.deepEqual(formatSpeed(9950, 'fr'), { value: '10', unit: 'Gb/s' });
  assert.deepEqual(formatSpeed(25_000, 'en'), { value: '25', unit: 'Gb/s' });
  assert.deepEqual(formatSpeed(null, 'fr'), { value: '—' });
  assert.deepEqual(formatSpeed(undefined, 'fr'), { value: '—' });
  assert.deepEqual(formatSpeed(Number.NaN, 'fr'), { value: '—' });
});

test('formatSpeed never overflows a tile (SPEED_TILE_* from the core CSS)', () => {
  // Every speed up to 100 Gb/s, every language.
  const speeds = [0, 0.4, 9.5, 99.5, 716.6, 999.49, 999.5, 1000, 1049, 1050, 9949, 9950, 99_499];
  for (let mbps = 0; mbps <= 12_000; mbps += 0.5) speeds.push(mbps);
  for (let mbps = 12_000; mbps <= 100_000; mbps += 7) speeds.push(mbps);
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const mbps of speeds) {
      const { value, unit = '' } = formatSpeed(mbps, language);
      assert.ok(value.length <= SPEED_TILE_VALUE_MAX, `${language} ${mbps}: "${value}"`);
      assert.ok(unit.length <= SPEED_TILE_UNIT_MAX, `${language} ${mbps}: "${unit}"`);
    }
  }
});

test('formatLatency: one decimal at most, in the language format', () => {
  assert.equal(formatLatency(14.53, 'fr'), '14,5 ms');
  assert.equal(formatLatency(14.53, 'en'), '14.5 ms');
  assert.equal(formatLatency(0.2, 'de'), '0,2 ms');
  assert.equal(formatLatency(3, 'es'), '3 ms');
  assert.equal(formatLatency(null, 'fr'), null);
  assert.ok(formatLatency(99999.99, 'fr').length <= 40);
});

test('speed: nominal content — two speed tiles, an area chart, status rows, button', () => {
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

  // The layout, in the order the front renders its slots.
  assert.deepEqual(
    content.components.map((c) => c.type),
    ['value', 'value', 'chart', 'status', 'button'],
  );

  // Two tiles, never three or four: they share one line (or stack one by
  // one in a column under 200px), never leave one alone on a second line.
  const tiles = byType(content, 'value');
  assert.equal(tiles.length, 2);
  assert.deepEqual(
    tiles.map((t) => [t.label.fr, t.icon, t.value, t.unit]),
    [
      ['Descendant', 'download', '921', 'Mb/s'],
      ['Montant', 'upload', '848', 'Mb/s'],
    ],
  );
  for (const tile of tiles) {
    assert.equal(tile.device_feature, undefined, 'the core rendering of a feature is cut');
    assert.ok(tile.value.length <= SPEED_TILE_VALUE_MAX);
    assert.ok(tile.unit.length <= SPEED_TILE_UNIT_MAX);
  }

  const [chart] = byType(content, 'chart');
  assert.deepEqual(chart.device_features, [FEATURES.download, FEATURES.upload]);
  assert.equal(chart.interval, DEFAULT_INTERVAL);
  assert.equal(chart.chart_type, 'area');
  assert.equal(chart.unit, 'Mb/s');

  const [status] = byType(content, 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label.fr, item.value, item.icon]),
    [
      ['Ping', '3,1 ms', 'clock'],
      ['Gigue', '0,4 ms', 'activity'],
      ['Dernier test', 'il y a 25 min', 'calendar'],
      ['Serveur', 'Free · Marseille', 'server'],
    ],
  );
  assert.equal(byType(content, 'text').length, 0, 'no empty-state text with a result');

  const [button] = byType(content, 'button');
  assert.equal(button.action.key, WIDGET_ACTION.RUN_TEST);
  assert.equal(button.icon, 'play');
  assert.equal(button.style, undefined, 'never the primary style (invisible in dark mode)');
  assert.equal(button.label.fr, 'Lancer un test');
});

test('speed: beyond 1 000 Mb/s the tiles switch to Gb/s', () => {
  const content = buildSpeedContent({
    features: FEATURES,
    lastResult: { ...LAST_RESULT, download: 1234.5, upload: 716.6 },
    running: false,
    language: 'fr',
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(
    byType(content, 'value').map((t) => `${t.value} ${t.unit}`),
    ['1,2 Gb/s', '717 Mb/s'],
  );
});

test('speed: the budget of the core is kept in every state', () => {
  for (const running of [false, true]) {
    for (const lastResult of [LAST_RESULT, null]) {
      const content = buildSpeedContent({ features: FEATURES, lastResult, running, now: NOW });
      const count = (types) => content.components.filter((c) => types.includes(c.type)).length;
      assert.ok(content.components.length <= 8);
      assert.ok(count(['text']) <= 2);
      assert.ok(count(['button']) <= 4);
      assert.equal(count(['value', 'gauge']), 2, 'two tiles: no orphan on a second line');
    }
  }
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
  assert.equal(chart.chart_type, 'area');
  assert.equal(chart.chart_type, CHART_TYPE);
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
  // The tiles show a dash, the chart stays: Gladys keeps the history even
  // when the container forgot it.
  assert.deepEqual(
    byType(content, 'value').map((t) => [t.value, t.unit]),
    [
      ['—', undefined],
      ['—', undefined],
    ],
  );
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

test('speed: a stored result with unknown figures and server shows the date only', () => {
  const content = buildSpeedContent({
    features: FEATURES,
    lastResult: {
      ...LAST_RESULT,
      download: null,
      upload: null,
      ping: null,
      jitter: null,
      server: { id: null, sponsor: null, name: null, country: null },
    },
    running: false,
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const [status] = byType(content, 'status');
  assert.equal(status.items.length, 1);
  assert.equal(status.items[0].label.en, 'Last test');
  assert.deepEqual(
    byType(content, 'value').map((t) => t.value),
    ['—', '—'],
  );
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

test('display: three tiles and the chart ("standard"), three tiles alone ("compact")', () => {
  const view = (display, lastResult = LAST_RESULT) =>
    buildSpeedContent({
      features: FEATURES,
      lastResult,
      running: false,
      settings: { display },
      language: 'fr',
      now: NOW,
      timeZone: 'UTC',
    });
  const standard = view('standard');
  assert.deepEqual(validateWidgetContent(standard), []);
  assert.deepEqual(
    standard.components.map((c) => c.type),
    ['value', 'value', 'value', 'chart'],
  );
  assert.equal(standard.components[2].label.fr, 'Ping');
  assert.equal(standard.components[2].value, String(Math.round(LAST_RESULT.ping)));
  assert.equal(standard.components[2].unit, 'ms');
  const compact = view('compact');
  assert.deepEqual(validateWidgetContent(compact), []);
  assert.deepEqual(
    compact.components.map((c) => c.type),
    ['value', 'value', 'value'],
  );
  // Without a result yet: dashes, still valid.
  const empty = view('compact', null);
  assert.deepEqual(validateWidgetContent(empty), []);
  assert.equal(empty.components[2].value, '—');
  // The default stays the full layout.
  assert.ok(view(undefined).components.some((c) => c.type === 'button'));
});
