export const supportedMedia = name => /\.(mp4|mov|m4v|webm|mkv|avi|mp3|wav|m4a|aac|ogg|flac)$/i.test(name);
export const mediaExtension = name => name.split('.').at(-1).toLowerCase();
export const clipNameKey = item => (item.path || item.sourcePath || item.name || item.file?.name || '').replaceAll('\\', '/').replace(/\.[^/.]+$/, '').toLowerCase();
const formatOrder = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'];
export function planImport(files, formats, onePerName = true, existing = []) {
  const accepted = new Set(formats);
  const names = new Set(existing.map(clipNameKey));
  const fingerprints = new Set(existing.map(c => c.fingerprint).filter(Boolean));
  const candidates = [], skipped = { unsupported: 0, filtered: 0, duplicate: 0 };
  for (const item of files) {
    if (!supportedMedia(item.file.name)) { skipped.unsupported++; continue; }
    if (!accepted.has(mediaExtension(item.file.name))) { skipped.filtered++; continue; }
    candidates.push(item);
  }
  candidates.sort((a, b) => formatOrder.indexOf(mediaExtension(a.file.name)) - formatOrder.indexOf(mediaExtension(b.file.name)) || (a.path || a.file.name).localeCompare(b.path || b.file.name, undefined, { numeric: true }));
  const selected = [];
  for (const item of candidates) {
    const fingerprint = `${item.path}:${item.file.size}:${item.file.lastModified}`;
    const key = clipNameKey(item);
    if (fingerprints.has(fingerprint) || (onePerName && names.has(key))) { skipped.duplicate++; continue; }
    selected.push(item); fingerprints.add(fingerprint); names.add(key);
  }
  return { selected, skipped };
}

export async function droppedFiles(dataTransfer) {
  // Capture entries while the drop event still owns access to the data store.
  const entries = Array.from(dataTransfer.items || []).filter(i => i.kind === 'file').map(i => ({ entry: i.webkitGetAsEntry?.(), file: i.getAsFile() }));
  const fallback = Array.from(dataTransfer.files || []);
  async function walk(entry, prefix = '') {
    if (entry.isFile) return [{ file: await new Promise((resolve, reject) => entry.file(resolve, reject)), path: prefix + entry.name }];
    if (!entry.isDirectory) return [];
    const reader = entry.createReader();
    const files = [];
    // Chromium returns directory entries in batches; keep reading until empty.
    for (;;) {
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) files.push(...await walk(child, `${prefix}${entry.name}/`));
    }
    return files;
  }
  const files = [];
  for (const item of entries) {
    if (item.entry) files.push(...await walk(item.entry));
    else if (item.file) files.push({ file: item.file, path: item.file.name });
  }
  return entries.length ? files : fallback.map(file => ({ file, path: file.name }));
}
