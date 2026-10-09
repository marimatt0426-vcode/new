import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
let worker = fs.readFileSync(path.join(here, 'src/worker.template.mjs'), 'utf8');
// The retired widget and landing page are in legacy/2026-10-quote-widget and are no longer bundled.
for (const [token, file] of [['LAUNCHER_JS', 'launcher.js']]) {
  const marker = `__PP_BUNDLE_${token}__`;
  if (worker.split(marker).length !== 2) throw new Error(`Expected one ${marker}`);
  const text = fs.readFileSync(path.join(here, 'src', file), 'utf8').replace(/\r\n/g, '\n');
  worker = worker.replace(marker, () => JSON.stringify(text));
}
fs.mkdirSync(path.join(here, 'dist'), {recursive: true});
fs.writeFileSync(path.join(here, 'dist/worker.mjs'), worker);
console.log('Built production quote bundle. No deployment performed.');
