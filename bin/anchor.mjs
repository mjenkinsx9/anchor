#!/usr/bin/env node
// In a dev checkout, lib/ resolves npm deps (js-yaml, minimatch) from
// node_modules. A plugin-cache install ships no node_modules, so fall back
// to the committed single-file bundle, which has them baked in.
let cli;
try {
  cli = await import(new URL('../lib/cli.mjs', import.meta.url).href);
} catch (err) {
  if (/** @type {{code?: string}} */ (err)?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
  cli = await import(new URL('../dist/anchor.mjs', import.meta.url).href);
}
cli.main();
