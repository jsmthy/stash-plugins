import { readPluginSettings } from './lib/settings';
import { checkFileIsReadyForRename } from './lib/validation';
import { findExistingDuplicate, shouldReplace, moveToDuplicates } from './lib/duplicates';
import { isVR } from './lib/utils';

log.Debug('Stash Ingest Plugin Loaded');
log.Debug(`input.Args.hookContext follows:\t\n${JSON.stringify(input.Args.hookContext)}`);

if (input.Args.hookContext.type === 'Scene.Update.Post') {
  log.Debug('Hook Scene.Update.Post triggered');

  const settings = readPluginSettings();
  log.Debug(`Plugin settings: ${JSON.stringify(settings)}`);

  const sceneIds: string[] = input.Args.hookContext.input.hasOwnProperty('ids')
    ? input.Args.hookContext.input.ids
    : [input.Args.hookContext.input.id];

  sceneIds.forEach((sceneId: string) => {
    const sceneData = checkFileIsReadyForRename(sceneId);
    log.Debug(`Returned scene data: ${JSON.stringify(sceneData)}`);

    if (!sceneData) {
      log.Debug('Scene data is null, terminating run.');
      return;
    }

    if (settings.handleDuplicates) {
      const existing = findExistingDuplicate(sceneData.phash);

      if (existing) {
        const vrScene = isVR(sceneData.tags, settings.vrTagName);
        log.Debug(`Duplicate found (scene ${existing.id}). VR: ${vrScene}`);

        if (shouldReplace(existing.file, sceneData.file, vrScene)) {
          log.Info(`Candidate wins — replacing existing scene ${existing.id} file`);
          // Move the old (losing) file to .StashDuplicates
          moveToDuplicates(existing.file.id, existing.file.path);
          // Move the new (winning) file to the destination
          moveFile(sceneData);
        } else {
          log.Info(`Existing scene ${existing.id} wins — moving candidate to .StashDuplicates`);
          // Move the incoming (losing) file to .StashDuplicates
          moveToDuplicates(sceneData.fileId, sceneData.file.path);
        }
        return;
      }
    }

    // No duplicate or duplicates disabled — move as normal
    moveFile(sceneData);
  });
}

function moveFile(sceneData: ScenePayload): void {
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
    dest_basename: sceneData.destinationBasename,
  });
  log.Debug(`Move file mutation result: ${JSON.stringify(mutationResult)}`);
}
