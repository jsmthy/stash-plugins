import { pluginLog } from './log';
import { sanitizeFilename } from './utils';

/** Check if a path contains .StashIngest as a directory segment. */
function isInStashIngest(filePath: string): boolean {
  return filePath.split('/').includes('.StashIngest');
}

/**
 * Extract the library root path (everything before .StashIngest).
 * e.g. "/data/Libraries/Scenes/.StashIngest/Sub/file.mp4" → "/data/Libraries/Scenes"
 */
function getLibraryPath(filePath: string): string {
  const parts = filePath.split('/');
  const idx = parts.indexOf('.StashIngest');
  return parts.slice(0, idx).join('/');
}

/**
 * Re-fetch a scene and check if any of its files is still in .StashIngest.
 * Guards against concurrent hook invocations moving the same file.
 */
export function isStillInStashIngest(sceneId: string): boolean {
  try {
    const result = gql.Do(`
      query checkIngest($id: ID!) {
        findScene(id: $id) {
          files { path }
        }
      }
    `, { id: sceneId });
    const files = result?.findScene?.files;
    if (!files || files.length === 0) return false;
    return files.some((f: any) => isInStashIngest(f.path));
  } catch {
    return false;
  }
}

/**
 * Fetches scene data and validates that all rename conditions are met:
 * - Scene has title, studio.name, date, organized = true
 * - Scene has at least one file
 * - File is located somewhere under a .StashIngest directory
 *
 * Phash is optional — VR files often lack it.
 * Returns a ScenePayload if ready, or null if any check fails.
 */
export function checkFileIsReadyForRename(sceneId: string): ScenePayload | null {
  const result = gql.Do(`
    query getSceneById($id: ID!, $fpType: String!) {
      findScene(id: $id) {
        id, title, date, organized,
        studio { id, name },
        tags { name },
        stash_ids { endpoint, stash_id },
        performers { id, name },
        files {
          id, path, basename, width, height, video_codec, bit_rate, size,
          fingerprint(type: $fpType),
          fingerprints { type value }
        }
      }
    }
  `, { id: sceneId, fpType: 'phash' });

  pluginLog.Debug(`Scene ${sceneId} fetched: ${JSON.stringify(result)}`);

  const scene: SceneResult | null = result?.findScene;
  if (!scene) {
    pluginLog.Debug(`Scene ${sceneId} not found`);
    return null;
  }

  if (!(scene.title && scene.studio?.name && scene.date)) {
    pluginLog.Debug(`Scene ${sceneId} missing title, studio, or date, skipping`);
    return null;
  }

  if (!scene.organized) {
    pluginLog.Debug(`Scene ${sceneId} organized is not true, skipping`);
    return null;
  }

  if (scene.files.length === 0) {
    pluginLog.Debug(`Scene ${sceneId} has no files, skipping`);
    return null;
  }

  // Find the file that's under .StashIngest (scene may have multiple files, may be in subdirs)
  const file = scene.files.find(f => isInStashIngest(f.path));

  if (!file) {
    pluginLog.Debug(`Scene ${sceneId} has no file in .StashIngest, skipping`);
    return null;
  }

  const ext = file.basename.split('.').pop()!;
  const fileLibraryPath = getLibraryPath(file.path);

  const sanitizedStudio = sanitizeFilename(scene.studio!.name);
  const sanitizedDate = sanitizeFilename(scene.date);
  const sanitizedTitle = sanitizeFilename(scene.title);
  const phash = file.fingerprint || null;

  const basenameParts = `${sanitizedStudio} - ${sanitizedDate} - ${sanitizedTitle}`;
  const destinationBasename = phash
    ? `${basenameParts} [${phash}].${ext}`
    : `${basenameParts}.${ext}`;

  return {
    sceneId: scene.id,
    title: scene.title,
    studioId: scene.studio!.id,
    studio: scene.studio!.name,
    date: scene.date,
    fileId: file.id,
    file,
    tags: scene.tags,
    stashIds: scene.stash_ids ?? [],
    performers: scene.performers ?? [],
    destinationFolder: `${fileLibraryPath}/${sanitizedStudio}`,
    destinationBasename,
    phash,
  };
}
