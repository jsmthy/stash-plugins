import { pluginLog } from './log';

/** Codec compression efficiency ranking — higher is better compression. */
const CODEC_RANK: Record<string, number> = {
  av1: 3,
  hevc: 2,
  h264: 1,
  vp9: 1,
  mpeg4: 0,
  wmv3: 0,
};

/** Path regex to exclude .StashIngest and .StashDuplicates from queries. */
const EXCLUDE_PATH_REGEX = '\\.Stash(Ingest|Duplicates)';

/** GQL fragment for scene file fields used in duplicate queries. */
const SCENE_FILE_FIELDS = `
  id
  tags { name }
  files {
    ... on VideoFile {
      id, path, basename, width, height, video_codec, bit_rate, size,
      fingerprints { type value }
    }
  }
`;

interface ExistingScene {
  id: string;
  file: VideoFile;
  tags: Tag[];
  matchMethod: 'stash_id' | 'phash' | 'metadata';
}

/**
 * Find an existing duplicate using a three-tier fallback:
 * 1. stash_id match (same endpoint + stash_id)
 * 2. phash exact match
 * 3. metadata heuristic (studio + date + performer + normalized title)
 *
 * Only matches scenes in "real" library paths — excludes .StashIngest and .StashDuplicates.
 */
export function findExistingDuplicate(sceneData: ScenePayload): ExistingScene | null {
  // 1. stash_id match
  const stashIdMatch = findByStashId(sceneData.stashIds);
  if (stashIdMatch) {
    pluginLog.Info(`Duplicate match by stash_id: scene ${stashIdMatch.id}`);
    return { ...stashIdMatch, matchMethod: 'stash_id' };
  }

  // 2. phash match
  if (sceneData.phash) {
    const phashMatch = findByPhash(sceneData.phash);
    if (phashMatch) {
      pluginLog.Info(`Duplicate match by phash: scene ${phashMatch.id}`);
      return { ...phashMatch, matchMethod: 'phash' };
    }
  }

  // 3. metadata heuristic
  if (sceneData.performers.length > 0) {
    const metadataMatch = findByMetadata(sceneData);
    if (metadataMatch) {
      pluginLog.Info(`Duplicate match by metadata: scene ${metadataMatch.id}`);
      return { ...metadataMatch, matchMethod: 'metadata' };
    }
  } else {
    pluginLog.Debug(`No performers on scene, skipping metadata heuristic`);
  }

  pluginLog.Debug(`No duplicate found for scene ${sceneData.sceneId}`);
  return null;
}

// -- Tier 1: stash_id match --

function findByStashId(stashIds: StashID[]): Omit<ExistingScene, 'matchMethod'> | null {
  for (const sid of stashIds) {
    const result = gql.Do(`
      query findByStashId($endpoint: String!, $stash_id: String!, $excludePath: String!) {
        findScenes(
          scene_filter: {
            stash_id_endpoint: {
              endpoint: $endpoint,
              stash_id: $stash_id,
              modifier: EQUALS
            }
            path: { value: $excludePath, modifier: NOT_MATCHES_REGEX }
          }
        ) {
          scenes { ${SCENE_FILE_FIELDS} }
        }
      }
    `, { endpoint: sid.endpoint, stash_id: sid.stash_id, excludePath: EXCLUDE_PATH_REGEX });

    const match = extractFirstScene(result);
    if (match) return match;
  }
  return null;
}

// -- Tier 2: phash match --

function findByPhash(phash: string): Omit<ExistingScene, 'matchMethod'> | null {
  const result = gql.Do(`
    query findByPhash($phash: String!, $excludePath: String!) {
      findScenes(
        scene_filter: {
          phash_distance: { value: $phash, modifier: EQUALS, distance: 0 }
          path: { value: $excludePath, modifier: NOT_MATCHES_REGEX }
        }
      ) {
        scenes { ${SCENE_FILE_FIELDS} }
      }
    }
  `, { phash, excludePath: EXCLUDE_PATH_REGEX });

  return extractFirstScene(result);
}

