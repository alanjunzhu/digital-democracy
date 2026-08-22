/**
 * Historical stock prices via Yahoo Finance chart API.
 */

const DAY_SEC = 86400;

/**
 * How far back a close may sit from a requested date and still stand in for it.
 * Covers a long holiday weekend; beyond that the series does not cover the date.
 */
export const MAX_PRICE_STALENESS_DAYS = 10;

export function normalizeTickerSymbol(ticker) {
  const raw = String(ticker || '').trim().toUpperCase();
  if (!raw || raw === '--') return null;
  return raw.replace(/^\$+/, '');
}

export function dateToUnix(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

export function unixToDate(unix) {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

export function parseYahooChartPayload(payload) {
  const result = payload?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const rows = [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || Number.isNaN(close)) continue;
    rows.push({ date: unixToDate(timestamps[i]), close });
  }

  return rows;
}

export function buildYahooChartUrl(ticker, startDate, endDate) {
  const symbol = normalizeTickerSymbol(ticker);
  if (!symbol) return null;
  const period1 = dateToUnix(startDate);
  const period2 = dateToUnix(endDate);
  if (period1 == null || period2 == null) return null;
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1 - 45 * DAY_SEC}&period2=${period2 + 120 * DAY_SEC}&interval=1d`;
}

export async function fetchYahooPrices(ticker, startDate, endDate, fetchImpl = fetch) {
  const url = buildYahooChartUrl(ticker, startDate, endDate);
  if (!url) return [];

  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CongressTracker/1.0)' },
  });
  if (!response.ok) throw new Error(`Yahoo chart HTTP ${response.status}`);
  const payload = await response.json();
  return parseYahooChartPayload(payload);
}

/** Most recent row at or before targetDate, or null. */
export function rowOnOrBefore(prices, targetDate) {
  const target = String(targetDate || '');
  let best = null;
  for (const row of prices || []) {
    if (row.date <= target) best = row;
    else break;
  }
  return best;
}

export function priceOnOrBefore(prices, targetDate) {
  return rowOnOrBefore(prices, targetDate)?.close ?? null;
}

export function priceOnOrAfter(prices, targetDate) {
  for (const row of prices || []) {
    if (row.date >= targetDate) return row.close;
  }
  return null;
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const da = new Date(`${a}T12:00:00Z`);
  const db = new Date(`${b}T12:00:00Z`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

/**
 * Forward return from startDate over horizonDays using daily close prices.
 *
 * Returns null when the series does not actually reach the horizon — a trade
 * made three weeks ago has no 60-day outcome yet, and reporting the latest
 * close as if it were one would overstate a short window as a full horizon.
 */
export function forwardReturnDetail(prices, startDate, horizonDays) {
  const startRow = rowOnOrBefore(prices, startDate);
  const endDate = addDays(startDate, horizonDays);
  if (!startRow || !endDate) return null;

  // Markets close for weekends and holidays, so the nearest earlier close is
  // normally a day or two back. A larger gap means the series simply does not
  // cover this date, and reusing the last close would price the trade at a
  // quote from months or years earlier.
  const staleness = daysBetween(startRow.date, startDate);
  if (staleness == null || staleness > MAX_PRICE_STALENESS_DAYS) return null;

  const startPrice = startRow.close;
  const endPrice = priceOnOrBefore(prices, endDate);
  if (endPrice == null) return null;

  const lastAvailable = prices?.[prices.length - 1]?.date || null;
  const complete = lastAvailable != null && lastAvailable >= endDate;

  return {
    pct: ((endPrice - startPrice) / startPrice) * 100,
    startDate,
    endDate,
    lastAvailable,
    complete,
  };
}

export function forwardReturn(prices, startDate, horizonDays) {
  const detail = forwardReturnDetail(prices, startDate, horizonDays);
  if (!detail || !detail.complete) return null;
  return detail.pct;
}

export function slicePriceWindow(prices, startDate, endDate) {
  return (prices || []).filter((p) => p.date >= startDate && p.date <= endDate);
}
