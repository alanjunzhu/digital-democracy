#!/usr/bin/env node
/**
 * Fetch financial data and build conflict-of-interest analysis:
 *
 * 1. Stock trades from House/Senate Stock Watcher (free, no API key)
 * 2. Committee memberships from Congress.gov API (for conflict detection)
 * 3. Cross-reference trades with committee assignments and bill activity
 *
 * Outputs:
 *   data/finances/by-member.json  - Per-member financial profile with trades,
 *                                    committee overlaps, and flagged conflicts
 */

import { writeJSON } from './lib/data-writer.mjs';
import { fetchJSON, getCongressAPIBaseUrl, batchProcess } from './lib/api-client.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const API_KEY = process.env.CONGRESS_API_KEY || '';
const CONGRESS_NUMBER = 119;

// ─── Sector / Industry Mapping ───

const COMMITTEE_SECTOR_MAP = {
  'Armed Services': 'Defense', 'Defense': 'Defense', 'Veterans': 'Defense',
  'Intelligence': 'Defense', 'Central Intelligence': 'Defense', 'Homeland Security': 'Defense',
  'Financial Services': 'Finance', 'Banking': 'Finance', 'Capital Markets': 'Finance',
  'Securities': 'Finance', 'Insurance': 'Finance', 'Monetary Policy': 'Finance',
  'Energy': 'Energy', 'Oil': 'Energy', 'Natural Resources': 'Energy',
  'Nuclear': 'Energy', 'Power': 'Energy',
  'Health': 'Healthcare', 'Drug': 'Healthcare', 'Medicare': 'Healthcare',
  'Medicaid': 'Healthcare', 'Bioethics': 'Healthcare',
  'Technology': 'Technology', 'Communications': 'Technology', 'Cyber': 'Technology',
  'Innovation': 'Technology', 'Digital': 'Technology', 'Artificial Intelligence': 'Technology',
  'Science': 'Technology', 'Space': 'Technology',
  'Transportation': 'Transportation', 'Aviation': 'Transportation', 'Railroad': 'Transportation',
  'Maritime': 'Transportation', 'Highway': 'Transportation', 'Coast Guard': 'Transportation',
  'Agriculture': 'Agriculture', 'Farm': 'Agriculture', 'Food': 'Agriculture',
  'Forestry': 'Agriculture', 'Nutrition': 'Agriculture',
  'Commerce': 'Commerce', 'Trade': 'Commerce', 'Consumer': 'Commerce',
  'Manufacturing': 'Commerce', 'Small Business': 'Commerce',
};

