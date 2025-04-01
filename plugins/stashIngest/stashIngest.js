(function () {
  'use strict';

  log.Debug(`Stash Ingest Plugin Loaded`)
  log.Debug(`input.Args.hookContext follows:\t\n${JSON.stringify(input.Args.hookContext)}`);

  // On Scene.Update.Post Hook ...
  if (input.Args.hookContext.type === "Scene.Update.Post") {
    log.Debug(`Hook Scene.Update.Post triggered`);

    // If multiple scenes triggered, use input.ids, if just one scene, default to input.id
    const sceneIds = (input.Args.hookContext.input.hasOwnProperty('ids')) ? input.Args.hookContext.input.ids : [input.Args.hookContext.input.id];

    sceneIds.forEach((sceneId) => {
      // Check that all rename conditions are met:
      //   - Scene has id, title, studio.name, date, organized = true
      //   - Scene has at least one file and that the first file has an id, path, and basename.
      const sceneData = checkFileIsReadyForRename(sceneId);
      log.Debug(`Returned scene data: ${JSON.stringify(sceneData)}`);

      // Move target file to Studio-based directory
      log.Debug(`Moving file ${sceneData.fileId} to ${sceneData.destinationFolder}/${sceneData.destinationBasename}`);
      let mutationResult = gql.Do(`
        mutation moveFiles($id:ID!,$dest_folder:String,$dest_basename:String) {
          moveFiles(input: {
            ids:[$id],
            destination_folder:$dest_folder,
            destination_basename:$dest_basename
          })
        }
        `, {
          'id': sceneData.fileId,
          'dest_folder': sceneData.destinationFolder,
          'dest_basename': sceneData.destinationBasename
        });
      log.Debug(`Move file mutation result: ${JSON.stringify(mutationResult)}`);
    });

  }
  
  
  // Return ok
  return { Output: "ok" };

})();

/**
 * Removes characters invalid in most filesystems: < > : " / \ | ? *
 * and control characters (ASCII 0-31).
 *
 * @param {string} filename - The original filename.
 * @returns {string} The sanitized filename.
 */
function sanitizeFilename(filename) {
  // Replace characters that are invalid in Windows/macOS/Linux filenames.
  // Also removes ASCII control characters (0-31).
  return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
}

/**
 * Checks for scene data.
 * 
 * @param {number} sceneId - scene id integer
 * @returns {object} - returns the scene object or null
 */
function checkFileIsReadyForRename(sceneId) {
    // GQL Call
    const result = gql.Do(`
      query getSceneById($id: ID!) {
        findScene(id: $id) {
          id, title, studio { name }, date, organized, files { id, path, basename }
        }
      }
      `,
      { 'id' : sceneId }
    );
    log.Debug(`Scene ${sceneId} fetched: ${JSON.stringify(result)}`);

    // Check if scene has title, studio, and date populated
    if (!(result.findScene.title && result.findScene.studio.name && result.findScene.date)) {
      log.Debug(`Scene missing either title, studio, date, or organized tag, or all, skipping ...`);
      return null;
    }

    // Check if organized = true
    if (!(result.findScene.organized)) {
      log.Debug(`Organized is not set to true, skipping ...`);
      return null;
    }

    // Check files array is not empty
    if (result.findScene.files.length === 0) {
      log.Debug(`Scene has no files, skipping ...`);
      return null;
    }

    // Check if first file has id, path, and basename
    const fileId = result.findScene.files[0].id; // get fileid

    const filePath = result.findScene.files[0].path; // get file path
    const fileParts = filePath.split('/'); // file path parts
    const fileName = fileParts.pop(); // filename, should be the same as basename
    const ext = result.findScene.files[0].basename.split('.').pop(); // get file extension
    const fileDir = fileParts.pop(); // target file's immediate folder, should be ".StashIngest"
    const fileLibraryPath = fileParts.join('/'); // ".StashIngest's parent folder", should be the library path but doesn't have to be

    if (fileDir !== ".StashIngest") {
      log.Debug(`File is not in /.StashIngest directory, skipping ...`);
      return null;
    }
    
    // Construct return payload
    const sanitizedStudioName = sanitizeFilename(result.findScene.studio.name);
    const sanitizedDate = sanitizeFilename(result.findScene.date);
    const sanitizedTitle = sanitizeFilename(result.findScene.title);

    return {
      sceneId: result.findScene.id,
      title: result.findScene.title,
      studio: result.findScene.studio.name,
      date: result.findScene.date,
      fileId,
      destinationFolder: `${fileLibraryPath}/${sanitizedStudioName}`,
      destinationBasename: `${sanitizedStudioName} - ${sanitizedDate} - ${sanitizedTitle}.${ext}`
    }
}