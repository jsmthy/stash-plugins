import { isVR } from './utils';

/** Codec compression efficiency ranking — higher is better compression. */
const CODEC_RANK: Record<string, number> = {
  av1: 3,
  hevc: 2,
  h264: 1,
  vp9: 1,
  mpeg4: 0,
  wmv3: 0,
};

interface ExistingScene {
  id: string;
  file: VideoFile;
  tags: Tag[];
}

/**
 * Find an already-ingested scene with the same phash (exact match)
 * that is NOT in .StashIngest.
 */
export function findExistingDuplicate(phash: string): ExistingScene | null {
  const result = gql.Do(`
    query findDupes($phash: String!) {
      findScenes(
        scene_filter: {
          phash_distance: { value: $phash, modifier: EQUALS, distance: 0 }
          path: { value: ".StashIngest", modifier: EXCLUDES }
        }
      ) {
        scenes {
          id
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
  `, { phash });

  const scenes = result?.findScenes?.scenes;
  if (!scenes || scenes.length === 0) {
    return null;
  }

  const scene = scenes[0];
  if (!scene.files || scene.files.length === 0) {
    return null;
  }

  return {
    id: scene.id,
    file: scene.files[0],
    tags: scene.tags ?? [],
  };
}

/**
 * Determine whether the candidate file should replace the existing file.
 *
 * 2D scenes: prefer 1080p — if below 1080p prefer higher; if above prefer
 *   closer to 1080p (but never below it). Ties broken by codec efficiency.
 * VR scenes: always prefer highest resolution. Ties broken by codec efficiency.
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

  // 2D logic
  const candBelow = candidateFile.height < TARGET;
  const existBelow = existingFile.height < TARGET;

  // Candidate below 1080p, existing at/above — keep existing
  if (candBelow && !existBelow) return false;
  // Existing below 1080p, candidate at/above — replace
  if (existBelow && !candBelow) return true;
  // Both below 1080p — prefer higher
  if (candBelow && existBelow) {
    if (candidateFile.height !== existingFile.height) {
      return candidateFile.height > existingFile.height;
    }
    return codecRank(candidateFile) > codecRank(existingFile);
  }

  // Both at/above 1080p — prefer closer to 1080p
  const candDist = candidateFile.height - TARGET;
  const existDist = existingFile.height - TARGET;
  if (candDist !== existDist) {
    return candDist < existDist;
  }

  // Same resolution — prefer higher compression codec
  return codecRank(candidateFile) > codecRank(existingFile);
}

function codecRank(file: VideoFile): number {
  return CODEC_RANK[file.video_codec] ?? 0;
}

/**
 * Move a file to the .StashDuplicates folder within the same library path.
 */
export function moveToDuplicates(fileId: string, filePath: string): void {
  const parts = filePath.split('/');
  const basename = parts.pop()!;
  parts.pop(); // remove current directory (e.g. .StashIngest or studio folder)
  const libraryPath = parts.join('/');
  const destFolder = `${libraryPath}/.StashDuplicates`;

  log.Info(`Moving duplicate file ${fileId} to ${destFolder}/${basename}`);
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
    dest_basename: basename,
  });
}
