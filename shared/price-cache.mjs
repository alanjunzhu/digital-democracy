/**
 * Compact on-disk cache of daily closing prices, one file per ticker.
 *
 * Yahoo's chart endpoint does not grant CORS to arbitrary origins, so the
 * browser cannot fetch price history from a static GitHub Pages build. Every
 * series is therefore fetched once by `scripts/fetch-stock-prices.mjs` and read
 * back at build time.
 *
 * Stored shape keeps dates and closes as parallel arrays, which is roughly a
 * third the size of an array of `{ date, close }` objects.
 */

import { normalizeTickerSymbol } from './stock-prices.mjs';

export const PRICE_DIR = 'prices';
export const BENCHMARK_TICKER = 'SPY';

/**
 * Tickers like `BRK.B` and `BF/B` are legal symbols but poor file names.
 */
export function priceCacheFileName(ticker) {
  const symbol = normalizeTickerSymbol(ticker);
  if (!symbol) return null;
  return `${symbol.replace(/[^A-Z0-9]+/g, '_')}.json`;
}

export function priceCachePath(ticker) {
  const file = priceCacheFileName(ticker);
  return file ? `${PRICE_DIR}/${file}` : null;
}

/** `[{ date, close }]` -> `{ ticker, dates, closes }`. */
export function encodePriceSeries(ticker, rows, extra = {}) {
  const dates = [];
  const closes = [];

  for (const row of rows || []) {
    if (!row?.date || row.close == null || Number.isNaN(row.close)) continue;
    dates.push(row.date);
    // Sub-cent precision is noise for percentage returns and costs ~40% of the file.
    closes.push(Math.round(row.close * 10000) / 10000);
  }

  return {
    ticker: normalizeTickerSymbol(ticker),
    fetchedAt: new Date().toISOString(),
    start: dates[0] || null,
    end: dates[dates.length - 1] || null,
    count: dates.length,
    ...extra,
    dates,
    closes,
  };
}

/** `{ dates, closes }` -> `[{ date, close }]`, the shape the analysis code wants. */
export function decodePriceSeries(cached) {
  const dates = cached?.dates || [];
  const closes = cached?.closes || [];
  const rows = [];

  for (let i = 0; i < dates.length; i++) {
    if (closes[i] == null) continue;
    rows.push({ date: dates[i], close: closes[i] });
  }

  return rows;
}

/**
 * Decode only the rows inside [startDate, endDate], for sparkline windows.
 */
export function decodePriceWindow(cached, startDate, endDate) {
  const start = startDate || '';
  const end = endDate || '9999-12-31';
  return decodePriceSeries(cached).filter((row) => row.date >= start && row.date <= end);
}

/**
 * A cached series is stale once the newest close is older than maxAgeDays.
 * Weekends and holidays mean "yesterday" is often the freshest close available.
 */
export function isPriceCacheFresh(cached, today, maxAgeDays = 4) {
  if (!cached?.end) return false;
  const end = new Date(`${cached.end}T12:00:00Z`);
  const now = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(end.getTime()) || Number.isNaN(now.getTime())) return false;
  const ageDays = Math.round((now - end) / (1000 * 60 * 60 * 24));
  return ageDays <= maxAgeDays;
}

/**
 * Build a reader bound to a `readJSON`-style loader, so scripts (data dir) and
 * Astro pages (repo-relative fs reads) can share the same lookup logic.
 */
export function createPriceCacheReader(loadJSON) {
  const memo = new Map();

  return function readPrices(ticker) {
    const path = priceCachePath(ticker);
    if (!path) return null;
    if (memo.has(path)) return memo.get(path);
    const cached = loadJSON(path);
    memo.set(path, cached);
    return cached;
  };
}
