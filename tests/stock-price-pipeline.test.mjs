import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardReturn, forwardReturnDetail } from '../shared/stock-prices.mjs';
import { computeCounterfactuals } from '../shared/trade-timing.mjs';
import { collectTickerWindows } from '../scripts/fetch-stock-prices.mjs';
import { overlapTrades } from '../scripts/enrich-trade-timing.mjs';
import { BENCHMARK_TICKER } from '../shared/price-cache.mjs';

const prices = [
  { date: '2025-01-01', close: 100 },
  { date: '2025-02-01', close: 120 },
  { date: '2025-03-01', close: 130 },
];

test('forwardReturn refuses a horizon the price series never reaches', () => {
  // 30 days out lands inside the series.
  assert.ok(Math.abs(forwardReturn(prices, '2025-01-01', 31) - 20) < 0.001);
  // 120 days out runs past 2025-03-01; the last close is not a 120-day outcome.
  assert.equal(forwardReturn(prices, '2025-01-01', 120), null);
});

test('forwardReturnDetail still reports the partial window it could measure', () => {
  const detail = forwardReturnDetail(prices, '2025-01-01', 120);
  assert.equal(detail.complete, false);
  assert.equal(detail.endDate, '2025-05-01');
  assert.equal(detail.lastAvailable, '2025-03-01');
  assert.ok(detail.pct > 0);
});

test('counterfactuals flag a trade still inside its horizon', () => {
  const settled = computeCounterfactuals(
    { ticker: 'T', type: 'Purchase', transactionDate: '2025-01-01' },
    prices,
    31,
  );
  assert.equal(settled.horizonComplete, true);

  const running = computeCounterfactuals(
    { ticker: 'T', type: 'Purchase', transactionDate: '2025-02-01' },
    prices,
    60,
  );
  assert.equal(running.horizonComplete, false);
  assert.equal(running.scenarios.actual, null);
  assert.equal(running.lastPriceDate, '2025-03-01');
});

const financeData = {
  members: {
    A000001: {
      name: 'Member One',
      committeeSectors: ['Technology'],
      trades: [
        { ticker: 'MSFT', sector: 'Technology', type: 'Purchase', transactionDate: '2025-03-01' },
        { ticker: 'MSFT', sector: 'Technology', type: 'Sale (Full)', transactionDate: '2025-01-05' },
        { ticker: 'XOM', sector: 'Energy', type: 'Purchase', transactionDate: '2025-02-01' },
        { ticker: '--', sector: 'Technology', type: 'Purchase', transactionDate: '2025-02-01' },
        { ticker: 'NVDA', sector: 'Technology', type: 'Exchange', transactionDate: '2025-02-01' },
      ],
    },
    B000002: {
      name: 'Member Two',
      committeeSectors: [],
      trades: [{ ticker: 'AAPL', sector: 'Technology', type: 'Purchase', transactionDate: '2025-02-01' }],
    },
  },
};

test('ticker collection covers overlap trades plus the benchmark', () => {
  const windows = collectTickerWindows(financeData);
  const bySymbol = Object.fromEntries(windows.map((w) => [w.ticker, w]));

  assert.deepEqual(Object.keys(bySymbol).sort(), ['MSFT', BENCHMARK_TICKER].sort());
  assert.equal(bySymbol.MSFT.trades, 2);
  // The window spans every trade in that ticker, so one request serves both.
  assert.equal(bySymbol.MSFT.first, '2025-01-05');
  assert.equal(bySymbol.MSFT.last, '2025-03-01');
  assert.equal(bySymbol[BENCHMARK_TICKER].benchmark, true);
  assert.equal(bySymbol[BENCHMARK_TICKER].first, '2025-01-05');
});

test('--all widens collection to non-overlap tickers', () => {
  const symbols = collectTickerWindows(financeData, { includeAll: true }).map((w) => w.ticker);
  assert.ok(symbols.includes('XOM'));
  assert.ok(symbols.includes('AAPL'));
  // Exchanges and blank tickers are still skipped — there is nothing to chart.
  assert.ok(!symbols.includes('NVDA'));
  assert.ok(!symbols.includes('--'));
});

test('enrichment covers exactly the trades the member page charts', () => {
  const rows = overlapTrades(financeData);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.ticker === 'MSFT' && r.bioguideId === 'A000001'));
  assert.ok(rows.every((r) => r.memberName === 'Member One'));
});

test('a start date past the end of the series is not priced from a stale close', () => {
  // Without the staleness guard this would value a 2026 trade at the
  // 2025-03-01 close and report a confident, wrong return.
  assert.equal(forwardReturnDetail(prices, '2026-05-01', 60), null);
  assert.equal(
    computeCounterfactuals(
      { ticker: 'T', type: 'Purchase', transactionDate: '2026-05-01' },
      prices,
      60,
    ).reason,
    'no_price_at_trade_date',
  );
  // A weekend gap is still fine: 2025-02-03 falls back to the 2025-02-01 close
  // of 120, and 30 days on reaches the 2025-03-01 close of 130.
  assert.ok(Math.abs(forwardReturnDetail(prices, '2025-02-03', 30).pct - 8.3333) < 0.001);
});
