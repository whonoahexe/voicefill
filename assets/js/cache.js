// assets/js/cache.js — localStorage-backed transcript cache
// Keys are namespaced by chat identity: "Alice|Bob::PTT-20240115-WA0001.opus"
// Errors are swallowed — cache is best-effort, never load-bearing.

const STORAGE_KEY = 'voicefill_transcripts_v1';

/**
 * Derive a stable chat identity from the participant set.
 * Collects all unique sender names, sorts them, joins with '|'.
 * Stable across re-exports as long as contact names haven't changed.
 * @param {Array} messages
 * @returns {string}
 */
export function deriveChatKey(messages) {
  const senders = new Set();
  for (const msg of messages) {
    if (msg.sender) senders.add(msg.sender.trim());
  }
  return [...senders].sort().join('|') || 'unknown';
}

function loadCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} chatKey — from deriveChatKey()
 * @param {string} basename
 * @returns {string|null} cached transcript text, or null if not found
 */
export function getCachedTranscript(chatKey, basename) {
  const cache = loadCache();
  const val = cache[chatKey + '::' + basename];
  return val !== undefined ? val : null;
}

/**
 * @param {string} chatKey — from deriveChatKey()
 * @param {string} basename
 * @param {string} text — transcript text (including '[No speech detected]')
 */
export function setCachedTranscript(chatKey, basename, text) {
  try {
    const cache = loadCache();
    cache[chatKey + '::' + basename] = text;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage unavailable or full — fail silently
  }
}
