import { pluginLog } from './lib/log';
import { readPluginSettings } from './lib/settings';
import { checkFileIsReadyForRename } from './lib/validation';
import { findExistingDuplicate, shouldReplace, moveToDuplicates } from './lib/duplicates';
import { isVR } from './lib/utils';

pluginLog.Debug('Stash Ingest Plugin Loaded');
pluginLog.Debug(`input.Args.hookContext follows:\t\n${JSON.stringify(input.Args.hookContext)}`);

if (input.Args.hookContext.type === 'Scene.Update.Post') {
  pluginLog.Debug('Hook Scene.Update.Post triggered');

  const settings = readPluginSettings();
  pluginLog.Debug(`Plugin settings: ${JSON.stringify(settings)}`);

  const sceneIds: string[] = input.Args.hookContext.input.hasOwnProperty('ids')
    ? input.Args.hookContext.input.ids
    : [input.Args.hookContext.input.id];

  sceneIds.forEach((sceneId: string) => {
    const sceneData = checkFileIsReadyForRename(sceneId);
    pluginLog.Debug(`Returned scene data: ${JSON.stringify(sceneData)}`);

    if (!sceneData) {
      pluginLog.Debug('Scene data is null, terminating run.');
      return;
    }

    if (settings.handleDuplicates) {
      const existing = findExistingDuplicate(sceneData);

      if (existing) {
        const vrScene = isVR(sceneData.tags, settings.vrTagName);
        pluginLog.Debug(`Duplicate found (scene ${existing.id}, method: ${existing.matchMethod}). VR: ${vrScene}`);

        if (shouldReplace(existing.file, sceneData.file, vrScene)) {
          pluginLog.Info(`Candidate wins — replacing existing scene ${existing.id} file`);
          moveToDuplicates(existing.file.id, existing.file.path);
          moveFile(sceneData);
        } else {
          pluginLog.Info(`Existing scene ${existing.id} wins — moving candidate to .StashDuplicates`);
          moveToDuplicates(sceneData.fileId, sceneData.file.path);
        }
        return;
      }
    }

    moveFile(sceneData);
  });
}

function moveFile(sceneData: ScenePayload): void {
  pluginLog.Debug(`Moving file ${sceneData.fileId} to ${sceneData.destinationFolder}/${sceneData.destinationBasename}`);
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
  pluginLog.Debug(`Move file mutation result: ${JSON.stringify(mutationResult)}`);
}
