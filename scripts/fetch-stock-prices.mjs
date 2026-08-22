#!/usr/bin/env node
/**
 * Build the daily-close price cache used by the counterfactual charts.
 *
 * One Yahoo request per ticker covers every trade in that ticker, instead of
 * one request per trade. Output: data/prices/<TICKER>.json
 *
 * Flags:
 *   --all      cache every traded ticker, not just committee-overlap ones
 *   --force    refetch tickers that already have a fresh cache file
 *   --limit=N  stop after N tickers (useful for a smoke test)
 */

import { readJSON, writeJSON, getDataDir } from './lib/data-writer.mjs';
import { fetchYahooPrices } from '../shared/stock-prices.mjs';
import { isPurchaseType, isSaleType } from '../shared/trade-timing.mjs';
import {
  BENCHMARK_TICKER,
  encodePriceSeries,
  isPriceCacheFresh,
  priceCachePath,
} from '../shared/price-cache.mjs';
import { existsSync } from 'fs';
import { join } from 'path';

const DELAY_MS = 700;
const RETRIES = 3;
// Yahoo rejects windows that start before the symbol existed, so pad rather
// than anchoring to the earliest trade in the whole dataset.
const LOOKBACK_PAD_DAYS = 60;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Which tickers need a price series, and over what window.
 * Overlap tickers (trade sector matches a committee the member sits on) are
 * what the member-page charts draw, so they come first.
 */
export function collectTickerWindows(financeData, { includeAll = false } = {}) {
  const windows = new Map();

  function note(ticker, date, overlap) {
    const symbol = String(ticker || '').trim().toUpperCase();
    if (!symbol || symbol === '--') return;
    const entry = windows.get(symbol) || { ticker: symbol, first: null, last: null, trades: 0, overlap: false };
    entry.trades++;
    entry.overlap = entry.overlap || overlap;
    if (date) {
      if (!entry.first || date < entry.first) entry.first = date;
      if (!entry.last || date > entry.last) entry.last = date;
    }
    windows.set(symbol, entry);
  }

  for (const profile of Object.values(financeData?.members || {})) {
    const committeeSectors = profile.committeeSectors || [];
    for (const trade of profile.trades || []) {
      if (!isPurchaseType(trade.type) && !isSaleType(trade.type)) continue;
      const overlap = trade.sector != null && committeeSectors.includes(trade.sector);
      if (!includeAll && !overlap) continue;
      note(trade.ticker, trade.transactionDate, overlap);
    }
  }

  const rows = [...windows.values()].sort((a, b) => b.trades - a.trades);
  // The benchmark backs the "vs S&P 500" baseline and must span every trade.
  const spanStart = rows.map((r) => r.first).filter(Boolean).sort()[0] || null;
  if (spanStart && !windows.has(BENCHMARK_TICKER)) {
    rows.unshift({ ticker: BENCHMARK_TICKER, first: spanStart, last: today(), trades: 0, overlap: false, benchmark: true });
  }

  return rows;
}

async function fetchWithRetry(ticker, start, end) {
  let lastErr = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await fetchYahooPrices(ticker, start, end);
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) await sleep(DELAY_MS * attempt * 2);
    }
  }
  throw lastErr;
}

async function main() {
  const args = process.argv.slice(2);
  const includeAll = args.includes('--all');
  const force = args.includes('--force');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

  const financeData = readJSON('finances/by-member.json');
  if (!financeData) {
    console.error('No finance data found — run fetch-finances.mjs first');
    process.exit(1);
  }

  const targets = collectTickerWindows(financeData, { includeAll }).slice(0, limit);
  const now = today();
  console.log(`Price cache: ${targets.length} tickers (${includeAll ? 'all traded' : 'committee-overlap'})`);

  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const target of targets) {
    const relPath = priceCachePath(target.ticker);
    if (!relPath) continue;

    if (!force && existsSync(join(getDataDir(), relPath))) {
      const existing = readJSON(relPath);
      if (isPriceCacheFresh(existing, now)) {
        skipped++;
        continue;
      }
    }

    const start = shiftDate(target.first || now, -LOOKBACK_PAD_DAYS);
    try {
      const rows = await fetchWithRetry(target.ticker, start, now);
      if (!rows.length) throw new Error('empty series');
      writeJSON(
        relPath,
        encodePriceSeries(target.ticker, rows, {
          trades: target.trades,
          benchmark: target.benchmark === true,
        }),
      );
      fetched++;
    } catch (err) {
      // Keep whatever is already cached; a delisted or renamed symbol should
      // not blank out a chart that worked yesterday.
      failed++;
      console.warn(`  ✗ ${target.ticker}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done: ${fetched} fetched, ${skipped} still fresh, ${failed} failed`);
  if (fetched === 0 && failed > 0 && skipped === 0) {
    console.error('Every ticker failed — leaving the existing cache in place');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
