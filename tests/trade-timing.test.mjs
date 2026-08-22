import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  forwardReturn,
  parseYahooChartPayload,
  priceOnOrBefore,
} from '../shared/stock-prices.mjs';
import {
  buildTradeContext,
  computeCounterfactuals,
  disclosureLagDays,
  isPurchaseType,
} from '../shared/trade-timing.mjs';

const mockPrices = [
  { date: '2025-01-01', close: 100 },
  { date: '2025-01-15', close: 110 },
  { date: '2025-02-01', close: 120 },
  { date: '2025-02-15', close: 105 },
  { date: '2025-03-01', close: 130 },
  { date: '2025-03-15', close: 125 },
  { date: '2025-04-01', close: 140 },
];

test('forwardReturn computes percentage change over horizon', () => {
  assert.ok(Math.abs(forwardReturn(mockPrices, '2025-01-15', 45) - 18.181818) < 0.001);
  assert.equal(priceOnOrBefore(mockPrices, '2025-01-20'), 110);
});

test('disclosureLagDays counts days between trade and filing', () => {
  assert.equal(
    disclosureLagDays({ transactionDate: '2025-01-01', disclosureDate: '2025-02-15' }),
    45,
  );
});

test('computeCounterfactuals for purchase includes inaction baseline', () => {
  const result = computeCounterfactuals(
    { ticker: 'TEST', type: 'Purchase', transactionDate: '2025-01-15' },
    mockPrices,
    45,
  );
  assert.equal(result.ok, true);
  assert.equal(result.scenarios.inaction, 0);
  assert.ok(result.scenarios.actual > 0);
  assert.ok(result.actionAdvantage > 0);
});

test('computeCounterfactuals for sale treats inaction as holding', () => {
  const result = computeCounterfactuals(
    { ticker: 'TEST', type: 'Sale', transactionDate: '2025-01-15' },
    mockPrices,
    45,
  );
  assert.equal(result.ok, true);
  assert.equal(result.scenarios.actual, 0);
  assert.equal(result.scenarios.inaction, result.scenarios.inaction);
  assert.ok(result.scenarios.inaction > 0);
  assert.ok(result.actionAdvantage < 0);
});

test('buildTradeContext attaches committee and disclosure context', () => {
  const ctx = buildTradeContext(
    {
      ticker: 'LMT',
      type: 'Purchase',
      transactionDate: '2025-01-15',
      disclosureDate: '2025-03-01',
      sector: 'Defense',
      url: 'https://example.test/ptr.pdf',
    },
    {
      name: 'Jane Doe',
      committees: ['Armed Services Committee'],
      committeeSectors: ['Defense'],
      flags: [{
        type: 'committee_overlap',
        sector: 'Defense',
        relatedCommittees: ['Armed Services Committee'],
      }],
    },
    { bioguideId: 'D000001' },
  );
  assert.equal(ctx.committeeOverlap, true);
  assert.equal(ctx.disclosureLagDays, 45);
  assert.deepEqual(ctx.relatedCommittees, ['Armed Services Committee']);
});

test('parseYahooChartPayload maps timestamps to closes', () => {
  const rows = parseYahooChartPayload({
    chart: {
      result: [{
        timestamp: [1704067200, 1704153600],
        indicators: { quote: [{ close: [100, 101] }] },
      }],
    },
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].close, 100);
});

test('isPurchaseType recognizes purchase labels', () => {
  assert.equal(isPurchaseType('Purchase (partial)'), true);
  assert.equal(isPurchaseType('Sale'), false);
});

test('addDays shifts ISO dates', () => {
  assert.equal(addDays('2025-01-15', 30), '2025-02-14');
});
