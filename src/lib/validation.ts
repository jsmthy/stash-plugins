import { pluginLog } from './log';
import { sanitizeFilename } from './utils';

/**
 * Re-fetch a scene and check if its first file is still in .StashIngest.
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
    const path: string | undefined = result?.findScene?.files?.[0]?.path;
    if (!path) return false;
    const parts = path.split('/');
    parts.pop(); // filename
    const dir = parts.pop();
    return dir === '.StashIngest';
  } catch {
    return false;
  }
}

/**
 * Fetches scene data and validates that all rename conditions are met:
 * - Scene has title, studio.name, date, organized = true
 * - Scene has at least one file
 * - File is located in a .StashIngest directory
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

  const file = scene.files[0];

  const fileParts = file.path.split('/');
  fileParts.pop(); // filename
  const ext = file.basename.split('.').pop()!;
  const fileDir = fileParts.pop()!;
  const fileLibraryPath = fileParts.join('/');

  if (fileDir !== '.StashIngest') {
    pluginLog.Debug(`Scene ${sceneId} file is not in .StashIngest, skipping`);
    return null;
  }

  const sanitizedStudio = sanitizeFilename(scene.studio!.name);
  const sanitizedDate = sanitizeFilename(scene.date);
  const sanitizedTitle = sanitizeFilename(scene.title);
  const phash = file.fingerprint || null;

  // Build basename with phash if available
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
