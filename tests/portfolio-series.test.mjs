import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortfolioSeries,
  normalizeOwner,
  parseAmountRange,
} from '../shared/portfolio-series.mjs';

test('amount ranges parse to a midpoint', () => {
  assert.deepEqual(parseAmountRange('$1,001 - $15,000'), { min: 1001, max: 15000, mid: 8000.5 });
  assert.deepEqual(parseAmountRange('$15,001 - $50,000'), { min: 15001, max: 50000, mid: 32500.5 });
  // An open-ended top bracket uses its own bound, rather than inventing a ceiling.
  assert.deepEqual(parseAmountRange('$50,000,001 +'), { min: 50000001, max: null, mid: 50000001 });
  assert.equal(parseAmountRange(''), null);
  assert.equal(parseAmountRange('unknown'), null);
});

test('owner codes normalize across source spellings', () => {
  assert.equal(normalizeOwner('SP'), 'Spouse');
  assert.equal(normalizeOwner('Spouse'), 'Spouse');
  assert.equal(normalizeOwner('JT'), 'Joint');
  assert.equal(normalizeOwner('DC'), 'Dependent child');
  assert.equal(normalizeOwner('Dependent Child'), 'Dependent child');
  assert.equal(normalizeOwner(''), null);
});

/** Two market days a month, so the arithmetic stays checkable by hand. */
function seriesFrom(pairs) {
  return pairs.map(([date, close]) => ({ date, close }));
}

const SPY = seriesFrom([
  ['2025-01-02', 100],
  ['2025-02-03', 100],
  ['2025-03-03', 110],
  ['2025-04-01', 110],
]);

const WINNER = seriesFrom([
  ['2025-01-02', 10],
  ['2025-02-03', 10],
  ['2025-03-03', 30],
  ['2025-04-01', 30],
]);

function lookup(map) {
  return (ticker) => map[ticker] || null;
}

