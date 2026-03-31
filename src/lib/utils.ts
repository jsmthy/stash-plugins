/**
 * Removes characters invalid in most filesystems: < > : " / \ | ? *
 * and control characters (ASCII 0-31).
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
}

/** Check if a scene has a VR tag (case-insensitive match). */
export function isVR(tags: Tag[], vrTagName: string): boolean {
  const target = vrTagName.toLowerCase();
  return tags.some(t => t.name.toLowerCase() === target);
}
