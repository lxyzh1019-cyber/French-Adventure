import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';

const sha = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'nogit'; }
})();

const BANNER = `<!--
  ============================================================
   GENERATED FILE - DO NOT EDIT

   Edit the sources in src/ then run:  npm run build
     markup ......... src/index.html
     styles ......... src/styles.css
     game logic ..... src/**/*.js

   Built from ${sha}
  ============================================================
-->
`;

export default defineConfig({
  root: 'src',
  plugins: [
    viteSingleFile(),
    {
      // Prepend the do-not-edit banner. check-drift.mjs strips this before
      // comparing, so it must stay the only non-deterministic part of the output.
      name: 'do-not-edit-banner',
      enforce: 'post',
      generateBundle(_opts, bundle) {
        for (const f of Object.values(bundle)) {
          if (f.type === 'asset' && f.fileName.endsWith('.html')) {
            f.source = BANNER + f.source;
          }
        }
      },
    },
  ],
  build: {
    // Write straight to the repo root: `npm run build` means "the deployed file
    // is now up to date". emptyOutDir must stay false or Vite would wipe the repo.
    outDir: '..',
    emptyOutDir: false,
    target: 'es2020',
    // Deliberately unminified. This file is read and occasionally hand-patched,
    // and minifying would make every git diff unreadable.
    minify: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
