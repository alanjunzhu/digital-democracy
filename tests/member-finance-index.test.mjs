import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMemberFinanceIndex,
  matchesFinanceFilter,
  FINANCE_FILTERS,
} from '../shared/member-finance-index.mjs';

const financeData = {
  members: {
    TRADER: {
      committeeSectors: ['Technology'],
      flags: [{ type: 'committee_overlap', sector: 'Technology' }],
      trades: [
        { ticker: 'MSFT', sector: 'Technology', type: 'Purchase' },
        { ticker: 'XOM', sector: 'Energy', type: 'Sale (Full)' },
        // A filing row carries no ticker; it is a disclosure, not a trade.
        { ticker: '', type: 'PTR filing' },
      ],
    },
    FILER_ONLY: {
      committeeSectors: [],
      trades: [{ ticker: '--', type: 'Annual disclosure' }],
    },
    SELLER: {
      committeeSectors: [],
      trades: [{ ticker: 'AAPL', type: 'Sale (Full)' }],
    },
    NOTHING: { committeeSectors: ['Finance'], trades: [] },
  },
};

test('the index separates trades, filings and committee overlap', () => {
  const index = buildMemberFinanceIndex(financeData, new Set(['MSFT', 'AAPL']));

  assert.deepEqual(index.TRADER, {
    trades: 2,
    purchases: 1,
    sales: 1,
    filings: 1,
    overlapTrades: 1,
    flagged: true,
    chartable: true,
  });

  // A member with only paperwork still has a record worth surfacing.
  assert.equal(index.FILER_ONLY.trades, 0);
  assert.equal(index.FILER_ONLY.filings, 1);

  // Selling without buying cannot produce a portfolio chart.
  assert.equal(index.SELLER.chartable, false);

  // Members with no financial record at all are left out entirely.
  assert.equal(index.NOTHING, undefined);
});

test('chartable needs a purchase whose ticker actually has prices', () => {
  const withPrices = buildMemberFinanceIndex(financeData, new Set(['MSFT']));
  assert.equal(withPrices.TRADER.chartable, true);

  const withoutPrices = buildMemberFinanceIndex(financeData, new Set(['NVDA']));
  assert.equal(withoutPrices.TRADER.chartable, false);

  // Passing no cache at all falls back to "has any purchase".
  const noCache = buildMemberFinanceIndex(financeData, null);
  assert.equal(noCache.TRADER.chartable, true);
});

test('each filter selects the members it claims to', () => {
  const index = buildMemberFinanceIndex(financeData, new Set(['MSFT', 'AAPL']));
  const ids = ['TRADER', 'FILER_ONLY', 'SELLER', 'NOTHING', 'NO_PROFILE'];
  const select = (key) => ids.filter((id) => matchesFinanceFilter(key, index[id]));

  assert.deepEqual(select('all'), ids);
  assert.deepEqual(select('any'), ['TRADER', 'FILER_ONLY', 'SELLER']);
  assert.deepEqual(select('trades'), ['TRADER', 'SELLER']);
  assert.deepEqual(select('flagged'), ['TRADER']);
  assert.deepEqual(select('chart'), ['TRADER']);
  // A member absent from the index has no record, same as one with nothing.
  assert.deepEqual(select('none'), ['NOTHING', 'NO_PROFILE']);
});

test('every filter carries a human-readable label', () => {
  for (const [key, def] of Object.entries(FINANCE_FILTERS)) {
    assert.equal(typeof def.label, 'string', `${key} needs a label`);
    assert.ok(def.label.length > 0);
  }
});

test('an unknown filter key falls back to showing everyone', () => {
  assert.equal(matchesFinanceFilter('bogus', undefined), true);
});
