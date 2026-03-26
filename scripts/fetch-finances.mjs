#!/usr/bin/env node
/**
 * Fetch financial data for Congress members from free, open sources:
 *
 * 1. House Stock Watcher (housestockwatcher.com) - Stock trades by House members
 *    Source: S3-hosted JSON, no API key needed
 *
 * 2. Senate Stock Watcher - Stock trades by Senate members
 *    Source: S3-hosted JSON, no API key needed
 *
 * 3. FEC API (api.open.fec.gov) - Campaign finance data (optional, needs FEC_API_KEY)
 *
 * Outputs:
 *   data/finances/stock-trades.json     - All recent stock trades
 *   data/finances/by-member.json        - Trades indexed by member name/bioguide
 *   data/finances/campaign-finance.json  - FEC campaign fundraising data (if key available)
 */

import { writeJSON } from './lib/data-writer.mjs';
import { sleep } from './lib/api-client.mjs';

const FEC_API_KEY = process.env.FEC_API_KEY || '';

// ─── House Stock Watcher ───

async function fetchHouseStockTrades() {
  console.log('Fetching House stock trades from housestockwatcher.com...');
  const url = 'https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json';
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`  House stock data fetch failed: ${response.status}`);
      return [];
    }
    const data = await response.json();
    console.log(`  Fetched ${data.length} House stock transactions`);

    // Filter to recent transactions (last 2 years)
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const recent = data.filter(t => {
      const date = t.transaction_date || t.disclosure_date || '';
      return date >= cutoffStr;
    });
    console.log(`  Recent (since ${cutoffStr}): ${recent.length} transactions`);

    return recent.map(t => ({
      chamber: 'House',
      member: t.representative || '',
      ticker: t.ticker || '',
      assetDescription: t.asset_description || '',
      type: t.type || '', // purchase, sale, exchange
      amount: t.amount || '',
      transactionDate: t.transaction_date || '',
      disclosureDate: t.disclosure_date || '',
      district: t.district || '',
      party: t.party || '',
      state: t.state || '',
      owner: t.owner || '',
      source: 'House Stock Watcher',
    }));
  } catch (err) {
    console.warn(`  Error fetching House stock data: ${err.message}`);
    return [];
  }
}

// ─── Senate Stock Watcher ───

async function fetchSenateStockTrades() {
  console.log('Fetching Senate stock trades from senatestockwatcher.com...');
  const url = 'https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json';
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`  Senate stock data fetch failed: ${response.status}`);
      return [];
    }
    const data = await response.json();
    console.log(`  Fetched ${data.length} Senate stock transactions`);

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const recent = data.filter(t => {
      const date = t.transaction_date || t.disclosure_date || '';
      return date >= cutoffStr;
    });
    console.log(`  Recent (since ${cutoffStr}): ${recent.length} transactions`);

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
      source: 'Senate Stock Watcher',
    }));
  } catch (err) {
    console.warn(`  Error fetching Senate stock data: ${err.message}`);
    return [];
  }
}

// ─── FEC Campaign Finance (optional) ───

async function fetchFECCandidates() {
  if (!FEC_API_KEY) {
    console.log('No FEC_API_KEY set — skipping campaign finance data.');
    console.log('  To enable, add FEC_API_KEY to your repository secrets.');
    console.log('  Get a free key at: https://api.open.fec.gov/developers/');
    return [];
  }

  console.log('Fetching FEC campaign finance data...');
  const candidates = [];

  // Fetch House and Senate candidates for recent elections
  for (const office of ['H', 'S']) {
    const label = office === 'H' ? 'House' : 'Senate';
    // Try 2024 and 2026 election cycles
    for (const cycle of [2024, 2026]) {
      const url = `https://api.open.fec.gov/v1/candidates/totals/?office=${office}&election_year=${cycle}&sort=-receipts&per_page=100&is_active_candidate=true&api_key=${FEC_API_KEY}`;
      await sleep(500);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`  FEC ${label} ${cycle} failed: ${response.status}`);
          continue;
        }
        const data = await response.json();
        const results = data.results || [];
        console.log(`  FEC ${label} ${cycle}: ${results.length} candidates`);

        for (const c of results) {
          candidates.push({
            name: c.name || '',
            candidateId: c.candidate_id || '',
            party: c.party || '',
            state: c.state || '',
            district: c.district || '',
            office: label,
            cycle,
            totalReceipts: c.receipts || 0,
            totalDisbursements: c.disbursements || 0,
            cashOnHand: c.cash_on_hand_end_period || 0,
            totalIndividualContributions: c.individual_contributions || 0,
            totalPACContributions: c.other_political_committee_contributions || 0,
          });
        }
      } catch (err) {
        console.warn(`  Error fetching FEC ${label} ${cycle}: ${err.message}`);
      }
    }
  }

  return candidates;
}

