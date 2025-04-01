(function () {
  'use strict';

  log.Debug(`Stash Ingest Plugin Loaded`)
  log.Debug(`Input1: `,input);
  log.Debug(`Input2: `,input.Args);
  log.Debug(`Input3: `,input.Args.hookContext);
  log.Debug(`Input4: `,input.Args.hookContext.type);

  return { Output: "ok" };

})();