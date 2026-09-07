// Every function named by an inline on* attribute must be exported onto window,
// or the button silently does nothing. In a classic script top-level functions
// were implicitly global and this was free; under ES modules it is not.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = d => readdirSync(d).flatMap(f => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk('src').filter(f => /\.(html|js)$/.test(f));
const sources = Object.fromEntries(files.map(f => [f, readFileSync(f, 'utf8')]));

// Names referenced from an on* attribute, in static markup or generated strings.
const referenced = new Map();
for (const [file, src] of Object.entries(sources))
  for (const m of src.matchAll(/\bon[a-z]+\s*=\s*(?:"|'|\\")\s*([A-Za-z_$][\w$]*)\s*\(/g))
    if (!referenced.has(m[1])) referenced.set(m[1], file);

// Names exported onto window.
const exported = new Set();
for (const src of Object.values(sources))
  for (const m of src.matchAll(/Object\.assign\(\s*window\s*,\s*\{([\s\S]*?)\}\s*\)/g))
    for (const n of m[1].split(',')) {
      const name = n.split(':')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) exported.add(name);
    }
for (const src of Object.values(sources))
  for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) exported.add(m[1]);

const missing = [...referenced].filter(([n]) => !exported.has(n));
if (missing.length) {
  console.error('\n✗ inline handlers referenced but not exported onto window:\n');
  for (const [n, f] of missing) console.error(`    ${n}   (${f})`);
  console.error('\n  Add them to the Object.assign(window, {...}) block in src/app.js.\n');
  process.exit(1);
}
console.log(`✓ all ${referenced.size} inline handler(s) are exported on window`);
