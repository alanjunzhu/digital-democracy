/**
 * Portfolio counterfactuals — one member, or Congress as a whole.
 *
 * Member-level: if you had mirrored this member's disclosed stock purchases, how
 * would you have done against buying the S&P 500 with the same money on the same
 * days, or against not investing it at all?
 *
 * Congress-level: the same question, pooled across every disclosed purchase,
 * with a second line that keeps only the trades in a sector the member's
 * committee oversees. Holdings are isolated per member, so one person's sale
 * cannot close someone else's shares of the same ticker.
 *
 * The model, and why:
 *
 * - Every disclosed purchase contributes the midpoint of its amount range to all
 *   three portfolios on the same day. Identical cash flows are what make the
 *   comparison fair, so the cash line doubles as the capital-deployed line.
 * - A sale closes up to the quantity held from earlier in-window purchases and
 *   moves the proceeds to the portfolio's own cash sleeve. The benchmark and cash
 *   portfolios are untouched by it — that divergence is exactly the value (or
 *   cost) of the decision to sell.
 * - Members routinely sell positions they acquired long before the disclosure
 *   window opens. Those sales cannot be represented and are counted separately
 *   rather than silently dropped.
 * - The follower line repeats the member's purchases on each trade's *disclosure*
 *   date, which is the first day the public could have acted. The gap between it
 *   and the member line is the part of the result that was never available to
 *   anyone reading the filings.
 *
 * Disclosed amounts are ranges, so every value here is an estimate. 81% of trades
 * fall in the widest-relative bracket ($1,001-$15,000), which is why the output
 * carries `estimated: true` and the UI must say so.
 */

import { rowOnOrBefore } from './stock-prices.mjs';
import { normalizeOwner } from './finance-sources.mjs';

export { normalizeOwner };

export const BENCHMARK_LABEL = 'S&P 500';

/**
 * "$1,001 - $15,000" -> { min: 1001, max: 15000, mid: 8000.5 }
 * Open-ended top brackets ("$50,000,001 +") use the bound itself as the midpoint
 * rather than inventing a ceiling.
 */
export function parseAmountRange(label) {
  const raw = String(label || '').replace(/[$,]/g, '').trim();
  if (!raw) return null;

  const range = raw.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max, mid: (min + max) / 2 };
  }

  const open = raw.match(/^(\d+(?:\.\d+)?)\s*\+$/);
  if (open) {
    const min = Number(open[1]);
    if (!Number.isFinite(min)) return null;
    return { min, max: null, mid: min };
  }

  const single = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (single) {
    const value = Number(single[1]);
    return Number.isFinite(value) ? { min: value, max: value, mid: value } : null;
  }

  return null;
}

function isPurchase(type) {
  return String(type || '').toLowerCase().includes('purchase');
}

function isSale(type) {
  return String(type || '').toLowerCase().includes('sale');
}

function priceAt(series, date) {
  return rowOnOrBefore(series, date)?.close ?? null;
}

/**
 * Daily portfolio values for a member's disclosed trades.
 *
 * @param trades      the member's ticker-level trades
 * @param getSeries   ticker -> [{ date, close }] ascending, or null
 * @param options.benchmarkTicker  symbol backing the index line
 * @param options.maxPoints        downsample the output to at most this many dates
 * @param options.includeFollower  repeat purchases on disclosure dates (member charts)
 */
