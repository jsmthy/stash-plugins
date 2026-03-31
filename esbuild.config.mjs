import { build } from 'esbuild';

await build({
  entryPoints: ['src/stashIngest.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  platform: 'neutral',
  outfile: 'plugins/stashIngest/stashIngest.js',
  minify: false,
  sourcemap: false,
  footer: { js: '// Plugin return value\n({ Output: "ok" });' },
});
