#!/usr/bin/env node
/**
 * Fetch financial data and build conflict-of-interest analysis:
 *
 * 1. Stock trades from House/Senate Stock Watcher, with House Clerk PTR filings as fallback
 * 2. Committee memberships from unitedstates/congress-legislators
 * 3. Cross-reference trades with committee assignments and bill activity
 *
 * Outputs:
 *   data/finances/by-member.json  - Per-member financial profile with trades,
 *                                    committee overlaps, and flagged conflicts
 */

import { pathToFileURL } from 'url';
import { writeJSON, readJSON } from './lib/data-writer.mjs';
import { fetchWithRetry } from './lib/api-client.mjs';
import { fetchUnitedstatesFile, mapCommitteeMemberships } from './lib/unitedstates.mjs';

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia', PR: 'Puerto Rico', GU: 'Guam', VI: 'Virgin Islands',
  AS: 'American Samoa', MP: 'Northern Mariana Islands',
};

const STATE_ABBREV_BY_NAME = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([abbr, name]) => [name.toLowerCase(), abbr.toLowerCase()])
);

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

function xmlTag(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

export function parseUsDate(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function twoYearCutoff() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);
  return cutoff.toISOString().split('T')[0];
}

/**
 * House Clerk financial-disclosure XML lists STOCK Act periodic transaction
 * reports (`FilingType` P) with a DocID that points at the official PTR PDF.
 * Tickers are inside those PDFs, so these records are filings rather than
 * individual trades — still better than wiping the page when S3 is closed.
 */
export function parseHouseFdXml(xml) {
  const filings = [];
  const blocks = String(xml).match(/<Member>[\s\S]*?<\/Member>/gi) || [];

  for (const block of blocks) {
    if (xmlTag(block, 'FilingType').toUpperCase() !== 'P') continue;

    const last = xmlTag(block, 'Last');
    const first = xmlTag(block, 'First');
    const prefix = xmlTag(block, 'Prefix');
    const stateDst = xmlTag(block, 'StateDst');
    const year = xmlTag(block, 'Year');
    const docId = xmlTag(block, 'DocID');
    const filingDate = parseUsDate(xmlTag(block, 'FilingDate'));
    const state = stateDst.slice(0, 2).toUpperCase();
    const district = stateDst.slice(2);

    filings.push({
      chamber: 'House',
      member: [prefix, first, last].filter(Boolean).join(' '),
      ticker: '',
      assetDescription: 'Periodic Transaction Report',
      type: 'PTR filing',
      amount: '',
      transactionDate: filingDate,
      disclosureDate: filingDate,
      district,
      party: '',
      state,
      owner: '',
      url: year && docId
        ? `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${docId}.pdf`
        : '',
    });
  }

  return filings;
}

export function partitionFinanceTrades(trades) {
  const filings = [];
  const tickerTrades = [];
  for (const trade of trades || []) {
    const type = String(trade.type || '').toLowerCase();
    const description = String(trade.assetDescription || '');
    if (type === 'ptr filing' || description === 'Periodic Transaction Report') {
      filings.push(trade);
    } else {
      tickerTrades.push(trade);
    }
  }
  return { filings, tickerTrades };
}

async function fetchJsonUrl(url) {
  const response = await fetchWithRetry(url);
  if (!response) return null;
  return response.json();
}

