// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined`.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  server_id: '', // '' = pick the closest healthy server automatically
  auto_test: true, // run a test on a schedule (Gladys polling)
  poll_frequency: 3600, // seconds between automatic tests
  connections: 4, // parallel TCP connections per direction
  duration: 10, // measured seconds per direction (after a 2 s warmup)
};

/**
 * Clamp a numeric field coming from the form (may arrive as a string).
 */
function toNumber(raw, fallback, min, max) {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    server_id: String(raw.server_id ?? DEFAULT_CONFIG.server_id).trim(),
    // Anything but an explicit false means true.
    auto_test: raw.auto_test !== false && raw.auto_test !== 'false',
    poll_frequency: toNumber(raw.poll_frequency, DEFAULT_CONFIG.poll_frequency, 600, 86400),
    connections: toNumber(raw.connections, DEFAULT_CONFIG.connections, 1, 8),
    duration: toNumber(raw.duration, DEFAULT_CONFIG.duration, 5, 20),
  };
}
