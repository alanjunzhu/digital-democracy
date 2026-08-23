/**
 * Per-member finance flags for the members directory filter.
 *
 * Built from data already on disk, so browsing "who has a trading record" costs
 * one pass at build time rather than a lookup per card.
 */

import { isPurchaseType, isSaleType } from './trade-timing.mjs';
import { normalizeTickerSymbol } from './stock-prices.mjs';

/** Trade rows that carry a real ticker, as opposed to a bare filing record. */
function isTickerTrade(trade) {
  return Boolean(normalizeTickerSymbol(trade?.ticker));
}

/**
 * @param financeData    data/finances/by-member.json
 * @param cachedTickers  Set of symbols with a price file, or null to skip the
 *                       chartable check entirely
 */
export function buildMemberFinanceIndex(financeData, cachedTickers = null) {
  const index = {};

  for (const [bioguideId, profile] of Object.entries(financeData?.members || {})) {
    const trades = profile.trades || [];
    const tickerTrades = trades.filter(isTickerTrade);
    const purchases = tickerTrades.filter((t) => isPurchaseType(t.type));

    const overlapSectors = new Set(profile.committeeSectors || []);
    const overlapTrades = tickerTrades.filter(
      (t) => t.sector != null && overlapSectors.has(t.sector),
    );

    // The portfolio chart needs at least one purchase it can actually price.
    const chartable = cachedTickers
      ? purchases.some((t) => cachedTickers.has(normalizeTickerSymbol(t.ticker)))
      : purchases.length > 0;

    const entry = {
      trades: tickerTrades.length,
      purchases: purchases.length,
      sales: tickerTrades.filter((t) => isSaleType(t.type)).length,
      // Filings with no ticker are still a disclosure record worth surfacing.
      filings: trades.length - tickerTrades.length,
      overlapTrades: overlapTrades.length,
      flagged: (profile.flags || []).some((f) => f.type === 'committee_overlap'),
      chartable,
    };

    if (entry.trades > 0 || entry.filings > 0) index[bioguideId] = entry;
  }

  return index;
}

export const FINANCE_FILTERS = {
  all: { label: 'Everyone', match: () => true },
  any: {
    label: 'Has financial disclosures',
    match: (f) => Boolean(f) && (f.trades > 0 || f.filings > 0),
  },
  trades: {
    label: 'Has stock trades',
    match: (f) => Boolean(f) && f.trades > 0,
  },
  flagged: {
    label: 'Traded in a sector their committee oversees',
    match: (f) => Boolean(f) && f.overlapTrades > 0,
  },
  chart: {
    label: 'Has a performance chart',
    match: (f) => Boolean(f) && f.chartable,
  },
  none: {
    label: 'No financial records',
    match: (f) => !f || (f.trades === 0 && f.filings === 0),
  },
};

export function matchesFinanceFilter(key, entry) {
  return (FINANCE_FILTERS[key] || FINANCE_FILTERS.all).match(entry);
}
