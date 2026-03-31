const PREFIX = '[stashIngest]';

export const pluginLog = {
  Trace: (...args: unknown[]) => log.Trace(`${PREFIX}`, ...args),
  Debug: (...args: unknown[]) => log.Debug(`${PREFIX}`, ...args),
  Info: (...args: unknown[]) => log.Info(`${PREFIX}`, ...args),
  Warn: (...args: unknown[]) => log.Warn(`${PREFIX}`, ...args),
  Error: (...args: unknown[]) => log.Error(`${PREFIX}`, ...args),
};
