// assets/js/parser.js
// ZIP extraction using JSZip; returns raw _chat.txt lines.
// Full chat parsing (voice detection, BOM stripping, sender extraction) added in Plan 01-02.

/**
 * Extract _chat.txt raw lines and audio file map from a WhatsApp export ZIP.
 *
 * @param {File} file - Browser File object from drag-drop or file picker
 * @returns {Promise<{ rawLines: string[], audioFiles: Map<string, object>, rawText: string }>}
 * @throws {Error} 'Not a ZIP file' — if file extension is not .zip
 * @throws {Error} 'ZIP file exceeds 500MB limit' — if file is too large
 * @throws {Error} 'Invalid or corrupt ZIP file' — if JSZip rejects the file
 * @throws {Error} 'No _chat.txt found in ZIP' — if no chat text entry is found
 */
export async function parseZip(file) {
  // Validate file extension (case-insensitive)
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Not a ZIP file');
  }

  // 500MB size guard (T-01-03: reject before JSZip.loadAsync to avoid OOM)
  if (file.size > 500 * 1024 * 1024) {
    throw new Error('ZIP file exceeds 500MB limit');
  }

  // Load ZIP — JSZip UMD build registered window.JSZip by the classic <script> tag
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err) {
    throw new Error('Invalid or corrupt ZIP file');
  }

  let chatEntry = null;
  const audioFiles = new Map(); // basename -> ZipObject (bytes read lazily in Phase 2)

  // Iterate all entries; normalize paths to basename only (Pitfall 1 fix)
  // WhatsApp ZIPs nest files under a chat-named subfolder — full-path lookup returns undefined
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;

    // Strip any subfolder prefix — take only the last path segment
    const basename = relativePath.split('/').pop();

    if (basename === '_chat.txt') {
      chatEntry = zipEntry;
    } else if (basename.endsWith('.txt') && chatEntry === null) {
      // Fallback: first .txt found if _chat.txt not present at root
      chatEntry = zipEntry;
    } else if (basename.endsWith('.opus')) {
      audioFiles.set(basename, zipEntry);
    }
  });

  if (chatEntry === null) {
    throw new Error('No _chat.txt found in ZIP');
  }

  // Read chat text (string, not binary)
  const rawText = await chatEntry.async('string');

  // Split to non-empty lines for the Walking Skeleton render
  const rawLines = rawText.split('\n').filter(l => l.trim().length > 0);

  return { rawLines, audioFiles, rawText };
}
