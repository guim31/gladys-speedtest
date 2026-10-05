// -----------------------------------------------------------------------------
// The last test result, kept in /data (the only writable place of the
// container) so the dashboard widget is filled right after a restart instead
// of waiting for the next scheduled test. Best effort: a read or write
// failure only costs that convenience, never a test.
//
// Locally, SPEEDTEST_DATA_DIR points the store at any folder (the template's
// `.gitignore` rule keeps a root `data/` folder out of the repository).
// -----------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const LAST_RESULT_FILE = 'last-result.json';

/**
 * The data directory: the /data volume in the container, overridable locally.
 * @returns {string}
 */
export function defaultDataDir() {
  return process.env.SPEEDTEST_DATA_DIR || '/data';
}

/**
 * Keep only the fields the widget needs, in a shape that survives a reload
 * whatever the engine returned (a missing field becomes null, never a crash).
 * @param {object} raw a test result, or a stored one
 * @returns {{ at: string, download: number|null, upload: number|null,
 *   ping: number|null, jitter: number|null,
 *   server: { id: string|null, sponsor: string|null, name: string|null,
 *   country: string|null } }|null}
 */
export function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const at = new Date(raw.at ?? NaN);
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  const number = (value) =>
    Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null;
  const text = (value) =>
    value === null || value === undefined || value === '' ? null : String(value);
  const server = raw.server && typeof raw.server === 'object' ? raw.server : {};
  return {
    at: at.toISOString(),
    download: number(raw.download),
    upload: number(raw.upload),
    ping: number(raw.ping),
    jitter: number(raw.jitter),
    server: {
      id: text(server.id),
      sponsor: text(server.sponsor),
      name: text(server.name),
      country: text(server.country),
    },
  };
}

/**
 * A store of the last result in one JSON file of a directory.
 * @param {string} [dir] the data directory
 */
export function createResultStore(dir = defaultDataDir()) {
  const file = path.join(dir, LAST_RESULT_FILE);
  return {
    dir,
    file,

    /** @returns {ReturnType<typeof normalizeResult>} the stored result, null when none */
    load() {
      try {
        return normalizeResult(JSON.parse(readFileSync(file, 'utf8')));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Could not read ${file}: ${err.message}`);
        }
        return null;
      }
    },

    /**
     * Write atomically (temporary file then rename), so a crash mid-write
     * never leaves a truncated file behind.
     * @param {object} result a test result (see normalizeResult)
     * @returns {ReturnType<typeof normalizeResult>} what was stored
     */
    save(result) {
      const normalized = normalizeResult(result);
      if (!normalized) {
        return null;
      }
      try {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        const temporary = `${file}.tmp`;
        writeFileSync(temporary, JSON.stringify(normalized));
        renameSync(temporary, file);
      } catch (err) {
        logger.warn(`Could not save the last result to ${file}: ${err.message}`);
      }
      return normalized;
    },
  };
}