export function buildPortfolioSeries(trades, getSeries, options = {}) {
  const { benchmarkTicker = 'SPY', maxPoints = 260, includeFollower = true } = options;

  const benchmarkSeries = getSeries(benchmarkTicker) || [];
  if (!benchmarkSeries.length) {
    return { ok: false, reason: 'no_benchmark_prices' };
  }

  const priced = [];
  const skipped = { noPrice: 0, noAmount: 0, unmatchedSales: 0, outsideBenchmark: 0 };

  for (const trade of trades || []) {
    const purchase = isPurchase(trade.type);
    const sale = isSale(trade.type);
    if (!purchase && !sale) continue;
    if (!trade.ticker || trade.ticker === '--' || !trade.transactionDate) continue;

    const amount = parseAmountRange(trade.amount);
    if (!amount) {
      skipped.noAmount++;
      continue;
    }

    const series = getSeries(trade.ticker);
    if (!series?.length) {
      skipped.noPrice++;
      continue;
    }

    priced.push({ trade, purchase, sale, amount, series });
  }

  if (!priced.length) {
    return { ok: false, reason: 'no_priced_trades', skipped };
  }

  const seriesByTicker = new Map(priced.map((p) => [p.trade.ticker, p.series]));

  // Start at the first purchase, not the first trade. An unmatched sale ahead of
  // it deploys no capital, so every line would sit flat at 0% until the first
  // buy — a stretch of chart that looks like performance and is really absence.
  const firstPurchase = priced
    .filter((p) => p.purchase)
    .map((p) => p.trade.transactionDate)
    .sort()[0];
  if (!firstPurchase) {
    // Every sale here is of a position bought before the disclosure window, so
    // report them rather than returning a bare reason.
    skipped.unmatchedSales += priced.filter((p) => p.sale).length;
    return { ok: false, reason: 'no_priced_purchases', skipped };
  }

  // The benchmark trades every market day, so its dates are the shared calendar.
  const calendar = benchmarkSeries
    .filter((row) => row.date >= firstPurchase)
    .map((row) => row.date);
  if (calendar.length < 2) {
    return { ok: false, reason: 'window_too_short', skipped };
  }
  const windowEnd = calendar[calendar.length - 1];

  // Events keyed by the date each portfolio acts on them.
  const windowStart = calendar[0];
  const byDate = new Map();
  function addEvent(date, event) {
    // Only calendar days are simulated, so an event outside the benchmark's own
    // range would never be applied. Report it rather than losing it.
    if (!date || date > windowEnd || date < windowStart) return false;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(event);
    return true;
  }

  const benchmarkStart = benchmarkSeries[0].date;

  let followerSkipped = 0;
  for (const entry of priced) {
    if (!addEvent(entry.trade.transactionDate, { kind: 'member', entry })) {
      // A trade before the first purchase is a sale of a position acquired
      // earlier — unrepresentable for the same reason as any other unmatched
      // sale, and quite different from one the benchmark simply cannot price.
      const pricedByBenchmark =
        entry.trade.transactionDate >= benchmarkStart && entry.trade.transactionDate <= windowEnd;
      if (pricedByBenchmark && entry.sale) skipped.unmatchedSales++;
      else skipped.outsideBenchmark++;
    }
    if (includeFollower) {
      // A filing dated before the trade it reports is bad upstream data; fall back
      // to the transaction date rather than letting the follower act early.
      const disclosed = entry.trade.disclosureDate && entry.trade.disclosureDate >= entry.trade.transactionDate
        ? entry.trade.disclosureDate
        : entry.trade.transactionDate;
      if (!addEvent(disclosed, { kind: 'follower', entry })) followerSkipped++;
    }
  }

  // Valuing holdings by scanning each price series per day is quadratic, and a
  // member with 1,500 trades across 80 tickers makes that the whole build. Walk
  // each series once against the shared calendar instead, so lookups are O(1).
  const alignedPrices = new Map();
  for (const [ticker, series] of seriesByTicker) {
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
    alignedPrices.set(ticker, aligned);
  }

  const benchmarkAligned = new Float64Array(calendar.length);
  {
    let cursor = 0;
    let last = NaN;
    for (let i = 0; i < calendar.length; i++) {
      while (cursor < benchmarkSeries.length && benchmarkSeries[cursor].date <= calendar[i]) {
        last = benchmarkSeries[cursor].close;
        cursor++;
      }
      benchmarkAligned[i] = last;
    }
  }

  const member = { holdings: new Map(), cash: 0 };
  const follower = { holdings: new Map(), cash: 0 };
  let benchmarkUnits = 0;
  let contributed = 0;
  // The follower deploys the same capital later, so it needs its own
  // contributed-to-date. Measuring it against the member's would read as a huge
  // loss during the window where it simply has not bought yet.
  let followerContributed = 0;

  function applyPurchase(book, entry, date) {
    const price = priceAt(entry.series, date);
    if (price == null || price <= 0) return 0;
    const qty = entry.amount.mid / price;
    const lots = lotMap(book, entry.trade);
    lots.set(entry.trade.ticker, (lots.get(entry.trade.ticker) || 0) + qty);
    return entry.amount.mid;
  }

  function applySale(book, entry, date, countUnmatched) {
    const lots = lotMap(book, entry.trade);
    const held = lots.get(entry.trade.ticker) || 0;
    if (held <= 0) {
      if (countUnmatched) skipped.unmatchedSales++;
      return;
    }
    const price = priceAt(entry.series, date);
    if (price == null || price <= 0) return;
    const qty = Math.min(held, entry.amount.mid / price);
    const remaining = held - qty;
    if (remaining <= 0) lots.delete(entry.trade.ticker);
    else lots.set(entry.trade.ticker, remaining);
    book.cash += qty * price;
  }

  function bookValue(book, i) {
    let total = book.cash;
    for (const lots of book.holdings.values()) {
      for (const [ticker, qty] of lots) {
        if (qty <= 0) continue;
        const price = alignedPrices.get(ticker)?.[i];
        if (Number.isFinite(price)) total += qty * price;
      }
    }
    return total;
  }

  const dates = [];
  const memberValues = [];
  const benchmarkValues = [];
  const cashValues = [];
  const followerValues = [];
  const followerCashValues = [];
  const markers = [];

  for (let i = 0; i < calendar.length; i++) {
    const date = calendar[i];
    for (const event of byDate.get(date) || []) {
      const { kind, entry } = event;
      const book = kind === 'member' ? member : follower;

      if (entry.purchase) {
        const spent = applyPurchase(book, entry, date);
        if (spent > 0) {
          if (kind === 'member') {
            contributed += spent;
            const benchmarkPrice = benchmarkAligned[i];
            if (benchmarkPrice > 0) benchmarkUnits += spent / benchmarkPrice;
          } else {
            followerContributed += spent;
          }
        }
      } else {
        applySale(book, entry, date, kind === 'member');
      }

      if (kind === 'member') {
        markers.push({
          date,
          ticker: entry.trade.ticker,
          type: entry.trade.type,
          isPurchase: entry.purchase,
          amountMid: entry.amount.mid,
          amountLabel: entry.trade.amount || '',
          owner: normalizeOwner(entry.trade.owner),
          bioguideId: entry.trade.bioguideId || null,
          sector: entry.trade.sector || null,
          committeeOverlap: entry.trade.committeeOverlap === true,
          disclosureDate: entry.trade.disclosureDate || null,
        });
      }
    }

    dates.push(date);
    memberValues.push(bookValue(member, i));
    followerValues.push(bookValue(follower, i));
    cashValues.push(contributed);
    followerCashValues.push(followerContributed);
    benchmarkValues.push(benchmarkUnits * (benchmarkAligned[i] || 0));
  }

  // Members who only sold in this window contribute nothing, so every line sits
  // at zero and there is no comparison to draw. Say so rather than charting it.
  if (contributed <= 0) {
    return { ok: false, reason: 'no_priced_purchases', skipped };
  }

  const result = {
    ok: true,
    estimated: true,
    benchmarkTicker,
    contributed,
    skipped,
    followerSkipped,
    markers,
    ...downsample(
      {
        dates,
        member: memberValues,
        benchmark: benchmarkValues,
        cash: cashValues,
        follower: followerValues,
        followerCash: followerCashValues,
      },
      maxPoints,
    ),
  };

  result.summary = summarize(result);
  return result;
}