const TICKER_SECTOR_MAP = {
  'LMT': 'Defense', 'RTX': 'Defense', 'BA': 'Defense', 'NOC': 'Defense',
  'GD': 'Defense', 'LHX': 'Defense', 'HII': 'Defense', 'TDG': 'Defense',
  'LDOS': 'Defense', 'BAH': 'Defense', 'KTOS': 'Defense', 'PLTR': 'Defense',
  'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'GOOG': 'Technology',
  'META': 'Technology', 'AMZN': 'Technology', 'NVDA': 'Technology', 'AMD': 'Technology',
  'INTC': 'Technology', 'CRM': 'Technology', 'ORCL': 'Technology', 'CSCO': 'Technology',
  'AVGO': 'Technology', 'ADBE': 'Technology', 'NFLX': 'Technology', 'TSM': 'Technology',
  'QCOM': 'Technology', 'TXN': 'Technology', 'MU': 'Technology', 'ANET': 'Technology',
  'JPM': 'Finance', 'BAC': 'Finance', 'WFC': 'Finance', 'GS': 'Finance',
  'MS': 'Finance', 'C': 'Finance', 'BLK': 'Finance', 'SCHW': 'Finance',
  'AXP': 'Finance', 'V': 'Finance', 'MA': 'Finance', 'COF': 'Finance',
  'BRK.A': 'Finance', 'BRK.B': 'Finance', 'USB': 'Finance', 'PNC': 'Finance',
  'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'SLB': 'Energy',
  'EOG': 'Energy', 'OXY': 'Energy', 'MPC': 'Energy', 'PSX': 'Energy',
  'VLO': 'Energy', 'HAL': 'Energy', 'DVN': 'Energy', 'HES': 'Energy',
  'FSLR': 'Energy', 'ENPH': 'Energy', 'NEE': 'Energy',
  'JNJ': 'Healthcare', 'PFE': 'Healthcare', 'UNH': 'Healthcare', 'MRK': 'Healthcare',
  'ABBV': 'Healthcare', 'LLY': 'Healthcare', 'TMO': 'Healthcare', 'ABT': 'Healthcare',
  'BMY': 'Healthcare', 'AMGN': 'Healthcare', 'GILD': 'Healthcare', 'ISRG': 'Healthcare',
  'MDT': 'Healthcare', 'DHR': 'Healthcare', 'REGN': 'Healthcare', 'MRNA': 'Healthcare',
  'BNTX': 'Healthcare', 'CVS': 'Healthcare', 'CI': 'Healthcare', 'HCA': 'Healthcare',
  'DAL': 'Transportation', 'UAL': 'Transportation', 'LUV': 'Transportation',
  'AAL': 'Transportation', 'UPS': 'Transportation', 'FDX': 'Transportation',
  'CSX': 'Transportation', 'UNP': 'Transportation', 'NSC': 'Transportation',
  'UBER': 'Transportation', 'LYFT': 'Transportation',
  'ADM': 'Agriculture', 'BG': 'Agriculture', 'DE': 'Agriculture',
  'AGCO': 'Agriculture', 'CF': 'Agriculture', 'MOS': 'Agriculture',
  'TSN': 'Agriculture', 'KO': 'Agriculture', 'PEP': 'Agriculture',
  'T': 'Technology', 'VZ': 'Technology', 'TMUS': 'Technology', 'CMCSA': 'Technology',
  'AMT': 'Real Estate', 'PLD': 'Real Estate', 'CCI': 'Real Estate',
  'SPG': 'Real Estate', 'O': 'Real Estate',
};

const ASSET_KEYWORD_SECTORS = [
  { keywords: ['defense', 'military', 'weapon', 'aerospace', 'lockheed', 'raytheon', 'boeing', 'northrop'], sector: 'Defense' },
  { keywords: ['pharma', 'biotech', 'health', 'medical', 'hospital', 'drug', 'therapeutic', 'pfizer', 'moderna', 'johnson'], sector: 'Healthcare' },
  { keywords: ['oil', 'gas', 'petrol', 'energy', 'solar', 'wind', 'renewable', 'exxon', 'chevron', 'pipeline'], sector: 'Energy' },
  { keywords: ['bank', 'financial', 'insurance', 'capital', 'credit', 'goldman', 'morgan', 'blackrock'], sector: 'Finance' },
  { keywords: ['tech', 'software', 'semiconductor', 'chip', 'cloud', 'data', 'cyber', 'apple', 'microsoft', 'google', 'nvidia', 'meta'], sector: 'Technology' },
  { keywords: ['airline', 'transport', 'railroad', 'shipping', 'freight', 'logistics'], sector: 'Transportation' },
  { keywords: ['farm', 'agri', 'crop', 'seed', 'fertiliz', 'food', 'grain'], sector: 'Agriculture' },
];

function getTickerSector(ticker, assetDescription) {
  if (ticker && TICKER_SECTOR_MAP[ticker.toUpperCase()]) {
    return TICKER_SECTOR_MAP[ticker.toUpperCase()];
  }
  const desc = (assetDescription || '').toLowerCase();
  for (const { keywords, sector } of ASSET_KEYWORD_SECTORS) {
    for (const kw of keywords) {
      if (desc.includes(kw)) return sector;
    }
  }
  return null;
}

function getCommitteeSectors(committeeName) {
  const sectors = new Set();
  const name = committeeName || '';
  for (const [keyword, sector] of Object.entries(COMMITTEE_SECTOR_MAP)) {
    if (name.toLowerCase().includes(keyword.toLowerCase())) {
      sectors.add(sector);
    }
  }
  return [...sectors];
}

// ─── Fetch Stock Trades ───

