"use strict";
(() => {
  // src/lib/settings.ts
  var PLUGIN_ID = "stashIngest";
  var DEFAULTS = {
    handleDuplicates: false,
    vrTagName: "VR"
  };
  function readPluginSettings() {
    try {
      const result = gql.Do(`query { configuration { plugins } }`);
      const raw = result?.configuration?.plugins?.[PLUGIN_ID] ?? {};
      return {
        handleDuplicates: raw.handleDuplicates ?? DEFAULTS.handleDuplicates,
        vrTagName: raw.vrTagName ?? DEFAULTS.vrTagName
      };
    } catch (e) {
      log.Warn(`Failed to read plugin settings, using defaults: ${e}`);
      return { ...DEFAULTS };
    }
  }

  // src/lib/utils.ts
  function sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, "");
  }
  function isVR(tags, vrTagName) {
    const target = vrTagName.toLowerCase();
    return tags.some((t) => t.name.toLowerCase() === target);
  }

  // src/lib/validation.ts
  function checkFileIsReadyForRename(sceneId) {
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
  `, { id: sceneId, fpType: "phash" });
    log.Debug(`Scene ${sceneId} fetched: ${JSON.stringify(result)}`);
    const scene = result?.findScene;
    if (!scene) {
      log.Debug(`Scene ${sceneId} not found`);
      return null;
    }
    if (!(scene.title && scene.studio?.name && scene.date)) {
      log.Debug(`Scene missing title, studio, or date, skipping ...`);
      return null;
    }
    if (!scene.organized) {
      log.Debug(`Organized is not set to true, skipping ...`);
      return null;
    }
    if (scene.files.length === 0) {
      log.Debug(`Scene has no files, skipping ...`);
      return null;
    }
    const file = scene.files[0];
    if (!file.fingerprint) {
      log.Debug(`Scene file has no phash, skipping ...`);
      return null;
    }
    const fileParts = file.path.split("/");
    fileParts.pop();
    const ext = file.basename.split(".").pop();
    const fileDir = fileParts.pop();
    const fileLibraryPath = fileParts.join("/");
    if (fileDir !== ".StashIngest") {
      log.Debug(`File is not in /.StashIngest directory, skipping ...`);
      return null;
    }
    const sanitizedStudio = sanitizeFilename(scene.studio.name);
    const sanitizedDate = sanitizeFilename(scene.date);
    const sanitizedTitle = sanitizeFilename(scene.title);
    const phash = file.fingerprint;
    return {
      sceneId: scene.id,
      title: scene.title,
      studio: scene.studio.name,
      date: scene.date,
      fileId: file.id,
      file,
      tags: scene.tags,
      destinationFolder: `${fileLibraryPath}/${sanitizedStudio}`,
      destinationBasename: `${sanitizedStudio} - ${sanitizedDate} - ${sanitizedTitle} [${phash}].${ext}`,
      phash
    };
  }

  // src/lib/duplicates.ts
  var CODEC_RANK = {
    av1: 3,
    hevc: 2,
    h264: 1,
    vp9: 1,
    mpeg4: 0,
    wmv3: 0
  };
  function findExistingDuplicate(phash) {
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
      tags: scene.tags ?? []
    };
  }
  function shouldReplace(existingFile, candidateFile, vrScene) {
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
  function codecRank(file) {
    return CODEC_RANK[file.video_codec] ?? 0;
  }
  function moveToDuplicates(fileId, filePath) {
    const parts = filePath.split("/");
    const basename = parts.pop();
    parts.pop();
    const libraryPath = parts.join("/");
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
      dest_basename: basename
    });
  }

  // src/stashIngest.ts
  log.Debug("Stash Ingest Plugin Loaded");
  log.Debug(`input.Args.hookContext follows:	
${JSON.stringify(input.Args.hookContext)}`);
  if (input.Args.hookContext.type === "Scene.Update.Post") {
    log.Debug("Hook Scene.Update.Post triggered");
    const settings = readPluginSettings();
    log.Debug(`Plugin settings: ${JSON.stringify(settings)}`);
    const sceneIds = input.Args.hookContext.input.hasOwnProperty("ids") ? input.Args.hookContext.input.ids : [input.Args.hookContext.input.id];
    sceneIds.forEach((sceneId) => {
      const sceneData = checkFileIsReadyForRename(sceneId);
      log.Debug(`Returned scene data: ${JSON.stringify(sceneData)}`);
      if (!sceneData) {
        log.Debug("Scene data is null, terminating run.");
        return;
      }
      if (settings.handleDuplicates) {
        const existing = findExistingDuplicate(sceneData.phash);
        if (existing) {
          const vrScene = isVR(sceneData.tags, settings.vrTagName);
          log.Debug(`Duplicate found (scene ${existing.id}). VR: ${vrScene}`);
          if (shouldReplace(existing.file, sceneData.file, vrScene)) {
            log.Info(`Candidate wins \u2014 replacing existing scene ${existing.id} file`);
            moveToDuplicates(existing.file.id, existing.file.path);
            moveFile(sceneData);
          } else {
            log.Info(`Existing scene ${existing.id} wins \u2014 moving candidate to .StashDuplicates`);
            moveToDuplicates(sceneData.fileId, sceneData.file.path);
          }
          return;
        }
      }
      moveFile(sceneData);
    });
  }
  function moveFile(sceneData) {
    log.Debug(`Moving file ${sceneData.fileId} to ${sceneData.destinationFolder}/${sceneData.destinationBasename}`);
    const mutationResult = gql.Do(`
    mutation moveFiles($id: ID!, $dest_folder: String, $dest_basename: String) {
      moveFiles(input: {
        ids: [$id],
        destination_folder: $dest_folder,
        destination_basename: $dest_basename
      })
    }
  `, {
      id: sceneData.fileId,
      dest_folder: sceneData.destinationFolder,
      dest_basename: sceneData.destinationBasename
    });
    log.Debug(`Move file mutation result: ${JSON.stringify(mutationResult)}`);
  }
})();
// Plugin return value
({ Output: "ok" });