/**
 * Holdings are a map of owner → ticker → quantity. The owner key is the
 * bioguide id when present, so pooling every member's trades into one book
 * cannot let one sale close another member's shares of the same ticker. A
 * single-member chart has one owner (or a blank key) and behaves as before.
 */
function lotMap(book, trade) {
  const owner = trade.bioguideId || '';
  let lots = book.holdings.get(owner);
  if (!lots) {
    lots = new Map();
    book.holdings.set(owner, lots);
  }
  return lots;
}

/**
 * Keep every event date plus an even sample of the rest — a plain stride would
 * drop the days the trade markers sit on.
 */
function sampleIndices(total, maxPoints) {
  if (!Number.isFinite(maxPoints) || total <= maxPoints) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const stride = Math.ceil(total / maxPoints);
  const keep = new Set([0, total - 1]);
  for (let i = 0; i < total; i += stride) keep.add(i);
  return [...keep].sort((a, b) => a - b);
}

function downsample(series, maxPoints) {
  const indices = sampleIndices(series.dates.length, maxPoints);
  if (indices.length === series.dates.length) return series;
  const out = {};
  for (const [key, value] of Object.entries(series)) {
    out[key] = Array.isArray(value) ? indices.map((i) => value[i]) : value;
  }
  return out;
}

