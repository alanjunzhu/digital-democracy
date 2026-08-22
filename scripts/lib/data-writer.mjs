import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const DATA_DIR = process.env.CONGRESS_DATA_DIR
  ? resolve(process.env.CONGRESS_DATA_DIR)
  : new URL('../../data', import.meta.url).pathname;

export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function writeJSON(relativePath, data) {
  const fullPath = join(DATA_DIR, relativePath);
  ensureDir(dirname(fullPath));
  writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`  Wrote ${relativePath}`);
}

export function readJSON(relativePath) {
  const fullPath = join(DATA_DIR, relativePath);
  if (!existsSync(fullPath)) return null;
  return JSON.parse(readFileSync(fullPath, 'utf-8'));
}

export function getDataDir() {
  return DATA_DIR;
}
