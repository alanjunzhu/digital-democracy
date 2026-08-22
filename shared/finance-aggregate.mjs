import { partitionFinanceTrades } from '../scripts/fetch-finances.mjs';

function isTickerTrade(trade) {
  const { tickerTrades } = partitionFinanceTrades([trade]);
  return tickerTrades.length === 1;
}

export function isTradeCommitteeOverlap(trade, profile) {
  if (!trade?.sector || !profile?.committeeSectors?.length) return false;
  return profile.committeeSectors.includes(trade.sector);
}

export function buildFinanceOverview(financeData) {
  const members = Object.entries(financeData?.members || {});
  let totalTrades = 0;
  let membersWithTrades = 0;
  let highSeverityFlags = 0;
  let mediumSeverityFlags = 0;
  let overlapTrades = 0;

  for (const [, profile] of members) {
    const summary = profile.summary || {};
    const tradeCount = summary.totalTrades || 0;
    if (tradeCount > 0) membersWithTrades++;
    totalTrades += tradeCount;

    for (const flag of profile.flags || []) {
      if (flag.severity === 'high') highSeverityFlags++;
      else if (flag.severity === 'medium') mediumSeverityFlags++;
    }

    const { tickerTrades } = partitionFinanceTrades(profile.trades || []);
    overlapTrades += tickerTrades.filter((t) => isTradeCommitteeOverlap(t, profile)).length;
  }

  return {
    totalMembers: financeData?.totalMembers || members.length,
    membersWithTrades,
    totalTrades,
    highSeverityFlags,
    mediumSeverityFlags,
    overlapTrades,
    lastUpdated: financeData?.lastUpdated || null,
    source: financeData?.source || null,
  };
}

export function buildFlaggedMemberRows(financeData, membersIndex = []) {
  const memberMeta = Object.fromEntries(
    (membersIndex || []).map((m) => [m.bioguideId, m]),
  );

  return Object.entries(financeData?.members || {})
    .map(([bioguideId, profile]) => {
      const flags = profile.flags || [];
      if (!flags.length) return null;

      const meta = memberMeta[bioguideId] || {};
      const overlapFlags = flags.filter((f) => f.type === 'committee_overlap');
      const timingFlags = flags.filter((f) => f.type === 'bill_timing');

      return {
        bioguideId,
        name: profile.name || meta.name || 'Unknown',
        party: meta.party || '',
        chamber: meta.chamber || profile.trades?.[0]?.chamber || '',
        state: meta.state || profile.trades?.[0]?.state || '',
        totalTrades: profile.summary?.totalTrades || 0,
        highSeverityFlags: profile.summary?.highSeverityFlags || overlapFlags.length,
        overlapSectors: [...new Set(overlapFlags.map((f) => f.sector))],
        overlapTradeCount: overlapFlags.reduce((sum, f) => sum + (f.tradeCount || 0), 0),
        timingFlags: timingFlags.length,
        flags,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.highSeverityFlags !== a.highSeverityFlags) {
        return b.highSeverityFlags - a.highSeverityFlags;
      }
      return b.overlapTradeCount - a.overlapTradeCount;
    });
}

export function buildSectorAggregates(financeData) {
  const sectors = {};

  for (const [, profile] of Object.entries(financeData?.members || {})) {
    for (const [sector, stats] of Object.entries(profile.sectors || {})) {
      if (!sectors[sector]) {
        sectors[sector] = {
          sector,
          totalTrades: 0,
          purchases: 0,
          sales: 0,
          memberCount: 0,
          overlapTrades: 0,
          overlapMembers: 0,
        };
      }

      sectors[sector].totalTrades += stats.total || 0;
      sectors[sector].purchases += stats.purchases || 0;
      sectors[sector].sales += stats.sales || 0;
      sectors[sector].memberCount++;

      const overlapFlag = (profile.flags || []).find(
        (f) => f.type === 'committee_overlap' && f.sector === sector,
      );
      if (overlapFlag) {
        sectors[sector].overlapTrades += overlapFlag.tradeCount || 0;
        sectors[sector].overlapMembers++;
      }
    }
  }

  return Object.values(sectors).sort((a, b) => b.totalTrades - a.totalTrades);
}

export function buildTickerAggregates(financeData) {
  const tickers = {};

  for (const [bioguideId, profile] of Object.entries(financeData?.members || {})) {
    const { tickerTrades } = partitionFinanceTrades(profile.trades || []);
    for (const trade of tickerTrades) {
      const ticker = String(trade.ticker || '').trim().toUpperCase();
      if (!ticker || ticker === '--') continue;

      if (!tickers[ticker]) {
        tickers[ticker] = {
          ticker,
          sector: trade.sector || null,
          totalTrades: 0,
          purchases: 0,
          sales: 0,
          memberIds: new Set(),
          overlapTrades: 0,
        };
      }

      tickers[ticker].totalTrades++;
      tickers[ticker].memberIds.add(bioguideId);
      if (!tickers[ticker].sector && trade.sector) tickers[ticker].sector = trade.sector;

      const type = (trade.type || '').toLowerCase();
      if (type.includes('purchase')) tickers[ticker].purchases++;
      else if (type.includes('sale')) tickers[ticker].sales++;

      if (isTradeCommitteeOverlap(trade, profile)) {
        tickers[ticker].overlapTrades++;
      }
    }
  }

  return Object.values(tickers)
    .map((row) => ({
      ...row,
      memberCount: row.memberIds.size,
      memberIds: undefined,
    }))
    .sort((a, b) => b.totalTrades - a.totalTrades);
}

export function flattenTickerTrades(financeData) {
  const rows = [];

  for (const [bioguideId, profile] of Object.entries(financeData?.members || {})) {
    const { tickerTrades } = partitionFinanceTrades(profile.trades || []);
    for (const trade of tickerTrades) {
      rows.push({
        ...trade,
        bioguideId,
        memberName: profile.name || trade.member || '',
        committeeOverlap: isTradeCommitteeOverlap(trade, profile),
        relatedCommittees: isTradeCommitteeOverlap(trade, profile)
          ? (profile.flags || [])
              .filter((f) => f.type === 'committee_overlap' && f.sector === trade.sector)
              .flatMap((f) => f.relatedCommittees || [])
          : [],
      });
    }
  }

  return rows.sort((a, b) =>
    (b.transactionDate || b.disclosureDate || '').localeCompare(
      a.transactionDate || a.disclosureDate || '',
    ),
  );
}
