import {
  addDays,
  daysBetween,
  forwardReturn,
  normalizeTickerSymbol,
} from './stock-prices.mjs';

export const DEFAULT_HORIZON_DAYS = 60;
export const TIMING_OFFSET_DAYS = 30;

export function isPurchaseType(type) {
  return String(type || '').toLowerCase().includes('purchase');
}

export function isSaleType(type) {
  return String(type || '').toLowerCase().includes('sale');
}

export function disclosureLagDays(trade) {
  const tx = trade?.transactionDate;
  const filed = trade?.disclosureDate;
  if (!tx || !filed) return null;
  return daysBetween(tx, filed);
}

export function buildTradeContext(trade, profile = {}, extra = {}) {
  const overlapFlags = (profile.flags || []).filter(
    (f) => f.type === 'committee_overlap' && f.sector === trade.sector,
  );
  const billFlags = (profile.flags || []).filter((f) => f.type === 'bill_timing');

  const nearbyBills = (extra.sponsoredBills || []).filter((bill) => {
    if (!bill.introducedDate || !trade.transactionDate) return false;
    const diff = Math.abs(daysBetween(bill.introducedDate, trade.transactionDate) ?? 999);
    return diff <= 30;
  });

  return {
    memberName: profile.name || trade.member || extra.memberName || '',
    bioguideId: trade.bioguideId || extra.bioguideId || '',
    ticker: trade.ticker || '',
    type: trade.type || '',
    amount: trade.amount || '',
    sector: trade.sector || null,
    transactionDate: trade.transactionDate || null,
    disclosureDate: trade.disclosureDate || null,
    disclosureLagDays: disclosureLagDays(trade),
    committeeOverlap: overlapFlags.length > 0,
    relatedCommittees: overlapFlags.flatMap((f) => f.relatedCommittees || []),
    allCommittees: profile.committees || [],
    committeeSectors: profile.committeeSectors || [],
    billTimingFlags: billFlags,
    nearbyBills: nearbyBills.map((b) => ({
      billId: b.billId,
      title: b.title,
      introducedDate: b.introducedDate,
      type: b.type,
      number: b.number,
    })),
    filingUrl: trade.url || trade.ptr_link || trade.doc_url || null,
  };
}

/**
 * Counterfactual returns (%), horizonDays forward from each decision date.
 * Purchase: inaction = 0% cash. Sale: inaction = keep holding.
 */
export function computeCounterfactuals(trade, prices, horizonDays = DEFAULT_HORIZON_DAYS) {
  const txDate = trade?.transactionDate;
  if (!txDate || !normalizeTickerSymbol(trade?.ticker)) {
    return { ok: false, reason: 'missing_ticker_or_date' };
  }

  const earlierDate = addDays(txDate, -TIMING_OFFSET_DAYS);
  const laterDate = addDays(txDate, TIMING_OFFSET_DAYS);
  const purchase = isPurchaseType(trade.type);
  const sale = isSaleType(trade.type);

  if (!purchase && !sale) {
    return { ok: false, reason: 'unknown_trade_type' };
  }

  const actualHold = forwardReturn(prices, txDate, horizonDays);
  const earlierHold = earlierDate ? forwardReturn(prices, earlierDate, horizonDays) : null;
  const laterHold = laterDate ? forwardReturn(prices, laterDate, horizonDays) : null;

  let scenarios;
  if (purchase) {
    scenarios = {
      actual: actualHold,
      earlier30: earlierHold,
      later30: laterHold,
      inaction: 0,
    };
    scenarios.labels = {
      actual: `Buy on ${txDate}`,
      earlier30: `Buy 30d earlier`,
      later30: `Buy 30d later`,
      inaction: `Do nothing (cash)`,
    };
  } else {
    scenarios = {
      actual: 0,
      earlier30: earlierDate ? 0 : null,
      later30: laterHold,
      inaction: actualHold,
    };
    scenarios.labels = {
      actual: `Sell on ${txDate} (cash)`,
      earlier30: `Sell 30d earlier (cash)`,
      later30: `Sell 30d later`,
      inaction: `Keep holding`,
    };
  }

  const timingAlternatives = [scenarios.earlier30, scenarios.later30].filter((v) => v != null);
  const timingAvg = timingAlternatives.length
    ? timingAlternatives.reduce((a, b) => a + b, 0) / timingAlternatives.length
    : null;

  const actionAdvantage =
    scenarios.actual != null && scenarios.inaction != null
      ? scenarios.actual - scenarios.inaction
      : null;

  const timingAdvantage =
    scenarios.actual != null && timingAvg != null ? scenarios.actual - timingAvg : null;

  return {
    ok: true,
    horizonDays,
    isPurchase: purchase,
    isSale: sale,
    tradeDate: txDate,
    scenarios,
    actionAdvantage,
    timingAdvantage,
    summary: summarizeScores(actionAdvantage, timingAdvantage, purchase),
  };
}

export function summarizeScores(actionAdvantage, timingAdvantage, isPurchase) {
  const parts = [];
  if (actionAdvantage != null) {
    if (isPurchase) {
      parts.push(
        actionAdvantage > 0
          ? `Buying beat staying in cash by ${actionAdvantage.toFixed(1)}%`
          : `Staying in cash would have beat buying by ${Math.abs(actionAdvantage).toFixed(1)}%`,
      );
    } else {
      parts.push(
        actionAdvantage > 0
          ? `Selling beat holding by ${actionAdvantage.toFixed(1)}%`
          : `Holding would have beat selling by ${Math.abs(actionAdvantage).toFixed(1)}%`,
      );
    }
  }
  if (timingAdvantage != null) {
    parts.push(
      timingAdvantage > 0
        ? `Timing beat alternatives by ${timingAdvantage.toFixed(1)}%`
        : `Alternative timing would have been better by ${Math.abs(timingAdvantage).toFixed(1)}%`,
    );
  }
  return parts.join(' · ');
}

export function tradeTimingKey(trade) {
  return [
    trade.bioguideId || '',
    trade.ticker || '',
    trade.transactionDate || '',
    trade.type || '',
  ].join('|');
}

export function buildSuspiciousTradeCandidates(financeData, { limit = 50, billsBySponsor = {} } = {}) {
  const rows = [];

  for (const [bioguideId, profile] of Object.entries(financeData?.members || {})) {
    const overlapSectors = new Set(
      (profile.flags || [])
        .filter((f) => f.type === 'committee_overlap')
        .map((f) => f.sector),
    );
    if (!overlapSectors.size) continue;

    for (const trade of profile.trades || []) {
      if (!trade.ticker || !trade.transactionDate) continue;
      if (!overlapSectors.has(trade.sector)) continue;
      if (!isPurchaseType(trade.type) && !isSaleType(trade.type)) continue;

      rows.push({
        ...trade,
        bioguideId,
        memberName: profile.name || trade.member || '',
        committeeOverlap: true,
        relatedCommittees: (profile.flags || [])
          .filter((f) => f.type === 'committee_overlap' && f.sector === trade.sector)
          .flatMap((f) => f.relatedCommittees || []),
        context: buildTradeContext(trade, profile, {
          bioguideId,
          memberName: profile.name,
          sponsoredBills: billsBySponsor[bioguideId] || [],
        }),
        priorityScore: (disclosureLagDays(trade) || 0) + (profile.summary?.highSeverityFlags || 0) * 5,
      });
    }
  }

  return rows
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit);
}