/** Paint a shorter series onto a longer calendar, holding the last value. */
function overlaySeries(dates, source, key) {
  const values = new Array(dates.length).fill(0);
  if (!source?.ok || !source.dates?.length) return values;
  const idx = new Map(source.dates.map((d, i) => [d, i]));
  let last = 0;
  for (let i = 0; i < dates.length; i++) {
    const j = idx.get(dates[i]);
    if (j != null) last = source[key][j];
    values[i] = last;
  }
  return values;
}

function pctDiff(value, reference) {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) return null;
  return ((value - reference) / reference) * 100;
}

export function summarize(series) {
  const last = (arr) => (arr?.length ? arr[arr.length - 1] : null);
  const endMember = last(series.member);
  const endBenchmark = last(series.benchmark);
  const endCash = last(series.cash);
  const endFollower = last(series.follower);
  const endFollowerCash = last(series.followerCash);

  return {
    asOf: last(series.dates),
    endMember,
    endBenchmark,
    endCash,
    endFollower,
    contributed: series.contributed,
    returnPct: pctDiff(endMember, endCash),
    benchmarkReturnPct: pctDiff(endBenchmark, endCash),
    vsBenchmarkPct: pctDiff(endMember, endBenchmark),
    vsCashPct: pctDiff(endMember, endCash),
    followerReturnPct: pctDiff(endFollower, endFollowerCash),
    /**
     * How much of the member's return a filing reader could not have captured.
     * Both are measured against their own deployed capital, so the gap is not an
     * artifact of the follower buying later.
     */
    disclosureGapPct:
      endMember != null && endFollower != null && endCash && endFollowerCash
        ? pctDiff(endMember, endCash) - pctDiff(endFollower, endFollowerCash)
        : null,
  };
}

function countOwners(markers) {
  return new Set(markers.map((m) => m.bioguideId).filter(Boolean)).size;
}

export function summarizeCongress(series) {
  const last = (arr) => (arr?.length ? arr[arr.length - 1] : null);
  const endAll = last(series.all);
  const endBenchmark = last(series.benchmark);
  const endCash = last(series.cash);
  const endCommittee = last(series.committee);
  const endCommitteeCash = last(series.committeeCash);
  const endCommitteeBenchmark = last(series.committeeBenchmark);

  return {
    asOf: last(series.dates),
    endAll,
    endBenchmark,
    endCash,
    endCommittee,
    endCommitteeCash,
    endCommitteeBenchmark,
    contributed: series.contributed,
    committeeContributed: series.committeeContributed,
    allReturnPct: pctDiff(endAll, endCash),
    benchmarkReturnPct: pctDiff(endBenchmark, endCash),
    cashReturnPct: 0,
    committeeReturnPct: pctDiff(endCommittee, endCommitteeCash),
    committeeBenchmarkReturnPct: pctDiff(endCommitteeBenchmark, endCommitteeCash),
    allVsBenchmarkPct: pctDiff(endAll, endBenchmark),
    committeeVsOwnBenchmarkPct: pctDiff(endCommittee, endCommitteeBenchmark),
  };
}

/** Below this many purchases, one trade can drive the whole line. */
export const THIN_PURCHASES = 5;

function displayName(name) {
  const raw = String(name || '').trim();
  const comma = raw.indexOf(',');
  if (comma <= 0) return raw;
  return `${raw.slice(comma + 1).trim()} ${raw.slice(0, comma).trim()}`;
}

function groupTradesByMember(trades, names = {}) {
  const map = new Map();
  for (const trade of trades || []) {
    const id = trade.bioguideId;
    if (!id) continue;
    let row = map.get(id);
    if (!row) {
      row = {
        bioguideId: id,
        name: displayName(names[id] || trade.memberName || id),
        trades: [],
      };
      map.set(id, row);
    }
    if (names[id]) row.name = displayName(names[id]);
    else if (trade.memberName) row.name = displayName(trade.memberName);
    row.trades.push(trade);
  }
  return [...map.values()];
}

function indexGrowth(values, cash) {
  return values.map((v, i) => (cash[i] > 0 ? (v / cash[i] - 1) * 100 : 0));
}

