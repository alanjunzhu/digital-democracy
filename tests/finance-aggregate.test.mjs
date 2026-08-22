import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinanceOverview,
  buildFlaggedMemberRows,
  buildSectorAggregates,
  buildTickerAggregates,
  flattenTickerTrades,
  isTradeCommitteeOverlap,
} from '../shared/finance-aggregate.mjs';

const sampleFinanceData = {
  lastUpdated: '2026-01-01',
  totalMembers: 2,
  source: 'test',
  members: {
    A001: {
      name: 'Alice Alpha',
      committees: ['Armed Services Committee'],
      committeeSectors: ['Defense'],
      sectors: { Defense: { purchases: 1, sales: 0, total: 1 }, Finance: { purchases: 1, sales: 0, total: 1 } },
      flags: [{
        type: 'committee_overlap',
        severity: 'high',
        sector: 'Defense',
        tradeCount: 1,
        relatedCommittees: ['Armed Services Committee'],
        description: '1 trade in Defense',
      }],
      summary: { totalTrades: 2, highSeverityFlags: 1 },
      trades: [
        { ticker: 'LMT', type: 'Purchase', sector: 'Defense', transactionDate: '2026-01-15', bioguideId: 'A001' },
        { ticker: 'JPM', type: 'Purchase', sector: 'Finance', transactionDate: '2026-01-10', bioguideId: 'A001' },
        { type: 'PTR filing', assetDescription: 'Periodic Transaction Report', transactionDate: '2026-01-01' },
      ],
    },
    B002: {
      name: 'Bob Beta',
      committees: [],
      committeeSectors: [],
      sectors: { Technology: { purchases: 1, sales: 0, total: 1 } },
      flags: [],
      summary: { totalTrades: 1, highSeverityFlags: 0 },
      trades: [
        { ticker: 'MSFT', type: 'Purchase', sector: 'Technology', transactionDate: '2026-01-05', bioguideId: 'B002' },
      ],
    },
  },
};

test('isTradeCommitteeOverlap detects sector overlap with committees', () => {
  const profile = { committeeSectors: ['Defense'] };
  assert.equal(isTradeCommitteeOverlap({ sector: 'Defense' }, profile), true);
  assert.equal(isTradeCommitteeOverlap({ sector: 'Finance' }, profile), false);
});

test('buildFinanceOverview aggregates trade and flag counts', () => {
  const overview = buildFinanceOverview(sampleFinanceData);
  assert.equal(overview.membersWithTrades, 2);
  assert.equal(overview.totalTrades, 3);
  assert.equal(overview.highSeverityFlags, 1);
  assert.equal(overview.overlapTrades, 1);
});

test('buildFlaggedMemberRows returns only flagged members sorted by severity', () => {
  const rows = buildFlaggedMemberRows(sampleFinanceData, [
    { bioguideId: 'A001', name: 'Alice Alpha', party: 'Democratic', chamber: 'House', state: 'CA' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bioguideId, 'A001');
  assert.deepEqual(rows[0].overlapSectors, ['Defense']);
});

test('buildSectorAggregates rolls up sector stats and overlap counts', () => {
  const sectors = buildSectorAggregates(sampleFinanceData);
  const defense = sectors.find((s) => s.sector === 'Defense');
  assert.equal(defense.totalTrades, 1);
  assert.equal(defense.overlapTrades, 1);
  assert.equal(defense.overlapMembers, 1);
});

test('buildTickerAggregates groups trades by ticker', () => {
  const tickers = buildTickerAggregates(sampleFinanceData);
  const lmt = tickers.find((t) => t.ticker === 'LMT');
  assert.equal(lmt.totalTrades, 1);
  assert.equal(lmt.overlapTrades, 1);
  assert.equal(lmt.memberCount, 1);
});

test('flattenTickerTrades excludes filings and marks overlap rows', () => {
  const rows = flattenTickerTrades(sampleFinanceData);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((r) => r.committeeOverlap).length, 1);
  assert.equal(rows.find((r) => r.ticker === 'LMT').committeeOverlap, true);
});
