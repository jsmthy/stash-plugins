import { pluginLog } from './lib/log';
import { readPluginSettings } from './lib/settings';
import { checkFileIsReadyForRename, isStillInStashIngest, sceneHasFileOutsideIngest } from './lib/validation';
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

    if (!sceneData) {
      pluginLog.Debug(`Scene ${sceneId} not ready, skipping.`);
      return;
    }

    pluginLog.Info(`Processing scene ${sceneId}: ${sceneData.file.basename}`);

    // Check if this scene already has a file outside .StashIngest/.StashDuplicates
    // (same scene, multiple files — the .StashIngest copy is redundant)
    if (sceneHasFileOutsideIngest(sceneData.sceneId, sceneData.fileId)) {
      pluginLog.Info(`Scene ${sceneId} already has a file at destination — moving redundant .StashIngest copy to .StashDuplicates`);
      moveToDuplicates(sceneData.fileId, sceneData.file.path);
      return;
    }

    if (settings.handleDuplicates) {
      const existing = findExistingDuplicate(sceneData);

      if (existing) {
        const vrScene = isVR(sceneData.tags, settings.vrTagName);
        pluginLog.Info(`Duplicate found (scene ${existing.id}, method: ${existing.matchMethod}). VR: ${vrScene}`);
        pluginLog.Info(`  Candidate: ${sceneData.file.height}p ${sceneData.file.video_codec} (${sceneData.file.basename})`);
        pluginLog.Info(`  Existing:  ${existing.file.height}p ${existing.file.video_codec} (${existing.file.basename})`);

        if (shouldReplace(existing.file, sceneData.file, vrScene)) {
          pluginLog.Info(`Candidate wins — replacing existing scene ${existing.id} file`);

          if (!moveToDuplicates(existing.file.id, existing.file.path)) {
            pluginLog.Error(`Failed to move existing file to .StashDuplicates, aborting`);
            return;
          }
          moveFile(sceneData);
        } else {
          pluginLog.Info(`Existing scene ${existing.id} wins — moving candidate to .StashDuplicates`);

          if (!isStillInStashIngest(sceneData.sceneId)) {
            pluginLog.Warn(`Incoming file already moved (concurrent hook?), skipping`);
            return;
          }

          moveToDuplicates(sceneData.fileId, sceneData.file.path);
        }
        return;
      }
    }

    // Re-verify file is still in .StashIngest before moving
    if (!isStillInStashIngest(sceneData.sceneId)) {
      pluginLog.Warn(`File already moved (concurrent hook?), skipping`);
      return;
    }

    moveFile(sceneData);
  });
}

function moveFile(sceneData: ScenePayload): void {
  pluginLog.Info(`Moving file ${sceneData.fileId} to ${sceneData.destinationFolder}/${sceneData.destinationBasename}`);
  try {
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
    pluginLog.Debug(`Move result: ${JSON.stringify(mutationResult)}`);
  } catch (e) {
    pluginLog.Error(`Failed to move file ${sceneData.fileId}: ${e}`);
  }
}
