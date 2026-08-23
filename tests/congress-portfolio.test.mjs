import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStrategyComparison,
  collectCongressTrades,
  growthPct,
} from '../shared/congress-portfolio.mjs';

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

const LOSER = seriesFrom([
  ['2025-01-02', 10],
  ['2025-02-03', 10],
  ['2025-03-03', 5],
  ['2025-04-01', 5],
]);

function lookup(map) {
  return (ticker) => map[ticker] || null;
}

const MID = 8000.5; // midpoint of "$1,001 - $15,000"

test('trades are collected with their owner and committee-overlap flag', () => {
  const rows = collectCongressTrades({
    members: {
      A: {
        name: 'Member A',
        committeeSectors: ['Technology'],
        trades: [
          { ticker: 'MSFT', sector: 'Technology', type: 'Purchase', transactionDate: '2025-01-02' },
          { ticker: 'XOM', sector: 'Energy', type: 'Purchase', transactionDate: '2025-01-02' },
          { ticker: '--', sector: 'Technology', type: 'Purchase', transactionDate: '2025-01-02' },
          { ticker: 'NVDA', sector: 'Technology', type: 'Exchange', transactionDate: '2025-01-02' },
        ],
      },
    },
  });

  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.ticker === 'MSFT').committeeOverlap, true);
  assert.equal(rows.find((r) => r.ticker === 'XOM').committeeOverlap, false);
  assert.ok(rows.every((r) => r.bioguideId === 'A' && r.memberName === 'Member A'));
});

test('each strategy is measured against its own deployed capital', () => {
  const all = [
    { bioguideId: 'A', ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
    { bioguideId: 'B', ticker: 'LOSE', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
  ];
  const result = buildStrategyComparison(
    [
      { key: 'all', label: 'All trades', trades: all },
      // The committee subset holds only the winner.
      { key: 'committee', label: 'Committee trades', trades: [all[0]] },
    ],
    lookup({ SPY, WIN: WINNER, LOSE: LOSER }),
  );

  assert.equal(result.ok, true);
  const [allRun, committeeRun] = result.strategies;

  // All: half tripled, half halved -> (3 + 0.5) / 2 = 1.75x = +75%.
  assert.ok(Math.abs(allRun.returnPct - 75) < 0.01);
  assert.ok(Math.abs(allRun.contributed - MID * 2) < 0.01);

  // Committee: only the winner, so +200% on half the capital.
  assert.ok(Math.abs(committeeRun.returnPct - 200) < 0.01);
  assert.ok(Math.abs(committeeRun.contributed - MID) < 0.01);

  // Deploying less must not read as doing worse.
  assert.ok(committeeRun.returnPct > allRun.returnPct);
});

test('one member cannot sell another member holding the same ticker', () => {
  const result = buildStrategyComparison(
    [{
      key: 'all',
      label: 'All',
      trades: [
        { bioguideId: 'A', ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
        // B never bought WIN, so this sale is unrepresentable rather than a
        // licence to close A's position.
        { bioguideId: 'B', ticker: 'WIN', type: 'Sale (Full)', transactionDate: '2025-02-03', amount: '$1,001 - $15,000' },
      ],
    }],
    lookup({ SPY, WIN: WINNER }),
  );

  assert.equal(result.skipped.unmatchedSales, 1);
  // A kept the position through the run to 30.
  assert.ok(Math.abs(result.strategies[0].returnPct - 200) < 0.01);
});

test('a member closing their own position moves to cash', () => {
  const result = buildStrategyComparison(
    [{
      key: 'all',
      label: 'All',
      trades: [
        { bioguideId: 'A', ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
        { bioguideId: 'A', ticker: 'WIN', type: 'Sale (Full)', transactionDate: '2025-02-03', amount: '$1,001 - $15,000' },
      ],
    }],
    lookup({ SPY, WIN: WINNER }),
  );

  assert.equal(result.skipped.unmatchedSales, 0);
  // Bought and sold at 10, so it sat in cash and missed the run to 30.
  assert.ok(Math.abs(result.strategies[0].returnPct) < 0.01);
});

test('the benchmark uses the primary strategy cash flows', () => {
  const result = buildStrategyComparison(
    [{
      key: 'all',
      label: 'All',
      trades: [{ bioguideId: 'A', ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' }],
    }],
    lookup({ SPY, WIN: WINNER }),
  );

  // SPY went 100 -> 110 over the window.
  assert.ok(Math.abs(result.strategies[0].benchmarkReturnPct - 10) < 0.01);
  assert.ok(Math.abs(result.strategies[0].vsBenchmarkPct - 190) < 0.01);
  assert.ok(Math.abs(result.benchmark[result.benchmark.length - 1] - MID * 1.1) < 0.01);
});

test('the window opens at the first purchase, not the first trade', () => {
  const result = buildStrategyComparison(
    [{
      key: 'all',
      label: 'All',
      trades: [
        { bioguideId: 'A', ticker: 'WIN', type: 'Sale (Full)', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
        { bioguideId: 'A', ticker: 'WIN', type: 'Purchase', transactionDate: '2025-03-03', amount: '$1,001 - $15,000' },
      ],
    }],
    lookup({ SPY, WIN: WINNER }),
  );

  assert.equal(result.dates[0], '2025-03-03');
});

test('unpriceable and unparseable trades are counted, not dropped silently', () => {
  const result = buildStrategyComparison(
    [{
      key: 'all',
      label: 'All',
      trades: [
        { bioguideId: 'A', ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
        { bioguideId: 'A', ticker: 'NOPRICE', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' },
        { bioguideId: 'A', ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '' },
      ],
    }],
    lookup({ SPY, WIN: WINNER }),
  );

  assert.equal(result.skipped.noPrice, 1);
  assert.equal(result.skipped.noAmount, 1);
  assert.equal(result.strategies[0].purchases, 1);
});

test('a missing benchmark or no purchases is refused rather than charted', () => {
  assert.equal(
    buildStrategyComparison(
      [{ key: 'all', label: 'All', trades: [{ bioguideId: 'A', ticker: 'WIN', type: 'Purchase', transactionDate: '2025-01-02', amount: '$1,001 - $15,000' }] }],
      lookup({ WIN: WINNER }),
    ).reason,
    'no_benchmark_prices',
  );

  assert.equal(
    buildStrategyComparison(
      [{ key: 'all', label: 'All', trades: [{ bioguideId: 'A', ticker: 'WIN', type: 'Sale (Full)', transactionDate: '2025-02-03', amount: '$1,001 - $15,000' }] }],
      lookup({ SPY, WIN: WINNER }),
    ).reason,
    'no_priced_purchases',
  );
});

test('growthPct refuses to divide by capital that was never deployed', () => {
  assert.equal(growthPct(100, 0), 0);
  assert.equal(growthPct(NaN, 100), 0);
  assert.ok(Math.abs(growthPct(150, 100) - 50) < 0.001);
});
