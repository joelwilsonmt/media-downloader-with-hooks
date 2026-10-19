import path from 'node:path';

// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** One path segment, safe on every filesystem Jellyfin is likely to sit on. */
export function safeSegment(name: string): string {
  return name
    .replace(UNSAFE_CHARS, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120)
    .trim();
}

/** Folder segments from user input, with traversal and empty parts dropped. */
export function folderSegments(folder: string | undefined): string[] {
  if (!folder) return [];
  return folder
    .split(/[\\/]+/)
    .map(s => s.trim())
    .filter(s => s && s !== '.' && s !== '..')
    .map(safeSegment)
    .filter(Boolean);
}

/** Resolves a user-supplied folder under root. Throws if the result would leave root. */
export function resolveUnder(root: string, folder: string | undefined): string {
  const base = path.resolve(root);
  const target = path.resolve(base, ...folderSegments(folder));
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('Folder must stay inside the download directory');
  }
  return target;
}

/** A yt-dlp output template for a literal name; % must be escaped. */
export function literalTemplate(name: string): string {
  return safeSegment(name).replace(/%/g, '%%');
}

/** RFC 6266 Content-Disposition with an ASCII fallback. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
