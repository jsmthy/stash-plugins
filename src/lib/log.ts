const PREFIX = '[stashIngest]';

function fmt(...args: unknown[]): string {
  return `${PREFIX} ${args.join(' ')}`;
}

export const pluginLog = {
  Trace: (...args: unknown[]) => log.Trace(fmt(...args)),
  Debug: (...args: unknown[]) => log.Debug(fmt(...args)),
  Info: (...args: unknown[]) => log.Info(fmt(...args)),
  Warn: (...args: unknown[]) => log.Warn(fmt(...args)),
  Error: (...args: unknown[]) => log.Error(fmt(...args)),
};
