/**
 * Congress-wide strategy comparison for the finances page.
 *
 * The member chart answers "how did this one person do". This answers the
 * aggregate question: if you had mirrored Congress's disclosed purchases as a
 * whole, how would that compare to mirroring only the trades that overlap a
 * member's own committee, to buying the index, or to not investing?
 *
 * Every strategy is simulated on one shared calendar so the lines are directly
 * comparable, rather than stitched together from separate runs.
 *
 * Two modelling points that matter for an aggregate:
 *
 * - Holdings are keyed per member *and* ticker. Pooling them by ticker alone
 *   would let one member's sale close another member's position, which is not a
 *   trade anyone made.
 * - Each strategy is measured against its own deployed capital. The committee
 *   subset buys on different days and in different size, so measuring it against
 *   the all-trades capital line would confuse "invested less" with "did worse".
 *
 * As with the member chart, disclosed amounts are ranges, so every dollar figure
 * is an estimate at the midpoint of its range.
 */

import { rowOnOrBefore } from './stock-prices.mjs';
import { isPurchase, isSale, parseAmountRange } from './portfolio-series.mjs';

export const BENCHMARK_LABEL = 'S&P 500';

/** Walk a price series once against the calendar, so lookups are O(1). */
function alignToCalendar(series, calendar) {
  const aligned = new Float64Array(calendar.length);
  let cursor = 0;
  let last = NaN;
  for (let i = 0; i < calendar.length; i++) {
    while (cursor < series.length && series[cursor].date <= calendar[i]) {
      last = series[cursor].close;
      cursor++;
    }
    aligned[i] = last;
  }
  return aligned;
}

function priceAt(series, date) {
  return rowOnOrBefore(series, date)?.close ?? null;
}

/**
 * Flatten every member's ticker trades, tagging each with its owner and whether
 * it falls in a sector one of that member's committees oversees.
 */
export function collectCongressTrades(financeData) {
  const rows = [];

  for (const [bioguideId, profile] of Object.entries(financeData?.members || {})) {
    const committeeSectors = new Set(profile.committeeSectors || []);

    for (const trade of profile.trades || []) {
      if (!trade.ticker || trade.ticker === '--' || !trade.transactionDate) continue;
      if (!isPurchase(trade.type) && !isSale(trade.type)) continue;

      rows.push({
        ...trade,
        bioguideId,
        memberName: profile.name || trade.member || '',
        committeeOverlap: trade.sector != null && committeeSectors.has(trade.sector),
      });
    }
  }

  return rows;
}

/**
 * @param strategies  [{ key, label, trades }] — each an independent portfolio
 * @param getSeries   ticker -> [{ date, close }] ascending, or null
 */
