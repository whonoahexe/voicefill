// assets/js/cache.js — localStorage-backed transcript cache
// Keys are audio basenames (e.g. PTT-20240115-WA0001.opus).
// Errors are swallowed — cache is best-effort, never load-bearing.

const STORAGE_KEY = 'voicefill_transcripts_v1';

function loadCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} basename
 * @returns {string|null} cached transcript text, or null if not found
 */
export function getCachedTranscript(basename) {
  const cache = loadCache();
  const val = cache[basename];
  return val !== undefined ? val : null;
}

/**
 * @param {string} basename
 * @param {string} text — transcript text (including '[No speech detected]')
 */
export function setCachedTranscript(basename, text) {
  try {
    const cache = loadCache();
    cache[basename] = text;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage unavailable or full — fail silently
  }
}