test('a purchase that beats the index shows on all three lines', () => {
  const result = buildPortfolioSeries(
    [{ ticker: 'WIN', type: 'Purchase', transactionDate: '2025-02-03', amount: '$1,001 - $15,000' }],
    lookup({ SPY, WIN: WINNER }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.estimated, true);

  const mid = 8000.5;
  // Cash line is the contribution schedule: what was put in, never grows.
  assert.equal(result.summary.endCash, mid);
  // WIN tripled from 10 to 30.
  assert.ok(Math.abs(result.summary.endMember - mid * 3) < 0.01);
  // SPY rose 10% over the same days.
  assert.ok(Math.abs(result.summary.endBenchmark - mid * 1.1) < 0.01);

  assert.ok(Math.abs(result.summary.vsCashPct - 200) < 0.01);
  assert.ok(Math.abs(result.summary.vsBenchmarkPct - 172.7273) < 0.01);
});

test('a sale moves proceeds to cash and stops tracking the stock', () => {
  const trades = [
    { ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
    { ticker: 'WIN', type: 'Sale (Full)', transactionDate: '2025-02-03', amount: '$1,001 - $15,000' },
  ];
  const result = buildPortfolioSeries(trades, lookup({ SPY, WIN: WINNER }));

  const mid = 8000.5;
  // Bought and sold at 10, so the member sat in cash through the run to 30.
  assert.ok(Math.abs(result.summary.endMember - mid) < 0.01);
  // The benchmark is untouched by the sale — that gap is the cost of selling.
  assert.ok(Math.abs(result.summary.endBenchmark - mid * 1.1) < 0.01);
  assert.ok(result.summary.vsBenchmarkPct < 0);
  assert.equal(result.skipped.unmatchedSales, 0);
});

test('selling a position never bought in-window is counted, not silently dropped', () => {
  const result = buildPortfolioSeries(
    [
      { ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
      { ticker: 'OLD', type: 'Sale (Full)', transactionDate: '2025-02-03', amount: '$1,001 - $15,000' },
    ],
    lookup({ SPY, WIN: WINNER, OLD: WINNER }),
  );

  assert.equal(result.skipped.unmatchedSales, 1);
  // The unrepresentable sale leaves the member line alone.
  assert.ok(Math.abs(result.summary.endMember - 8000.5 * 3) < 0.01);
});

test('the follower buys on the disclosure date, not the trade date', () => {
  const result = buildPortfolioSeries(
    [{
      ticker: 'WIN',
      type: 'Purchase',
      transactionDate: '2025-01-02',
      disclosureDate: '2025-03-03',
      amount: '$1,001 - $15,000',
    }],
    lookup({ SPY, WIN: WINNER }),
  );

  const mid = 8000.5;
  // Member bought at 10 and rode it to 30.
  assert.ok(Math.abs(result.summary.endMember - mid * 3) < 0.01);
  // A filing reader could not buy until 2025-03-03, by which point WIN was 30.
  assert.ok(Math.abs(result.summary.endFollower - mid) < 0.01);
  // That difference is the part of the edge the public never had access to.
  assert.ok(result.summary.disclosureGapPct > 0);
});

test('trades with no cached price or no parseable amount are reported', () => {
  const result = buildPortfolioSeries(
    [
      { ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
      { ticker: 'NOPRICE', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
      { ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '' },
    ],
    lookup({ SPY, WIN: WINNER }),
  );

  assert.equal(result.skipped.noPrice, 1);
  assert.equal(result.skipped.noAmount, 1);
  assert.equal(result.markers.length, 1);
});

test('a missing benchmark series is refused rather than charted', () => {
  const result = buildPortfolioSeries(
    [{ ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' }],
    lookup({ WIN: WINNER }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_benchmark_prices');
});

test('markers keep the detail the collapsed trade rows need', () => {
  const result = buildPortfolioSeries(
    [{
      ticker: 'WIN',
      type: 'Sale (Full)',
      transactionDate: '2025-02-03',
      amount: '$15,001 - $50,000',
      owner: 'SP',
      sector: 'Technology',
      committeeOverlap: true,
    },
    { ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' }],
    lookup({ SPY, WIN: WINNER }),
  );

  const sale = result.markers.find((m) => !m.isPurchase);
  assert.equal(sale.owner, 'Spouse');
  assert.equal(sale.amountLabel, '$15,001 - $50,000');
  assert.equal(sale.committeeOverlap, true);
  assert.equal(sale.sector, 'Technology');
});

test('a window containing only sales is refused rather than charted as zeros', () => {
  const result = buildPortfolioSeries(
    [{ ticker: 'WIN', type: 'Sale (Full)', transactionDate: '2025-02-03', amount: '$1,001 - $15,000' }],
    lookup({ SPY, WIN: WINNER }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_priced_purchases');
  assert.equal(result.skipped.unmatchedSales, 1);
});

test('the follower is measured against its own deployed capital', () => {
  const result = buildPortfolioSeries(
    [{
      ticker: 'WIN',
      type: 'Purchase',
      transactionDate: '2025-01-02',
      disclosureDate: '2025-03-03',
      amount: '$1,001 - $15,000',
    }],
    lookup({ SPY, WIN: WINNER }),
  );

  // Before the disclosure date the follower has deployed nothing, so its own
  // capital line is zero rather than tracking the member's.
  assert.equal(result.followerCash[0], 0);
  assert.equal(result.followerCash[result.followerCash.length - 1], 8000.5);
  // It bought at 30 and WIN stayed at 30, so its own return is flat, not -67%.
  assert.ok(Math.abs(result.summary.followerReturnPct) < 0.01);
  // The member tripled, so the whole 200% was unavailable to a filing reader.
  assert.ok(Math.abs(result.summary.disclosureGapPct - 200) < 0.01);
});

test('trades outside the benchmark range are counted, not silently dropped', () => {
  // The benchmark only starts in 2025, so a 2024 purchase cannot be simulated.
  const result = buildPortfolioSeries(
    [
      { ticker: 'WIN', type: 'Purchase', transactionDate: '2024-06-01', amount: '$1,001 - $15,000' },
      { ticker: 'WIN', type: 'Purchase', transactionDate: '2025-02-03', amount: '$1,001 - $15,000' },
    ],
    lookup({
      SPY,
      WIN: seriesFrom([['2024-06-01', 10], ...WINNER.map((r) => [r.date, r.close])]),
    }),
  );

  assert.equal(result.skipped.outsideBenchmark, 1);
  // Only the representable purchase contributes.
  assert.ok(Math.abs(result.summary.contributed - 8000.5) < 0.01);
});
