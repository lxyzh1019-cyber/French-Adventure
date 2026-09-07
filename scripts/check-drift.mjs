// Fails if the committed index.html is not what src/ currently builds.
// Catches both directions: forgetting `npm run build` before committing, and
// hand-editing the generated index.html instead of the sources.
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';

// Vite resolves outDir relative to root ('src'), so pass an explicit path.
const OUT = '.drift-check';
const VITE_OUT = '../' + OUT;
try {
  execSync(`npx vite build --outDir ${VITE_OUT} --emptyOutDir --logLevel error`, { stdio: 'inherit' });

  // The banner carries a git sha, so it is the one non-deterministic part of the
  // output and must be stripped before comparing. Keep it that way.
  const stripBanner = s => s.replace(/^<!--[\s\S]*?-->\n/, '');

  const built     = stripBanner(readFileSync(`${OUT}/index.html`, 'utf8'));
  const committed = stripBanner(readFileSync('index.html', 'utf8'));

  if (built !== committed) {
    console.error(`
✗ index.html does not match src/.

  Either you hand-edited index.html — port the change into src/ instead —
  or you forgot to run \`npm run build\` before committing.

  built:     ${built.length} bytes
  committed: ${committed.length} bytes
`);
    process.exit(1);
  }
  console.log('✓ index.html is in sync with src/');
} finally {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
}
