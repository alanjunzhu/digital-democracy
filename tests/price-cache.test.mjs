import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPriceCacheReader,
  decodePriceSeries,
  decodePriceWindow,
  encodePriceSeries,
  isPriceCacheFresh,
  priceCachePath,
  priceCacheFileName,
} from '../shared/price-cache.mjs';
import { chartWindowBounds, createTimingAttacher } from '../shared/timing-precompute.mjs';
import { tradeTimingKey } from '../shared/trade-timing.mjs';

const rows = [
  { date: '2025-01-02', close: 100.123456 },
  { date: '2025-01-03', close: 101 },
  { date: '2025-01-06', close: 99.5 },
];

test('encode/decode round-trips a price series', () => {
  const encoded = encodePriceSeries('aapl', rows);
  assert.equal(encoded.ticker, 'AAPL');
  assert.equal(encoded.start, '2025-01-02');
  assert.equal(encoded.end, '2025-01-06');
  assert.equal(encoded.count, 3);

  const decoded = decodePriceSeries(encoded);
  assert.equal(decoded.length, 3);
  assert.equal(decoded[1].close, 101);
  // Closes are rounded to four decimals to keep the cache small.
  assert.equal(decoded[0].close, 100.1235);
});

test('encode drops rows with no usable close', () => {
  const encoded = encodePriceSeries('T', [
    { date: '2025-01-02', close: 10 },
    { date: '2025-01-03', close: null },
    { date: '2025-01-06', close: NaN },
  ]);
  assert.equal(encoded.count, 1);
  assert.deepEqual(decodePriceSeries(encoded), [{ date: '2025-01-02', close: 10 }]);
});

test('decodePriceWindow keeps only the requested range', () => {
  const encoded = encodePriceSeries('AAPL', rows);
  assert.deepEqual(
    decodePriceWindow(encoded, '2025-01-03', '2025-01-06').map((r) => r.date),
    ['2025-01-03', '2025-01-06'],
  );
});

test('ticker file names stay filesystem-safe', () => {
  assert.equal(priceCacheFileName('BRK.B'), 'BRK_B.json');
  assert.equal(priceCacheFileName('bf/b'), 'BF_B.json');
  assert.equal(priceCachePath('AAPL'), 'prices/AAPL.json');
  assert.equal(priceCachePath('--'), null);
  assert.equal(priceCachePath(''), null);
});

test('a cache is stale once its newest close falls behind', () => {
  const cached = { end: '2025-06-10' };
  assert.equal(isPriceCacheFresh(cached, '2025-06-12'), true);
  assert.equal(isPriceCacheFresh(cached, '2025-06-20'), false);
  assert.equal(isPriceCacheFresh({}, '2025-06-12'), false);
});

test('the cache reader loads each ticker file at most once', () => {
  let reads = 0;
  const reader = createPriceCacheReader((path) => {
    reads++;
    return { path };
  });
  reader('AAPL');
  reader('AAPL');
  reader('MSFT');
  assert.equal(reads, 2);
  assert.equal(reader('--'), null);
});

test('chart bounds bracket the trade date', () => {
  assert.deepEqual(chartWindowBounds('2025-03-10', 60), {
    start: '2025-02-08',
    end: '2025-05-24',
  });
  assert.equal(chartWindowBounds(null), null);
});

test('the timing attacher pairs counterfactuals with a sliced price window', () => {
  const trade = {
    bioguideId: 'A000001',
    ticker: 'AAPL',
    transactionDate: '2025-01-03',
    type: 'Purchase',
  };
  const files = {
    'finances/trade-timing.json': {
      entries: { [tradeTimingKey(trade)]: { counterfactuals: { ok: true, summary: 'x' } } },
    },
    'prices/AAPL.json': encodePriceSeries('AAPL', [
      { date: '2024-01-01', close: 50 },
      ...rows,
    ]),
  };

  const attach = createTimingAttacher((path) => files[path] ?? null);
  const attached = attach(trade);

  assert.equal(attached.precomputed.counterfactuals.summary, 'x');
  // 2024-01-01 sits outside the chart window and is dropped.
  assert.deepEqual(
    attached.precomputed.prices.map((p) => p.date),
    ['2025-01-02', '2025-01-03', '2025-01-06'],
  );
});

test('a trade with no precomputed entry attaches nothing', () => {
  const attach = createTimingAttacher(() => null);
  const attached = attach({ bioguideId: 'B', ticker: 'ZZZZ', transactionDate: '2025-01-03', type: 'Sale' });
  assert.equal(attached.precomputed, null);
});
