/**
 * Build-time assembly of the data a TradeTimingInsight panel needs.
 *
 * Counterfactuals come from data/finances/trade-timing.json and the sparkline
 * window is sliced out of the per-ticker price cache, so nothing has to be
 * fetched from the browser — Yahoo does not grant CORS to a static site.
 */

import { addDays } from './stock-prices.mjs';
import { createPriceCacheReader, decodePriceWindow } from './price-cache.mjs';
import { DEFAULT_HORIZON_DAYS, tradeTimingKey } from './trade-timing.mjs';

export const CHART_LEAD_DAYS = 30;
export const CHART_TRAIL_DAYS = 15;

export function chartWindowBounds(transactionDate, horizonDays = DEFAULT_HORIZON_DAYS) {
  if (!transactionDate) return null;
  const start = addDays(transactionDate, -CHART_LEAD_DAYS);
  const end = addDays(transactionDate, horizonDays + CHART_TRAIL_DAYS);
  return start && end ? { start, end } : null;
}

/**
 * Returns a `attachPrecomputedTiming(trade)` bound to one loader, memoising each
 * ticker's price file across every trade it is given.
 *
 * Pass a memoising loader (see shared/data-loader.mjs) when building many pages:
 * the timing index is read once per attacher, and there is one attacher per page.
 */
export function createTimingAttacher(loadJSON, { horizonDays = DEFAULT_HORIZON_DAYS } = {}) {
  const timingIndex = loadJSON('finances/trade-timing.json');
  const readPriceCache = createPriceCacheReader(loadJSON);

  return function attachPrecomputedTiming(trade) {
    const entry = timingIndex?.entries?.[tradeTimingKey(trade)];
    if (!entry?.counterfactuals?.ok) return { ...trade, precomputed: null };

    const bounds = chartWindowBounds(trade.transactionDate, horizonDays);
    const cached = bounds ? readPriceCache(trade.ticker) : null;
    const prices = cached ? decodePriceWindow(cached, bounds.start, bounds.end) : [];

    return {
      ...trade,
      precomputed: { prices, counterfactuals: entry.counterfactuals },
    };
  };
}
