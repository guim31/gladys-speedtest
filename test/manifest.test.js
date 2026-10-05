// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEVICE_BLUEPRINTS } from '../src/devices/index.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { CHARTS, DEFAULT_CHART, DEFAULT_INTERVAL, INTERVALS, WIDGET } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');

test('every manifest action has a registered handler', () => {
  const handled = new Set(DEVICE_BLUEPRINTS.flatMap((bp) => Object.keys(bp.actions ?? {})));
  for (const action of manifest.actions ?? []) {
    assert.ok(handled.has(action.key), `manifest action "${action.key}" has no handler`);
  }
});

test('every registered action handler is declared in the manifest', () => {
  const declared = new Set((manifest.actions ?? []).map((a) => a.key));
  for (const key of DEVICE_BLUEPRINTS.flatMap((bp) => Object.keys(bp.actions ?? {}))) {
    assert.ok(declared.has(key), `handler "${key}" is not declared in the manifest`);
  }
});

test('manifest version stays in lockstep with package.json and the image tag', () => {
  // The Release workflow bumps all three together; a hand edit that desyncs
  // them would ship an image whose embedded manifest lies about its version.
  assert.equal(manifest.version, pkg.version);
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image tag must match version ${manifest.version}`,
  );
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  const minVersion = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.\d+/);
  assert.ok(minVersion, 'gladys_version must declare a minimum version');
  const [, major, minor] = minVersion.map(Number);
  assert.ok(
    major > 4 || (major === 4 && minor >= 86),
    `categories requires gladys_version >= 4.86.0, got "${manifest.gladys_version}"`,
  );
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('every value-bearing config_schema field is normalized by the code', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      continue;
    }
    assert.ok(
      field.key in DEFAULT_CONFIG,
      `config_schema field "${field.key}" is missing from DEFAULT_CONFIG`,
    );
  }
});

test('every user-facing text is a language object (store validator rule)', () => {
  // The store rejects plain strings: label, description and placeholder must
  // map language codes to strings, with at least `en`.
  const fields = [...manifest.config_schema, ...(manifest.actions ?? [])];
  for (const field of fields) {
    for (const key of ['label', 'description', 'placeholder']) {
      if (field[key] !== undefined) {
        assert.equal(typeof field[key], 'object', `"${field.key}".${key} must be an object`);
        assert.equal(typeof field[key].en, 'string', `"${field.key}".${key} needs an "en" text`);
      }
    }
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  for (const section of sections) {
    // A section stores NO value: declaring `required`, `default` or
    // `placeholder` on it rejects the manifest, and its key must never leak
    // into the config the code manipulates.
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(
      section.placeholder,
      undefined,
      `section "${section.key}" must not have a placeholder`,
    );
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(
      !(section.key in DEFAULT_CONFIG),
      `section "${section.key}" stores no value and must not appear in DEFAULT_CONFIG`,
    );
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('the widgets: declared as the code serves them, within the store limits', () => {
  // Widgets need Gladys 5.1 (the SDK 0.14 vocabulary).
  const [, major, minor] = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.\d+/).map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);

  const served = DEVICE_BLUEPRINTS.flatMap((bp) => Object.keys(bp.widgets ?? {}));
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGET).sort(),
    'manifest keys are the exported constants',
  );
  assert.deepEqual([...served].sort(), Object.values(WIDGET).sort(), 'every widget has a handler');
  assert.ok(manifest.widgets.length <= 5);
  assert.match(indexSource, /onWidgetGet\(/);
  assert.match(indexSource, /onWidgetAction\(/);

  for (const widget of manifest.widgets) {
    assert.match(widget.key, /^[a-z0-9_]{2,32}$/);
    assert.match(widget.icon, /^[a-z0-9-]{1,40}$/);
    for (const text of Object.values(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30, `${widget.key}: ${text}`);
    }
    for (const text of Object.values(widget.description)) {
      assert.ok(text.length <= 100, `${widget.key}: ${text.length}`);
    }
    assert.ok(widget.label.en && widget.label.fr && widget.description.en && widget.description.fr);
    assert.ok((widget.settings ?? []).length <= 10);
    for (const field of widget.settings ?? []) {
      assert.ok(['string', 'number', 'boolean', 'select', 'section'].includes(field.type));
      assert.ok(field.label.en && field.label.fr);
      for (const option of field.options ?? []) {
        assert.ok(option.label.en && option.label.fr, `${field.key}.${option.value}`);
      }
    }
    // The widget has a button: its action ack needs a timeout fitting a test.
    const handler = DEVICE_BLUEPRINTS.flatMap((bp) => bp.widgets?.[widget.key] ?? [])[0];
    if (typeof handler.action === 'function') {
      assert.ok(
        widget.action_timeout_seconds >= 5 && widget.action_timeout_seconds <= 120,
        `${widget.key}: action_timeout_seconds`,
      );
    }
  }
});

test('the speed widget settings offer what the builders understand', () => {
  const speed = manifest.widgets.find((widget) => widget.key === WIDGET.SPEED);
  const chart = speed.settings.find((field) => field.key === 'chart');
  assert.deepEqual(
    chart.options.map((option) => option.value),
    CHARTS,
  );
  assert.equal(chart.default, DEFAULT_CHART);
  const interval = speed.settings.find((field) => field.key === 'interval');
  assert.deepEqual(
    interval.options.map((option) => option.value),
    INTERVALS,
  );
  assert.equal(interval.default, DEFAULT_INTERVAL);
  // A test lasts ~2 × duration + 10 s plus the server selection: the widget
  // action awaits it, under the longest timeout the core allows.
  assert.equal(speed.action_timeout_seconds, 120);
  assert.ok(2 * 20 + 10 < speed.action_timeout_seconds);
});