export function buildStrategyComparison(strategies, getSeries, options = {}) {
  const { benchmarkTicker = 'SPY', maxPoints = 300 } = options;

  const benchmarkSeries = getSeries(benchmarkTicker) || [];
  if (!benchmarkSeries.length) return { ok: false, reason: 'no_benchmark_prices' };

  const skipped = { noPrice: 0, noAmount: 0, unmatchedSales: 0, outsideWindow: 0 };
  const seriesByTicker = new Map();
  const prepared = [];

  for (const strategy of strategies) {
    const priced = [];
    for (const trade of strategy.trades || []) {
      const amount = parseAmountRange(trade.amount);
      if (!amount) {
        skipped.noAmount++;
        continue;
      }
      let series = seriesByTicker.get(trade.ticker);
      if (series === undefined) {
        series = getSeries(trade.ticker) || null;
        seriesByTicker.set(trade.ticker, series);
      }
      if (!series?.length) {
        skipped.noPrice++;
        continue;
      }
      priced.push({ trade, amount, series, purchase: isPurchase(trade.type) });
    }
    prepared.push({ ...strategy, priced });
  }

  // The calendar opens at the first purchase any strategy makes. Starting at the
  // first *trade* would prepend a flat stretch of undeployed capital that reads
  // as performance.
  const firstPurchase = prepared
    .flatMap((s) => s.priced.filter((p) => p.purchase).map((p) => p.trade.transactionDate))
    .sort()[0];
  if (!firstPurchase) return { ok: false, reason: 'no_priced_purchases', skipped };

  const calendar = benchmarkSeries
    .filter((row) => row.date >= firstPurchase)
    .map((row) => row.date);
  if (calendar.length < 2) return { ok: false, reason: 'window_too_short', skipped };

  const windowStart = calendar[0];
  const windowEnd = calendar[calendar.length - 1];
  const dateIndex = new Map(calendar.map((d, i) => [d, i]));

  const alignedPrices = new Map();
  for (const [ticker, series] of seriesByTicker) {
    if (series?.length) alignedPrices.set(ticker, alignToCalendar(series, calendar));
  }
  const benchmarkAligned = alignToCalendar(benchmarkSeries, calendar);

  const results = [];

  for (const strategy of prepared) {
    // Events bucketed by calendar index, so the simulation is a single pass.
    const events = new Map();
    for (const entry of strategy.priced) {
      const date = entry.trade.transactionDate;
      if (date < windowStart || date > windowEnd) {
        skipped.outsideWindow++;
        continue;
      }
      // A trade on a non-market day lands on the next session.
      let idx = dateIndex.get(date);
      if (idx === undefined) {
        idx = calendar.findIndex((d) => d >= date);
        if (idx < 0) continue;
      }
      if (!events.has(idx)) events.set(idx, []);
      events.get(idx).push(entry);
    }

    // Keyed per member and ticker: one member's sale must not close another's.
    const holdings = new Map();
    let cash = 0;
    let contributed = 0;
    let benchmarkUnits = 0;

    const value = new Array(calendar.length);
    const deployed = new Array(calendar.length);
    const benchmarkValue = new Array(calendar.length);
    let purchases = 0;
    let sales = 0;

    for (let i = 0; i < calendar.length; i++) {
      for (const entry of events.get(i) || []) {
        const key = `${entry.trade.bioguideId}|${entry.trade.ticker}`;
        const price = alignedPrices.get(entry.trade.ticker)?.[i];
        if (!Number.isFinite(price) || price <= 0) continue;

        if (entry.purchase) {
          holdings.set(key, (holdings.get(key) || 0) + entry.amount.mid / price);
          contributed += entry.amount.mid;
          if (benchmarkAligned[i] > 0) benchmarkUnits += entry.amount.mid / benchmarkAligned[i];
          purchases++;
        } else {
          const held = holdings.get(key) || 0;
          if (held <= 0) {
            skipped.unmatchedSales++;
            continue;
          }
          const qty = Math.min(held, entry.amount.mid / price);
          holdings.set(key, held - qty);
          cash += qty * price;
          sales++;
        }
      }

      let total = cash;
      for (const [key, qty] of holdings) {
        if (qty <= 0) continue;
        const price = alignedPrices.get(key.slice(key.indexOf('|') + 1))?.[i];
        if (Number.isFinite(price)) total += qty * price;
      }

      value[i] = total;
      deployed[i] = contributed;
      benchmarkValue[i] = benchmarkUnits * (benchmarkAligned[i] || 0);
    }

    results.push({
      key: strategy.key,
      label: strategy.label,
      value,
      deployed,
      benchmarkValue,
      purchases,
      sales,
      contributed,
    });
  }

  const sampled = sampleIndices(calendar.length, maxPoints);
  const pick = (arr) => sampled.map((i) => arr[i]);

  // The benchmark line shown is the one fed by the primary strategy's cash flows,
  // so "the market" on the chart is the same money on the same days.
  const primary = results[0];

  return {
    ok: true,
    estimated: true,
    benchmarkTicker,
    dates: pick(calendar),
    benchmark: pick(primary.benchmarkValue),
    benchmarkDeployed: pick(primary.deployed),
    strategies: results.map((r) => ({
      key: r.key,
      label: r.label,
      value: pick(r.value),
      deployed: pick(r.deployed),
      purchases: r.purchases,
      sales: r.sales,
      contributed: r.contributed,
      returnPct: growthPct(last(r.value), last(r.deployed)),
      // Each strategy against the index fed by its own contribution schedule.
      benchmarkReturnPct: growthPct(last(r.benchmarkValue), last(r.deployed)),
      vsBenchmarkPct:
        growthPct(last(r.value), last(r.deployed)) -
        growthPct(last(r.benchmarkValue), last(r.deployed)),
    })),
    skipped,
    asOf: calendar[calendar.length - 1],
  };
}

function last(arr) {
  return arr?.length ? arr[arr.length - 1] : null;
}

/** Growth per dollar deployed, as a percentage. */
export function growthPct(value, deployed) {
  if (!Number.isFinite(value) || !Number.isFinite(deployed) || deployed <= 0) return 0;
  return (value / deployed - 1) * 100;
}

/** Even sample that always keeps the first and last day. */
function sampleIndices(total, maxPoints) {
  if (total <= maxPoints) return Array.from({ length: total }, (_, i) => i);
  const stride = Math.ceil(total / maxPoints);
  const keep = new Set([0, total - 1]);
  for (let i = 0; i < total; i += stride) keep.add(i);
  return [...keep].sort((a, b) => a - b);
}
