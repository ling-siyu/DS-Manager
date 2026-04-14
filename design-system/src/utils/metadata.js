import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = resolve(__dirname, '../../package.json');

let cachedPackageJson = null;

function readPackageJson() {
  if (cachedPackageJson) return cachedPackageJson;

  cachedPackageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return cachedPackageJson;
}

export function getPackageJson() {
  return readPackageJson();
}

export function getDsmVersion() {
  return readPackageJson().version;
}