async function fetchHouseStockTrades() {
  console.log('Fetching House stock trades...');
  const url = 'https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json';
  try {
    const response = await fetch(url);
    if (!response.ok) { console.warn(`  Failed: ${response.status}`); return []; }
    const data = await response.json();

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const recent = data.filter(t => (t.transaction_date || t.disclosure_date || '') >= cutoffStr);
    console.log(`  ${data.length} total, ${recent.length} recent (since ${cutoffStr})`);

    return recent.map(t => ({
      chamber: 'House',
      member: t.representative || '',
      ticker: t.ticker || '',
      assetDescription: t.asset_description || '',
      type: t.type || '',
      amount: t.amount || '',
      transactionDate: t.transaction_date || '',
      disclosureDate: t.disclosure_date || '',
      district: t.district || '',
      party: t.party || '',
      state: t.state || '',
      owner: t.owner || '',
    }));
  } catch (err) {
    console.warn(`  Error: ${err.message}`);
    return [];
  }
}

async function fetchSenateStockTrades() {
  console.log('Fetching Senate stock trades...');
  const url = 'https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json';
  try {
    const response = await fetch(url);
    if (!response.ok) { console.warn(`  Failed: ${response.status}`); return []; }
    const data = await response.json();

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const recent = data.filter(t => (t.transaction_date || t.disclosure_date || '') >= cutoffStr);
    console.log(`  ${data.length} total, ${recent.length} recent (since ${cutoffStr})`);

    return recent.map(t => ({
      chamber: 'Senate',
      member: t.senator || t.full_name || '',
      ticker: t.ticker || '',
      assetDescription: t.asset_description || t.asset_type || '',
      type: t.type || t.transaction_type || '',
      amount: t.amount || '',
      transactionDate: t.transaction_date || '',
      disclosureDate: t.disclosure_date || '',
      district: '',
      party: t.party || '',
      state: t.state || '',
      owner: t.owner || '',
    }));
  } catch (err) {
    console.warn(`  Error: ${err.message}`);
    return [];
  }
}

// ─── Fetch Committee Memberships (batched) ───

async function fetchCommitteeMemberships() {
  if (!API_KEY) {
    console.log('No CONGRESS_API_KEY — skipping committee membership fetch.');
    return {};
  }

  console.log('Fetching committee memberships from Congress.gov API...');
  const memberships = {};

  const committeesPath = join(process.cwd(), 'data', 'committees', 'index.json');
  let committees = [];
  try {
    const data = JSON.parse(readFileSync(committeesPath, 'utf-8'));
    committees = (data.committees || []).filter(c => !c.committeeType || c.committeeType !== 'Subcommittee');
    if (committees.length === 0) {
      committees = (data.committees || []).filter(c => (c.systemCode || '').length <= 4);
    }
    console.log(`  Found ${committees.length} parent committees to check`);
  } catch {
    console.log('  No committees index found');
    return {};
  }

  const standingCommittees = committees.filter(c =>
    !c.name?.toLowerCase().includes('subcommittee')
  ).slice(0, 50);

  // Batch fetch committee memberships — 8 concurrent, 150ms delay
  await batchProcess(
    standingCommittees,
    async (committee) => {
      const code = committee.systemCode;
      if (!code) return;

      try {
        // Try with congress number first, then without
        let data = await fetchJSON(
          `${getCongressAPIBaseUrl()}/committee/${CONGRESS_NUMBER}/${code}?api_key=${API_KEY}&format=json`
        ).catch(() => null);
        if (!data) {
          data = await fetchJSON(
            `${getCongressAPIBaseUrl()}/committee/${code}?api_key=${API_KEY}&format=json`
          ).catch(() => null);
        }
        if (!data) return;

        const comm = data.committee || data;
        let memberList = comm.members || comm.currentMembers || [];

        if (Array.isArray(memberList) && memberList.length > 0) {
          for (const m of memberList) {
            const bioguide = m.bioguideId || m.bioguide_id || '';
            if (!bioguide) continue;
            if (!memberships[bioguide]) memberships[bioguide] = [];
            memberships[bioguide].push(committee.name);
          }
        } else {
          // Try sub-URL for members
          const mData = await fetchJSON(
            `${getCongressAPIBaseUrl()}/committee/${CONGRESS_NUMBER}/${code}/members?api_key=${API_KEY}&format=json&limit=100`
          ).catch(() => null);
          if (!mData) return;
          const members = mData.members || mData.committeeMemberships || [];
          for (const m of (Array.isArray(members) ? members : [])) {
            const bioguide = m.bioguideId || m.bioguide_id || '';
            if (!bioguide) continue;
            if (!memberships[bioguide]) memberships[bioguide] = [];
            memberships[bioguide].push(committee.name);
          }
        }
      } catch {}
    },
    { concurrency: 8, delayMs: 150, label: 'committee memberships' }
  );

  console.log(`  Mapped ${Object.keys(memberships).length} members to committees`);
  return memberships;
}

