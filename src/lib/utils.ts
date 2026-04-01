/**
 * Removes characters invalid in most filesystems: < > : " / \ | ? *
 * and control characters (ASCII 0-31).
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
}

/** Count UTF-8 byte length of a string. */
function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7F) bytes += 1;
    else if (code <= 0x7FF) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF) { bytes += 4; i++; } // surrogate pair
    else bytes += 3;
  }
  return bytes;
}

/** Truncate a string so its UTF-8 byte length fits within maxBytes. */
function truncateToBytes(str: string, maxBytes: number): string {
  if (utf8ByteLength(str) <= maxBytes) return str;
  // Remove characters from the end until it fits
  let result = str;
  while (result.length > 0 && utf8ByteLength(result) > maxBytes) {
    result = result.slice(0, -1);
  }
  return result.trimEnd();
}

/**
 * Build a filename that fits within the 255-byte ext4 limit.
 * Format: {studio} - {date} - {title} [{phash}].{ext}
 * Truncates the title if the full name would exceed the limit.
 */
export function buildBasename(studio: string, date: string, title: string, phash: string | null, ext: string): string {
  const MAX_BYTES = 255;
  const prefix = `${studio} - ${date} - `;
  const suffix = phash ? ` [${phash}].${ext}` : `.${ext}`;
  const fixedBytes = utf8ByteLength(prefix) + utf8ByteLength(suffix);
  const availableForTitle = MAX_BYTES - fixedBytes;

  const truncatedTitle = truncateToBytes(title, availableForTitle);
  return `${prefix}${truncatedTitle}${suffix}`;
}

/** Check if a scene has a VR tag (case-insensitive match). */
export function isVR(tags: Tag[], vrTagName: string): boolean {
  const target = vrTagName.toLowerCase();
  return tags.some(t => t.name.toLowerCase() === target);
}
