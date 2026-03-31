import { pluginLog } from './log';

const PLUGIN_ID = 'stashIngest';

const DEFAULTS: PluginSettings = {
  handleDuplicates: true,
  vrTagName: 'VR',
};

export function readPluginSettings(): PluginSettings {
  try {
    const result = gql.Do(`query { configuration { plugins } }`);
    const raw = result?.configuration?.plugins?.[PLUGIN_ID] ?? {};
    return {
      handleDuplicates: raw.handleDuplicates ?? DEFAULTS.handleDuplicates,
      vrTagName: raw.vrTagName ?? DEFAULTS.vrTagName,
    };
  } catch (e) {
    pluginLog.Warn(`Failed to read plugin settings, using defaults: ${e}`);
    return { ...DEFAULTS };
  }
}