// ─── Build Member Financial Profiles ───

function buildMemberProfiles(allTrades, committeeMemberships) {
  let membersIndex = [];
  try {
    const data = JSON.parse(readFileSync(join(process.cwd(), 'data', 'members', 'index.json'), 'utf-8'));
    membersIndex = data.members || [];
  } catch {}

  let billsIndex = [];
  try {
    const data = JSON.parse(readFileSync(join(process.cwd(), 'data', 'bills', 'index.json'), 'utf-8'));
    billsIndex = data.bills || [];
  } catch {}

  // Build member name lookup
  const nameLookup = {};
  for (const m of membersIndex) {
    const full = m.name?.toLowerCase().trim() || '';
    nameLookup[full] = m.bioguideId;
    const parts = full.split(',').map(s => s.trim());
    if (parts.length === 2) {
      nameLookup[`${parts[1]} ${parts[0]}`] = m.bioguideId;
    }
    const nameParts = full.split(' ');
    if (nameParts.length >= 2) {
      nameLookup[`${nameParts[nameParts.length - 1]}_${m.state?.toLowerCase()}`] = m.bioguideId;
    }
    const withoutHon = full.replace(/^hon\.\s*/i, '');
    nameLookup[withoutHon] = m.bioguideId;
  }

  // Group trades by member
  const byMember = {};

  for (const trade of allTrades) {
    const memberName = (trade.member || '').trim();
    const nameLower = memberName.toLowerCase();

    let bioguideId =
      nameLookup[nameLower] ||
      nameLookup[nameLower.replace(/^hon\.\s*/i, '')] ||
      null;

    if (!bioguideId && trade.state) {
      const lastName = nameLower.includes(',')
        ? nameLower.split(',')[0].trim()
        : nameLower.replace(/^hon\.\s*/i, '').split(' ').pop();
      bioguideId = nameLookup[`${lastName}_${trade.state.toLowerCase()}`];
    }

    if (!bioguideId) continue;

    if (!byMember[bioguideId]) {
      byMember[bioguideId] = {
        name: memberName,
        trades: [],
        sectors: {},
        committees: committeeMemberships[bioguideId] || [],
        committeeSectors: [],
        flags: [],
      };
    }

    const sector = getTickerSector(trade.ticker, trade.assetDescription);
    trade.sector = sector;
    byMember[bioguideId].trades.push(trade);

    if (sector) {
      if (!byMember[bioguideId].sectors[sector]) {
        byMember[bioguideId].sectors[sector] = { purchases: 0, sales: 0, total: 0 };
      }
      byMember[bioguideId].sectors[sector].total++;
      if ((trade.type || '').toLowerCase().includes('purchase')) {
        byMember[bioguideId].sectors[sector].purchases++;
      } else if ((trade.type || '').toLowerCase().includes('sale')) {
        byMember[bioguideId].sectors[sector].sales++;
      }
    }
  }

  // Analyze conflicts
  for (const [bioguideId, profile] of Object.entries(byMember)) {
    const committees = profile.committees;
    const committeeSectorSet = new Set();

    for (const commName of committees) {
      for (const sector of getCommitteeSectors(commName)) {
        committeeSectorSet.add(sector);
      }
    }
    profile.committeeSectors = [...committeeSectorSet];

    const tradeSectors = Object.keys(profile.sectors);
    const overlapping = tradeSectors.filter(s => committeeSectorSet.has(s));

    if (overlapping.length > 0) {
      for (const sector of overlapping) {
        const sectorTrades = profile.trades.filter(t => t.sector === sector);
        profile.flags.push({
          type: 'committee_overlap',
          severity: 'high',
          sector,
          tradeCount: sectorTrades.length,
          relatedCommittees: committees.filter(c =>
            getCommitteeSectors(c).includes(sector)
          ),
          description: `${sectorTrades.length} trade(s) in ${sector} sector while serving on ${committees.filter(c => getCommitteeSectors(c).includes(sector)).join(', ')}`,
        });
      }
    }

    // Check for trades near sponsored bill dates
    const sponsoredBills = billsIndex.filter(b => b.sponsor?.bioguideId === bioguideId);
    for (const bill of sponsoredBills) {
      const billSector = getBillSector(bill.policyArea);
      if (!billSector) continue;

      const nearbyTrades = profile.trades.filter(t => {
        if (t.sector !== billSector) return false;
        const tradeDate = new Date(t.transactionDate);
        const billDate = new Date(bill.introducedDate);
        const diffDays = Math.abs((tradeDate - billDate) / (1000 * 60 * 60 * 24));
        return diffDays <= 30;
      });

      if (nearbyTrades.length > 0) {
        profile.flags.push({
          type: 'bill_timing',
          severity: 'medium',
          sector: billSector,
          billId: bill.billId,
          billTitle: bill.title,
          tradeCount: nearbyTrades.length,
          description: `${nearbyTrades.length} ${billSector} trade(s) within 30 days of sponsoring ${bill.type} ${bill.number}`,
        });
      }
    }

    profile.trades.sort((a, b) => (b.transactionDate || '').localeCompare(a.transactionDate || ''));

    const purchases = profile.trades.filter(t => (t.type || '').toLowerCase().includes('purchase'));
    const sales = profile.trades.filter(t => (t.type || '').toLowerCase().includes('sale'));
    profile.summary = {
      totalTrades: profile.trades.length,
      purchases: purchases.length,
      sales: sales.length,
      uniqueTickers: [...new Set(profile.trades.map(t => t.ticker).filter(Boolean))].length,
      topSectors: Object.entries(profile.sectors)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, 5)
        .map(([sector, data]) => ({ sector, ...data })),
      flagCount: profile.flags.length,
      highSeverityFlags: profile.flags.filter(f => f.severity === 'high').length,
    };
  }

  return byMember;
}