function roundPlot(values) {
  return values.map((v) => Math.round(v * 10) / 10);
}

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * Upper Tukey outliers that also beat the market — the lines that leave the
 * pack behind, not merely the least-bad of a losing group.
 */
export function flagExceptionalMembers(members, { benchmarkReturnPct = null } = {}) {
  const returns = members
    .map((m) => m.returnPct)
    .filter((v) => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  const q1 = percentile(returns, 0.25);
  const q3 = percentile(returns, 0.75);
  const fence = q1 != null && q3 != null ? q3 + 1.5 * (q3 - q1) : Infinity;

  return members.map((m) => {
    const r = m.returnPct;
    const beatsMarket = benchmarkReturnPct == null || (r != null && r > benchmarkReturnPct);
    return {
      ...m,
      exceptional: Boolean(r != null && Number.isFinite(r) && r > fence && beatsMarket),
    };
  });
}

/**
 * Congress as one portfolio: every disclosed purchase vs the S&P 500 vs cash,
 * plus a committee-overlap book that only takes trades in a sector that
 * member's committee oversees.
 *
 * The two trading books deploy different amounts on different days, so the
 * chart compares growth per dollar, not dollars. The S&P line is matched to
 * Trading (all); committee-vs-its-own-index lives in the summary.
 */
export function buildCongressPortfolioSeries(trades, getSeries, options = {}) {
  const { benchmarkTicker = 'SPY', maxPoints = 260, names = {} } = options;
  const shared = { benchmarkTicker, maxPoints: Infinity, includeFollower: false };

  const all = buildPortfolioSeries(trades, getSeries, shared);
  if (!all.ok) return all;

  const overlapTrades = (trades || []).filter((t) => t.committeeOverlap);
  const committee = overlapTrades.length
    ? buildPortfolioSeries(overlapTrades, getSeries, shared)
    : { ok: false };

  const memberRows = [];
  for (const group of groupTradesByMember(trades, names)) {
    const built = buildPortfolioSeries(group.trades, getSeries, shared);
    if (!built.ok) continue;
    const values = overlaySeries(all.dates, built, 'member');
    const cash = overlaySeries(all.dates, built, 'cash');
    const purchases = built.markers.filter((m) => m.isPurchase).length;
    memberRows.push({
      bioguideId: group.bioguideId,
      name: group.name,
      plot: indexGrowth(values, cash),
      returnPct: built.summary.returnPct,
      vsBenchmarkPct: built.summary.vsBenchmarkPct,
      vsAllPct:
        built.summary.returnPct != null && all.summary.returnPct != null
          ? built.summary.returnPct - all.summary.returnPct
          : null,
      purchases,
      contributed: built.contributed,
      thin: purchases < THIN_PURCHASES,
    });
  }

  const indices = sampleIndices(all.dates.length, maxPoints);
  const pick = (arr) => indices.map((i) => arr[i]);

  const sampled = {
    dates: pick(all.dates),
    all: pick(all.member),
    benchmark: pick(all.benchmark),
    cash: pick(all.cash),
    committee: pick(overlaySeries(all.dates, committee, 'member')),
    committeeCash: pick(overlaySeries(all.dates, committee, 'cash')),
    committeeBenchmark: pick(overlaySeries(all.dates, committee, 'benchmark')),
  };

  const committeeMarkers = committee.ok ? committee.markers : [];
  const result = {
    ok: true,
    estimated: true,
    benchmarkTicker,
    contributed: all.contributed,
    committeeContributed: committee.ok ? committee.contributed : 0,
    skipped: all.skipped,
    counts: {
      purchases: all.markers.filter((m) => m.isPurchase).length,
      overlapPurchases: committeeMarkers.filter((m) => m.isPurchase).length,
      members: countOwners(all.markers),
      overlapMembers: countOwners(committeeMarkers),
      exceptional: 0,
    },
    ...sampled,
  };
  result.summary = summarizeCongress(result);
  result.members = flagExceptionalMembers(
    memberRows.map((m) => ({ ...m, plot: roundPlot(pick(m.plot)) })),
    { benchmarkReturnPct: result.summary.benchmarkReturnPct },
  );
  result.counts.exceptional = result.members.filter((m) => m.exceptional).length;
  return result;
}
