/**
 * Historical stock prices via Yahoo Finance chart API.
 */

const DAY_SEC = 86400;

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

export function priceOnOrBefore(prices, targetDate) {
  const target = String(targetDate || '');
  let best = null;
  for (const row of prices || []) {
    if (row.date <= target) best = row;
    else break;
  }
  return best?.close ?? null;
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
 */
export function forwardReturn(prices, startDate, horizonDays) {
  const startPrice = priceOnOrBefore(prices, startDate);
  const endDate = addDays(startDate, horizonDays);
  if (startPrice == null || !endDate) return null;
  const endPrice = priceOnOrBefore(prices, endDate);
  if (endPrice == null) return null;
  return ((endPrice - startPrice) / startPrice) * 100;
}

export function slicePriceWindow(prices, startDate, endDate) {
  return (prices || []).filter((p) => p.date >= startDate && p.date <= endDate);
}
