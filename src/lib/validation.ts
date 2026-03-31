import { pluginLog } from './log';
import { sanitizeFilename } from './utils';

/**
 * Fetches scene data and validates that all rename conditions are met:
 * - Scene has title, studio.name, date, organized = true
 * - Scene has at least one file with a phash fingerprint
 * - File is located in a .StashIngest directory
 *
 * Returns a ScenePayload if ready, or null if any check fails.
 */
export function checkFileIsReadyForRename(sceneId: string): ScenePayload | null {
  const result = gql.Do(`
    query getSceneById($id: ID!, $fpType: String!) {
      findScene(id: $id) {
        id, title, studio { name }, date, organized,
        tags { name },
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

  if (!file.fingerprint) {
    pluginLog.Debug(`Scene ${sceneId} file has no phash, skipping`);
    return null;
  }

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
  const phash = file.fingerprint;

  return {
    sceneId: scene.id,
    title: scene.title,
    studio: scene.studio!.name,
    date: scene.date,
    fileId: file.id,
    file,
    tags: scene.tags,
    destinationFolder: `${fileLibraryPath}/${sanitizedStudio}`,
    destinationBasename: `${sanitizedStudio} - ${sanitizedDate} - ${sanitizedTitle} [${phash}].${ext}`,
    phash,
  };
}