// ─── Cross-reference with members ───

function buildMemberIndex(trades) {
  // Load members for cross-referencing
  let membersIndex = [];
  try {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const data = JSON.parse(readFileSync(join(process.cwd(), 'data', 'members', 'index.json'), 'utf-8'));
    membersIndex = data.members || [];
  } catch {}

  // Build lookup by name parts
  const nameLookup = {};
  for (const m of membersIndex) {
    const lastName = m.lastName?.toLowerCase() || '';
    const firstName = m.firstName?.toLowerCase() || '';
    const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
    const lastFirst = `${m.lastName}, ${m.firstName}`.toLowerCase();
    nameLookup[fullName] = m.bioguideId;
    nameLookup[lastFirst] = m.bioguideId;
    // Just last name + state for fallback
    if (m.state) {
      nameLookup[`${lastName}_${m.state.toLowerCase()}`] = m.bioguideId;
    }
  }

  // Index trades by member
  const byMember = {};
  let matched = 0;

  for (const trade of trades) {
    const memberName = trade.member || '';
    const nameLower = memberName.toLowerCase().trim();

    // Try direct match
    let bioguideId = nameLookup[nameLower];

    // Try last,first format
    if (!bioguideId) {
      const reversed = nameLower.split(',').map(s => s.trim()).reverse().join(' ');
      bioguideId = nameLookup[reversed];
    }

    // Try last name + state
    if (!bioguideId && trade.state) {
      const lastName = nameLower.includes(',')
        ? nameLower.split(',')[0].trim()
        : nameLower.split(' ').pop();
      bioguideId = nameLookup[`${lastName}_${trade.state.toLowerCase()}`];
    }

    if (bioguideId) {
      matched++;
      if (!byMember[bioguideId]) {
        byMember[bioguideId] = { name: memberName, trades: [] };
      }
      byMember[bioguideId].trades.push(trade);
    }
  }

  console.log(`  Matched ${matched}/${trades.length} trades to members (${Object.keys(byMember).length} unique members)`);
  return byMember;
}

// ─── Main ───

async function main() {
  console.log('=== Fetching Financial Data ===\n');

  const houseTrades = await fetchHouseStockTrades();
  const senateTrades = await fetchSenateStockTrades();
  const allTrades = [...houseTrades, ...senateTrades];

  // Sort by transaction date descending
  allTrades.sort((a, b) => (b.transactionDate || '').localeCompare(a.transactionDate || ''));

  console.log(`\nTotal stock trades: ${allTrades.length}`);

  // Write trades
  writeJSON('finances/stock-trades.json', {
    lastUpdated: new Date().toISOString(),
    total: allTrades.length,
    houseTrades: houseTrades.length,
    senateTrades: senateTrades.length,
    trades: allTrades.slice(0, 5000), // Cap at 5000 to keep file size reasonable
  });

  // Build by-member index
  const byMember = buildMemberIndex(allTrades);
  writeJSON('finances/by-member.json', {
    lastUpdated: new Date().toISOString(),
    totalMembers: Object.keys(byMember).length,
    members: byMember,
  });

  // Fetch FEC data if available
  const fecCandidates = await fetchFECCandidates();
  if (fecCandidates.length > 0) {
    writeJSON('finances/campaign-finance.json', {
      lastUpdated: new Date().toISOString(),
      total: fecCandidates.length,
      candidates: fecCandidates,
    });
    console.log(`  Wrote ${fecCandidates.length} FEC candidate records`);
  }

  console.log(`\n=== Done! ===`);
  console.log(`  Stock trades: ${allTrades.length} (House: ${houseTrades.length}, Senate: ${senateTrades.length})`);
  console.log(`  Members with trades: ${Object.keys(byMember).length}`);

  if (Object.keys(byMember).length > 0) {
    const sampleId = Object.keys(byMember)[0];
    const sample = byMember[sampleId];
    console.log(`  Sample: ${sample.name} (${sampleId}): ${sample.trades.length} trades`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
