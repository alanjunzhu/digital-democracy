#!/usr/bin/env node
/**
 * Precompute counterfactual timing for every committee-overlap trade, reading
 * daily closes from the local price cache rather than the network.
 *
 * Output: data/finances/trade-timing.json — counterfactuals only. The price
 * series stays in data/prices/, and pages slice their own sparkline window from
 * it at build time, so a trade appearing on two pages is not stored twice.
 *
 * Run scripts/fetch-stock-prices.mjs first.
 */

import { readJSON, writeJSON } from './lib/data-writer.mjs';
import { createPriceCacheReader, decodePriceSeries } from '../shared/price-cache.mjs';
import {
  computeCounterfactuals,
  DEFAULT_HORIZON_DAYS,
  isPurchaseType,
  isSaleType,
  tradeTimingKey,
} from '../shared/trade-timing.mjs';

/**
 * Every trade whose sector matches a committee the member sits on — the same
 * predicate the member page uses to decide what to chart, so every candidate it
 * renders finds a precomputed entry here.
 */
export function overlapTrades(financeData) {
  const rows = [];

  for (const [bioguideId, profile] of Object.entries(financeData?.members || {})) {
    const committeeSectors = profile.committeeSectors || [];
    if (!committeeSectors.length) continue;

    for (const trade of profile.trades || []) {
      if (!trade.ticker || trade.ticker === '--' || !trade.transactionDate) continue;
      if (!committeeSectors.includes(trade.sector)) continue;
      if (!isPurchaseType(trade.type) && !isSaleType(trade.type)) continue;
      rows.push({ ...trade, bioguideId, memberName: profile.name || trade.member || '' });
    }
  }

  return rows;
}

function main() {
  const financeData = readJSON('finances/by-member.json');
  if (!financeData) {
    console.error('No finance data found');
    process.exit(1);
  }

  const readPriceCache = createPriceCacheReader(readJSON);
  const seriesCache = new Map();

  function pricesFor(ticker) {
    if (!seriesCache.has(ticker)) {
      seriesCache.set(ticker, decodePriceSeries(readPriceCache(ticker)));
    }
    return seriesCache.get(ticker);
  }

  const trades = overlapTrades(financeData);
  const output = {
    lastUpdated: new Date().toISOString(),
    horizonDays: DEFAULT_HORIZON_DAYS,
    entries: {},
  };

  const missingTickers = new Set();
  let computed = 0;
  let pending = 0;

  for (const trade of trades) {
    const key = tradeTimingKey(trade);
    if (output.entries[key]) continue;

    const prices = pricesFor(trade.ticker);
    if (!prices.length) {
      missingTickers.add(trade.ticker);
      continue;
    }

    const counterfactuals = computeCounterfactuals(trade, prices, DEFAULT_HORIZON_DAYS);
    if (!counterfactuals.ok) continue;

    output.entries[key] = { counterfactuals };
    computed++;
    if (!counterfactuals.horizonComplete) pending++;
  }

  writeJSON('finances/trade-timing.json', output);
  console.log(
    `Wrote ${computed} timing entries (${pending} still inside their ${DEFAULT_HORIZON_DAYS}-day window)`,
  );
  if (missingTickers.size) {
    console.warn(
      `No cached prices for ${missingTickers.size} tickers: ${[...missingTickers].slice(0, 15).join(', ')}${missingTickers.size > 15 ? '…' : ''}`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