function getBillSector(policyArea) {
  if (!policyArea) return null;
  const map = {
    'Armed Forces and National Security': 'Defense',
    'Health': 'Healthcare',
    'Taxation': 'Finance',
    'Economics and Public Finance': 'Finance',
    'Finance and Financial Sector': 'Finance',
    'Energy': 'Energy',
    'Environmental Protection': 'Energy',
    'Science, Technology, Communications': 'Technology',
    'Transportation and Public Works': 'Transportation',
    'Agriculture and Food': 'Agriculture',
    'Commerce': 'Commerce',
  };
  return map[policyArea] || null;
}

// ─── Main ───

async function main() {
  console.log('=== Fetching Financial Data & Conflict Analysis ===\n');
  const startTime = Date.now();

  // Fetch House and Senate stock trades in parallel
  const [houseTrades, senateTrades] = await Promise.all([
    fetchHouseStockTrades(),
    fetchSenateStockTrades(),
  ]);

  const allTrades = [...houseTrades, ...senateTrades];
  allTrades.sort((a, b) => (b.transactionDate || '').localeCompare(a.transactionDate || ''));
  console.log(`\nTotal trades: ${allTrades.length}`);

  // Fetch committee memberships for conflict analysis (batched)
  const committeeMemberships = await fetchCommitteeMemberships();

  // Build profiles with conflict detection
  const byMember = buildMemberProfiles(allTrades, committeeMemberships);

  writeJSON('finances/by-member.json', {
    lastUpdated: new Date().toISOString(),
    totalMembers: Object.keys(byMember).length,
    members: byMember,
  });

  const totalFlags = Object.values(byMember).reduce((sum, p) => sum + p.flags.length, 0);
  const highFlags = Object.values(byMember).reduce((sum, p) => sum + p.flags.filter(f => f.severity === 'high').length, 0);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Done in ${elapsed}s! ===`);
  console.log(`  Members with trades: ${Object.keys(byMember).length}`);
  console.log(`  Total conflict flags: ${totalFlags} (${highFlags} high severity)`);

  const flagged = Object.entries(byMember)
    .filter(([, p]) => p.flags.length > 0)
    .sort(([, a], [, b]) => b.flags.length - a.flags.length)
    .slice(0, 5);
  if (flagged.length > 0) {
    console.log('\n  Top flagged members:');
    for (const [id, p] of flagged) {
      console.log(`    ${p.name}: ${p.flags.length} flags, ${p.summary.totalTrades} trades`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
