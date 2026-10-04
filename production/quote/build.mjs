import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
let worker = fs.readFileSync(path.join(here, 'src/worker.template.mjs'), 'utf8');
for (const [token, file] of [['WIDGET_JS', 'widget.js'], ['QUOTE_LANDING_HTML', 'landing.html']]) {
  const marker = `__PP_BUNDLE_${token}__`;
  if (worker.split(marker).length !== 2) throw new Error(`Expected one ${marker}`);
  worker = worker.replace(marker, () => JSON.stringify(fs.readFileSync(path.join(here, 'src', file), 'utf8')));
}
fs.mkdirSync(path.join(here, 'dist'), {recursive: true});
fs.writeFileSync(path.join(here, 'dist/worker.mjs'), worker);
console.log('Built production quote bundle. No deployment performed.');
