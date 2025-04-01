(function () {
  'use strict';

  log.Info(`Stash Ingest Plugin Loaded`)
  log.Info(`Input1: `,input);
  log.Info(`Input2: `,input.Args);
  log.Info(`Input3: `,input.Args.hookContext);
  log.Info(`Input4: `,input.Args.hookContext.type);

  return { Output: "ok" };

})();