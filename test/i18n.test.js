// -----------------------------------------------------------------------------
// Translation guard: every text the integration hands to Gladys exists in
// exactly the four languages of the Gladys interface (en, fr, de, es), none is
// empty and none overflows the room it is shown in. Gladys falls back to
// English on a missing language, so a forgotten translation would otherwise go
// unnoticed.
// -----------------------------------------------------------------------------

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { INIT_FAILED_STATUS, LANGUAGES, format } from '../src/i18n.js';
import {
  ACTION_TEXTS,
  setEngineForTests,
  setStoreForTests,
  speedtest,
} from '../src/devices/speedtest.js';
import { createResultStore } from '../src/store.js';
import { normalizeConfig } from '../src/config.js';
import {
  ALREADY_RUNNING_TOAST,
  TEXTS,
  buildSpeedContent,
  formatLastTest,
  resultToast,
} from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

// The action handlers save their result: keep it out of /data.
let dataDir;
before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'speedtest-i18n-'));
  setStoreForTests(createResultStore(dataDir));
});
after(async () => {
  setStoreForTests(null);
  await rm(dataDir, { recursive: true, force: true });
});

const LANGUAGE_KEY = /^[a-z]{2}(-[A-Z]{2})?$/;

/** Whether an object is a language object (any key looks like a language). */
const isLanguageObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length > 0 &&
  Object.keys(value).some((key) => LANGUAGE_KEY.test(key));

/** Every language object under a value, with its path. */
function collect(value, path = '$', found = []) {
  if (isLanguageObject(value)) {
    found.push({ path, texts: value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, `${path}[${index}]`, found));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collect(child, `${path}.${key}`, found);
    }
  }
  return found;
}

/** Assert the four languages exactly, non-empty, within [min, max] characters. */
function assertTexts(path, texts, { min = 1, max = Infinity } = {}) {
  assert.deepEqual(
    Object.keys(texts).sort(),
    [...LANGUAGES].sort(),
    `${path} must carry exactly ${LANGUAGES.join(', ')}`,
  );
  for (const lang of LANGUAGES) {
    const text = texts[lang];
    assert.equal(typeof text, 'string', `${path}.${lang} must be a string`);
    const length = text.trim().length;
    assert.ok(length >= Math.max(min, 1), `${path}.${lang} is empty or too short`);
    assert.ok(length <= max, `${path}.${lang} is ${length} characters long, ${max} allowed`);
  }
}

// --- Manifest ----------------------------------------------------------------

// Bounds of the store manifest schema; FORM_LABEL_MAX is ours: a form label,
// an option or a button stays on one line in the Configuration screen.
const FORM_LABEL_MAX = 60;

/** The bound of a manifest text, from its path. */
function manifestBounds(path) {
  if (path === '$.description') return { min: 10, max: 100 };
  if (/^\$\.widgets\[\d+\]\.label$/.test(path)) return { min: 3, max: 30 };
  if (/^\$\.widgets\[\d+\]\.description$/.test(path)) return { max: 100 };
  if (/\.description$/.test(path)) return { max: 1000 };
  return { max: FORM_LABEL_MAX };
}

test('the manifest walk finds the language objects (the guard is not empty)', () => {
  // 28 at the time of writing: a sharp drop means the walk skips something.
  assert.ok(collect(manifest).length >= 28);
});

test('every multilingual object of the manifest has exactly en, fr, de and es', () => {
  for (const { path, texts } of collect(manifest)) {
    assertTexts(path, texts, manifestBounds(path));
  }
});

// --- German register ----------------------------------------------------------

// German addresses the user with "du", like every integration of guim31. The
// capitalized forms are the polite ones ("ihr Verlauf", "their history", stays
// allowed); a sentence must not start with "Sie" or "Ihr" either.
const POLITE_GERMAN = /\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/;

/** Every German text of the manifest and of the code tables. */
function germanTexts() {
  const tables = [
    ...collect(manifest),
    ...Object.entries(TEXTS).map(([key, texts]) => ({ path: `TEXTS.${key}`, texts })),
    ...Object.entries(ACTION_TEXTS).map(([key, texts]) => ({ path: `ACTION_TEXTS.${key}`, texts })),
    { path: 'ALREADY_RUNNING_TOAST', texts: ALREADY_RUNNING_TOAST },
    { path: 'INIT_FAILED_STATUS', texts: INIT_FAILED_STATUS },
  ];
  return tables.map(({ path, texts }) => ({ path, text: texts.de }));
}

test('German texts use "du", never the polite "Sie" / "Ihr"', () => {
  const texts = germanTexts();
  assert.ok(texts.length >= 45); // 48 at the time of writing
  for (const { path, text } of texts) {
    assert.doesNotMatch(text, POLITE_GERMAN, `${path}.de addresses the user with "Sie"`);
  }
});

// --- Code ----------------------------------------------------------------------

