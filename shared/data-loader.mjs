/**
 * Reads generated JSON out of data/ for Astro pages.
 *
 * Static builds render 500+ member pages in one process, and the shared index
 * files (trade timing, per-ticker prices) are identical for every one of them.
 * Parsing them per page dominates build time, so reads are memoised for the life
 * of the process — the files cannot change mid-build. A dev server picks up
 * regenerated data on restart.
 *
 * Use this for shared indexes, not for per-page records like
 * `data/members/<bioguideId>.json`, which are read once each anyway and would
 * only pile up in memory.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const cache = new Map();

export function loadDataJSON(relativePath) {
  if (cache.has(relativePath)) return cache.get(relativePath);

  const fullPath = join(process.cwd(), 'data', relativePath);
  let parsed = null;
  if (existsSync(fullPath)) {
    try {
      parsed = JSON.parse(readFileSync(fullPath, 'utf-8'));
    } catch {
      parsed = null;
    }
  }

  cache.set(relativePath, parsed);
  return parsed;
}

/** Drop memoised reads — for tests and long-lived dev processes. */
export function clearDataCache() {
  cache.clear();
}
