import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

test('normalizeConfig returns the defaults for an empty config', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig({}), DEFAULT_CONFIG);
});

test('normalizeConfig coerces form strings to numbers', () => {
  const config = normalizeConfig({ poll_frequency: '7200', connections: '2', duration: '15' });
  assert.equal(config.poll_frequency, 7200);
  assert.equal(config.connections, 2);
  assert.equal(config.duration, 15);
});

test('normalizeConfig clamps out-of-range numbers', () => {
  const low = normalizeConfig({ poll_frequency: 10, connections: 0, duration: 1 });
  assert.equal(low.poll_frequency, 600);
  assert.equal(low.connections, 1);
  assert.equal(low.duration, 5);

  const high = normalizeConfig({ poll_frequency: 999999, connections: 50, duration: 120 });
  assert.equal(high.poll_frequency, 86400);
  assert.equal(high.connections, 8);
  assert.equal(high.duration, 20);
});

test('normalizeConfig falls back to defaults on garbage numbers', () => {
  const config = normalizeConfig({ poll_frequency: 'soon', connections: null, duration: {} });
  assert.equal(config.poll_frequency, DEFAULT_CONFIG.poll_frequency);
  assert.equal(config.connections, DEFAULT_CONFIG.connections);
  assert.equal(config.duration, DEFAULT_CONFIG.duration);
});

test('normalizeConfig trims the server id and keeps it a string', () => {
  assert.equal(normalizeConfig({ server_id: '  32565  ' }).server_id, '32565');
  assert.equal(normalizeConfig({ server_id: 32565 }).server_id, '32565');
  assert.equal(normalizeConfig({ server_id: undefined }).server_id, '');
});

test('auto_test only turns off on an explicit false', () => {
  assert.equal(normalizeConfig({ auto_test: false }).auto_test, false);
  assert.equal(normalizeConfig({ auto_test: 'false' }).auto_test, false);
  assert.equal(normalizeConfig({ auto_test: true }).auto_test, true);
  assert.equal(normalizeConfig({}).auto_test, true);
});
