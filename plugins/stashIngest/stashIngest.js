(function () {
  'use strict';

  log.Debug(`Stash Ingest Plugin Loaded`)
  log.Debug(`input.Args.hookContext`);
  log.Debug(JSON.stringify(input.Args.hookContext));

  return { Output: "ok" };

})();