// -- Tier 3: metadata heuristic (studio + date + performer + title) --

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findByMetadata(sceneData: ScenePayload): Omit<ExistingScene, 'matchMethod'> | null {
  const performerIds = sceneData.performers.map(p => p.id);

  const result = gql.Do(`
    query findByMetadata($studioId: [ID!]!, $date: DateCriterionInput!, $performerIds: MultiCriterionInput!, $excludePath: String!) {
      findScenes(
        scene_filter: {
          studios: { value: $studioId, modifier: INCLUDES }
          date: $date
          performers: $performerIds
          path: { value: $excludePath, modifier: NOT_MATCHES_REGEX }
        }
      ) {
        scenes {
          id
          title
          tags { name }
          files {
            ... on VideoFile {
              id, path, basename, width, height, video_codec, bit_rate, size,
              fingerprints { type value }
            }
          }
        }
      }
    }
  `, {
    studioId: [sceneData.studioId],
    date: { value: sceneData.date, modifier: 'EQUALS' },
    performerIds: { value: performerIds, modifier: 'INCLUDES' },
    excludePath: EXCLUDE_PATH_REGEX,
  });

  const scenes = result?.findScenes?.scenes;
  if (!scenes || scenes.length === 0) return null;

  const normalizedIncoming = normalizeTitle(sceneData.title);

  for (const scene of scenes) {
    if (!scene.files || scene.files.length === 0) continue;

    const normalizedExisting = normalizeTitle(scene.title);
    if (normalizedIncoming === normalizedExisting) {
      pluginLog.Debug(`Metadata match: "${sceneData.title}" ≈ "${scene.title}" (scene ${scene.id})`);
      return {
        id: scene.id,
        file: scene.files[0],
        tags: scene.tags ?? [],
      };
    }
  }

  return null;
}

// -- Shared helpers --

function extractFirstScene(result: any): Omit<ExistingScene, 'matchMethod'> | null {
  const scenes = result?.findScenes?.scenes;
  if (!scenes || scenes.length === 0) return null;

  const scene = scenes[0];
  if (!scene.files || scene.files.length === 0) return null;

  return {
    id: scene.id,
    file: scene.files[0],
    tags: scene.tags ?? [],
  };
}

/**
 * Determine whether the candidate file should replace the existing file.
 */
export function shouldReplace(
  existingFile: VideoFile,
  candidateFile: VideoFile,
  vrScene: boolean,
): boolean {
  const TARGET = 1080;

  if (vrScene) {
    if (candidateFile.height !== existingFile.height) {
      return candidateFile.height > existingFile.height;
    }
    return codecRank(candidateFile) > codecRank(existingFile);
  }

  const candBelow = candidateFile.height < TARGET;
  const existBelow = existingFile.height < TARGET;

  if (candBelow && !existBelow) return false;
  if (existBelow && !candBelow) return true;
  if (candBelow && existBelow) {
    if (candidateFile.height !== existingFile.height) {
      return candidateFile.height > existingFile.height;
    }
    return codecRank(candidateFile) > codecRank(existingFile);
  }

  const candDist = candidateFile.height - TARGET;
  const existDist = existingFile.height - TARGET;
  if (candDist !== existDist) {
    return candDist < existDist;
  }

  return codecRank(candidateFile) > codecRank(existingFile);
}

function codecRank(file: VideoFile): number {
  return CODEC_RANK[file.video_codec] ?? 0;
}

/**
 * Extract the library root path from a file path.
 * Finds .StashIngest or .StashDuplicates in the path and returns everything before it.
 * Falls back to popping two levels if neither marker is found.
 */
function getLibraryPathFromFile(filePath: string): string {
  const parts = filePath.split('/');
  const ingestIdx = parts.indexOf('.StashIngest');
  if (ingestIdx > 0) return parts.slice(0, ingestIdx).join('/');
  const dupIdx = parts.indexOf('.StashDuplicates');
  if (dupIdx > 0) return parts.slice(0, dupIdx).join('/');
  // fallback: pop filename and parent dir
  parts.pop();
  parts.pop();
  return parts.join('/');
}

/**
 * Move a file to the .StashDuplicates folder at the library root.
 * Appends a timestamp to the basename to guarantee uniqueness.
 */
export function moveToDuplicates(fileId: string, filePath: string): boolean {
  const libraryPath = getLibraryPathFromFile(filePath);
  const destFolder = `${libraryPath}/.StashDuplicates`;

  const basename = filePath.split('/').pop()!;
  const dotIdx = basename.lastIndexOf('.');
  const ts = Date.now();
  const uniqueBasename = dotIdx > 0
    ? `${basename.substring(0, dotIdx)}_${ts}${basename.substring(dotIdx)}`
    : `${basename}_${ts}`;

  pluginLog.Info(`Moving duplicate file ${fileId} to ${destFolder}/${uniqueBasename}`);
  try {
    gql.Do(`
      mutation moveFiles($id: ID!, $dest_folder: String, $dest_basename: String) {
        moveFiles(input: {
          ids: [$id],
          destination_folder: $dest_folder,
          destination_basename: $dest_basename
        })
      }
    `, {
      id: fileId,
      dest_folder: destFolder,
      dest_basename: uniqueBasename,
    });
    return true;
  } catch (e) {
    pluginLog.Error(`Failed to move duplicate file ${fileId}: ${e}`);
    return false;
  }
}
