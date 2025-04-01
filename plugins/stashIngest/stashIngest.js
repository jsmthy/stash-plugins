(function () {
  'use strict';

  log.Debug(`Stash Ingest Plugin Loaded`)
  log.Debug(`input.Args.hookContext`);
  log.Debug(JSON.stringify(input.Args.hookContext));


  // on Scene.Update.Post
  if (input.Args.hookContext.type === "Scene.Update.Post") {
    log.Debug(`Hook Scene.Update.Post triggered`);

    // get the scene id
    const sceneId = input.Args.hookContext.input.id;
    
    // gql call get scene by id
    var query = "\
      query getSceneById($id: ID!) {\
        findScene(id: $id) {\
          id, title, studio { name }, date, organized, files { id, path, basename }\
        }\
      }";

    let result = gql.Do(query, { 'id' : sceneId } );
    log.Debug(result);

    // check if scene has title, studio, and date populated
    if (!(result.findScene.title && result.findScene.studio && result.findScene.date && result.findScene.organized)) {
      log.Debug(`Scene missing either title, studio, date, or organized tag, or all, skipping ...`);
      return { Output: "ok" };
    }

    // check files array is not empty
    if (result.findScene.files.length === 0) {
      log.Debug(`Scene has no files, skipping ...`);
      return { Output: "ok" };
    }

    // get first file id
    const fileId = result.findScene.files[0].id;

    // get path by fetching files[0].path and removing the filename.ext and its immediate folder which should be `/.StashIngest`
    const filePath = result.findScene.files[0].path;

    // check that the file's directory is equal to `/.StashIngest`
    const fileParts = filePath.split('/');
    const fileName = fileParts.pop(); // remove filename.ext
    const fileDir = fileParts.pop(); // remove immediate folder
    const fileLibraryPath = fileParts.join('/'); // join the rest of the path
    if (fileDir !== ".StashIngest") {
      log.Debug(`File is not in /.StashIngest directory, skipping ...`);
      return { Output: "ok" };
    }

    // get ext
    const ext = result.findScene.files[0].basename.split('.').pop();

    // set newFilename [Studio]/[Studio] - [YYYY-MM-DD] - [Title].ext
    const destination_basename = `${result.findScene.studio.name}/${result.findScene.studio.name} - ${result.findScene.date} - ${result.findScene.title}.${ext}`;
    const destination_folder = `${fileLibraryPath}/${result.findScene.studio.name}`;

    // move files
    var mutation = "\
      mutation moveFiles($id:ID!,$dest_folder:String,$dest_basename:String) {\
        moveFiles(input: {\
          ids:[$id],\
          destination_folder:$dest_folder,\
          destination_basename:$dest_basename\
        })\
      }";

    var variables = {
      'id': fileId,
      'dest_folder': destination_folder,
      'dest_basename': destination_basename
    }

    log.Debug(`Moving file ${fileId} to ${destination_folder}/${destination_basename}`);
    let mutationResult = gql.Do(mutation, variables);
    log.Debug(mutationResult);

     
  }

  //     check if studio, date, and title are set
  //     alt path if jav(?)
  // move file to [Studio]/[Studio] - [YYYY-MM-DD] - [Title].ext

  return { Output: "ok" };

})();