// Bounds of the widget vocabulary (SDK TEXT_BOUNDS) for each text of TEXTS.
const TILE_LABEL_MAX = 24;
const STATUS_MAX = 40;
const WIDGET_TEXT_BOUNDS = {
  download: TILE_LABEL_MAX,
  upload: TILE_LABEL_MAX,
  ping: TILE_LABEL_MAX,
  jitter: TILE_LABEL_MAX,
  speedsChart: 40, // chart title
  latencyChart: 40,
  lastTest: STATUS_MAX,
  server: STATUS_MAX,
  status: STATUS_MAX,
  running: STATUS_MAX,
  unknown: STATUS_MAX,
  justNow: STATUS_MAX,
  minutesAgo: STATUS_MAX, // filled with "59" below
  runTest: 24, // button label
  empty: 300, // body text
};

test('every widget text has the four languages and fits its component', () => {
  assert.deepEqual(Object.keys(TEXTS).sort(), Object.keys(WIDGET_TEXT_BOUNDS).sort());
  for (const [key, texts] of Object.entries(TEXTS)) {
    const filled = key === 'minutesAgo' ? format(texts, { n: 59 }) : texts;
    assertTexts(`TEXTS.${key}`, filled, { max: WIDGET_TEXT_BOUNDS[key] });
  }
});

test('the relative and absolute dates fit a status value in every language', () => {
  const now = new Date('2026-10-05T14:30:00Z');
  for (const lang of LANGUAGES) {
    for (const at of ['2026-10-05T14:29:50Z', '2026-10-05T13:31:00Z', '2026-09-28T23:59:00Z']) {
      const text = formatLastTest(at, { language: lang, now, timeZone: 'Europe/Berlin' });
      assert.ok(text.length > 0 && text.length <= STATUS_MAX, `${lang}: "${text}"`);
    }
  }
});

test('the toasts have the four languages and stay under 200 characters', () => {
  assertTexts('ALREADY_RUNNING_TOAST', ALREADY_RUNNING_TOAST, { max: 200 });
  const toast = resultToast({
    download: 9999.99,
    upload: 9999.99,
    ping: 999.99,
    server: { sponsor: 'A very long sponsor name for a server', name: 'Somewhere far away' },
  });
  assertTexts('resultToast', toast, { max: 200 });
});

test('the connection status has the four languages', () => {
  assertTexts('INIT_FAILED_STATUS', INIT_FAILED_STATUS, { max: 200 });
});

test('every action message has the four languages', () => {
  assert.deepEqual(Object.keys(ACTION_TEXTS).sort(), [
    'autoSelection',
    'configuredServer',
    'testResult',
  ]);
  for (const [key, texts] of Object.entries(ACTION_TEXTS)) {
    assertTexts(`ACTION_TEXTS.${key}`, texts);
  }
});

const fakeGladys = {
  externalIds: (type, id) => ({
    device: `speedtest:${type}:${id}`,
    feature: (name) => `speedtest:${type}:${id}:${name}`,
  }),
  publishStates: async () => {},
};

test('the action handlers answer in the four languages, placeholders filled', async () => {
  const server = { id: '32565', sponsor: 'Free', name: 'Marseille', country: 'France' };
  setEngineForTests({
    runSpeedtest: async () => ({ download: 1, upload: 2, ping: 3, jitter: 4, server }),
    listServers: async () => [{ ...server, distance: 12 }],
  });
  try {
    const messages = [
      await speedtest.actions.run_speedtest(fakeGladys, { config: normalizeConfig() }),
      await speedtest.actions.list_servers(fakeGladys, { config: normalizeConfig() }),
      await speedtest.actions.list_servers(fakeGladys, {
        config: normalizeConfig({ server_id: '32565' }),
      }),
    ];
    for (const message of messages) {
      assertTexts('action message', message);
      for (const lang of LANGUAGES) {
        assert.doesNotMatch(message[lang], /\{\w+\}/, `${lang}: unfilled placeholder`);
      }
    }
  } finally {
    setEngineForTests(null);
  }
});

test('every widget content is fully translated and valid', () => {
  const features = { download: 'd', upload: 'u', ping: 'p', jitter: 'j' };
  const lastResult = {
    at: '2026-10-05T14:05:00Z',
    server: { id: '1', sponsor: 'Free', name: 'Marseille' },
  };
  for (const language of LANGUAGES) {
    for (const [result, running] of [
      [lastResult, false],
      [lastResult, true],
      [null, false],
    ]) {
      for (const chart of ['speeds', 'latency']) {
        const content = buildSpeedContent({
          features,
          lastResult: result,
          running,
          settings: { chart },
          language,
          now: new Date('2026-10-05T14:30:00Z'),
        });
        assert.deepEqual(validateWidgetContent(content), []);
        for (const { path, texts } of collect(content)) {
          assertTexts(path, texts);
        }
      }
    }
  }
});