async function fetchHouseClerkPtrFilings() {
  const year = new Date().getFullYear();
  const filings = [];

  for (const y of [year, year - 1]) {
    const url = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${y}FD.xml`;
    try {
      const response = await fetchWithRetry(url);
      if (!response) {
        console.warn(`  Clerk PTR index for ${y} was not found`);
        continue;
      }
      const parsed = parseHouseFdXml(await response.text());
      console.log(`  Clerk ${y}: ${parsed.length} PTR filings`);
      filings.push(...parsed);
    } catch (err) {
      console.warn(`  Clerk PTR index for ${y}: ${err.message}`);
    }
  }

  const cutoffStr = twoYearCutoff();
  return filings.filter(t => (t.transactionDate || t.disclosureDate || '') >= cutoffStr);
}

// ─── Fetch Stock Trades ───

async function fetchCongressWatchTrades() {
  console.log('Fetching ticker trades from CongressWatch (Clerk + Senate PTR aggregate)...');
  const url = process.env.CONGRESSWATCH_TRADES_URL
    || 'https://congresswatch.vercel.app/data/trades.json';
  try {
    const data = await fetchJsonUrl(url);
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('  CongressWatch returned no trades');
      return [];
    }

    const cutoffStr = twoYearCutoff();
    const recent = data.filter(t => (t.transaction_date || t.disclosure_date || '') >= cutoffStr);
    console.log(`  ${data.length} total, ${recent.length} since ${cutoffStr}`);

    return recent.map(t => ({
      chamber: t.chamber === 'Senate' ? 'Senate' : 'House',
      member: t.member_name || '',
      ticker: t.ticker === '--' ? '' : (t.ticker || ''),
      assetDescription: t.asset_description || '',
      type: t.type || '',
      amount: t.amount || '',
      transactionDate: t.transaction_date || '',
      disclosureDate: t.disclosure_date || t.transaction_date || '',
      district: t.district || '',
      party: t.party || '',
      state: t.state || '',
      owner: t.owner || '',
      url: t.ptr_link || '',
      bioguideId: t.bioguide_id || '',
      source: 'congresswatch',
    }));
  } catch (err) {
    console.warn(`  CongressWatch unavailable: ${err.message}`);
    return [];
  }
}

export function preferBioguideOnTrade(trade, nameLookup) {
  if (trade.bioguideId) return trade.bioguideId;
  return matchTradeBioguide(trade, nameLookup);
}

async function fetchHouseStockTrades() {
  console.log('Fetching House stock trades...');
  const url = 'https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json';
  try {
    const data = await fetchJsonUrl(url);
    if (Array.isArray(data) && data.length > 0) {
      const cutoffStr = twoYearCutoff();
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
    }
    console.warn('  House Stock Watcher returned no trades');
  } catch (err) {
    console.warn(`  House Stock Watcher unavailable: ${err.message}`);
  }

  console.log('  Falling back to House Clerk PTR filings...');
  return fetchHouseClerkPtrFilings();
}

async function fetchSenateStockTrades() {
  console.log('Fetching Senate stock trades...');
  const url = 'https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json';
  try {
    const data = await fetchJsonUrl(url);
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('  Senate Stock Watcher returned no trades');
      return [];
    }

    const cutoffStr = twoYearCutoff();
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
    console.warn(`  Senate Stock Watcher unavailable: ${err.message}`);
    return [];
  }
}

async function fetchCommitteeMemberships() {
  console.log('Fetching committee memberships from unitedstates/congress-legislators...');
  const membershipFile = await fetchUnitedstatesFile(
    'committee-membership-current.json',
    'committee membership'
  );
  if (!membershipFile) return {};

  const committees = readJSON('committees/index.json')?.committees || [];
  const memberships = mapCommitteeMemberships(membershipFile, committees);
  console.log(`  Mapped ${Object.keys(memberships).length} members to committees`);
  return memberships;
}

// ─── Build Member Financial Profiles ───

export function buildNameLookup(membersIndex) {
  const nameLookup = {};
  for (const m of membersIndex) {
    const full = m.name?.toLowerCase().trim() || '';
    nameLookup[full] = m.bioguideId;
    const parts = full.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      nameLookup[`${parts[1]} ${parts[0]}`] = m.bioguideId;
    }
    const withoutHon = full.replace(/^hon\.\s*/i, '');
    nameLookup[withoutHon] = m.bioguideId;

    const lastName = (m.lastName || parts[0] || '').toLowerCase().replace(/,$/, '');
    const stateName = (m.state || '').toLowerCase();
    if (lastName && stateName) {
      nameLookup[`${lastName}_${stateName}`] = m.bioguideId;
      const abbr = STATE_ABBREV_BY_NAME[stateName];
      if (abbr) nameLookup[`${lastName}_${abbr}`] = m.bioguideId;
    }
  }
  return nameLookup;
}

export function matchTradeBioguide(trade, nameLookup) {
  if (trade.bioguideId) return trade.bioguideId;

  const nameLower = (trade.member || '').trim().toLowerCase();
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

  return bioguideId || null;
}

export function buildMemberProfiles(allTrades, committeeMemberships) {
  const membersIndex = readJSON('members/index.json')?.members || [];
  const billsIndex = readJSON('bills/index.json')?.bills || [];
  const nameLookup = buildNameLookup(membersIndex);

  const byMember = {};

  for (const trade of allTrades) {
    const memberName = (trade.member || '').trim();
    const bioguideId = matchTradeBioguide(trade, nameLookup);

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

  for (const [bioguideId, committees] of Object.entries(committeeMemberships || {})) {
    if (!byMember[bioguideId]) {
      const member = membersIndex.find(m => m.bioguideId === bioguideId);
      byMember[bioguideId] = {
        name: member?.name || '',
        trades: [],
        sectors: {},
        committees,
        committeeSectors: [],
        flags: [],
      };
    } else if (!byMember[bioguideId].committees?.length) {
      byMember[bioguideId].committees = committees;
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

  // Prefer live Stock Watcher dumps; when those S3 buckets are closed, use
  // CongressWatch's public aggregate (parsed Clerk/Senate PTRs with tickers).
  // House Clerk XML remains a last-resort filing list without tickers.
  const [houseTrades, senateTrades, congressWatchTrades] = await Promise.all([
    fetchHouseStockTrades(),
    fetchSenateStockTrades(),
    fetchCongressWatchTrades(),
  ]);

  let allTrades = [...houseTrades, ...senateTrades];
  const watcherTickerCount = allTrades.filter(t => t.ticker).length;
  const watchFilingsOnly = allTrades.length > 0 && watcherTickerCount === 0;

  if (congressWatchTrades.length > 0 && (allTrades.length === 0 || watchFilingsOnly)) {
    console.log(`\nUsing CongressWatch ticker trades (${congressWatchTrades.length}); Stock Watcher had ${watcherTickerCount} tickers.`);
    // Keep Clerk PTR filings that CongressWatch may not have mirrored yet.
    const ptrOnly = allTrades.filter(t => String(t.type || '').toLowerCase() === 'ptr filing');
    allTrades = [...congressWatchTrades, ...ptrOnly];
  }

  allTrades.sort((a, b) => (b.transactionDate || '').localeCompare(a.transactionDate || ''));
  console.log(`\nTotal trades: ${allTrades.length}`);

  const committeeMemberships = await fetchCommitteeMemberships();

  let trades = allTrades;
  if (trades.length === 0) {
    const existing = readJSON('finances/by-member.json');
    const existingTrades = Object.values(existing?.members || {}).flatMap(p => p.trades || []);
    if (existingTrades.length > 0) {
      console.warn(`No trades fetched; keeping ${existingTrades.length} previously stored trades.`);
      trades = existingTrades;
    }
  }

  const byMember = buildMemberProfiles(trades, committeeMemberships);

  writeJSON('finances/by-member.json', {
    lastUpdated: new Date().toISOString(),
    totalMembers: Object.keys(byMember).length,
    members: byMember,
    source: congressWatchTrades.length && (watcherTickerCount === 0)
      ? 'congresswatch+clerk-ptr'
      : watcherTickerCount > 0
        ? 'stock-watcher'
        : 'clerk-ptr',
  });

  const totalFlags = Object.values(byMember).reduce((sum, p) => sum + p.flags.length, 0);
  const highFlags = Object.values(byMember).reduce((sum, p) => sum + p.flags.filter(f => f.severity === 'high').length, 0);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Done in ${elapsed}s! ===`);
  console.log(`  Members with finance records: ${Object.keys(byMember).length}`);
  console.log(`  Members with trades: ${Object.values(byMember).filter(p => p.trades.length > 0).length}`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
