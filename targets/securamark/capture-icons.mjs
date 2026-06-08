// Capture SecuraMark's icon usage into ./icons.json (the icon analogue of the
// token capture). Scans the read-only source for which icons it imports + the
// set's style; writes a committed artifact the preview renders from.
//
// Usage: node targets/securamark/capture-icons.mjs [path-to-securamark-frontend]
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { captureIconUsage } from '../../design-system/src/utils/icons.js';

const here = dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] || `${process.env.HOME}/Projects/securamark-frontend`;
const iconsData = JSON.parse(readFileSync(resolve(here, '../../design-system/icons.json'), 'utf8'));

const capture = captureIconUsage(resolve(source, 'src'), iconsData);
writeFileSync(resolve(here, 'icons.json'), `${JSON.stringify(capture, null, 2)}\n`);
console.log(`✓ captured ${capture.icons.length} ${capture.set} icons · style ${JSON.stringify(capture.style)}`);
