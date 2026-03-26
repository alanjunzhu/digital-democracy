#!/usr/bin/env node
/**
 * Fetch all committees from Congress.gov API.
 * Fetches all 3 chamber types in parallel.
 *
 * Outputs:
 *   data/committees/index.json          - Summary list of all committees
 *   data/committees/{systemCode}.json   - Individual committee details
 */

import { fetchJSON, getCongressAPIBaseUrl } from './lib/api-client.mjs';
import { writeJSON } from './lib/data-writer.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119;

if (!API_KEY) {
  console.error('Error: CONGRESS_API_KEY environment variable is required.');
  process.exit(1);
}

async function fetchCommitteesByChamber(chamber) {
  console.log(`Fetching ${chamber} committees...`);
  const url = `${getCongressAPIBaseUrl()}/committee/${CONGRESS_NUMBER}/${chamber}?api_key=${API_KEY}&limit=250&format=json`;
  try {
    const data = await fetchJSON(url);
    const committees = data.committees || [];
    console.log(`  Got ${committees.length} ${chamber} committees`);
    return { chamber, committees };
  } catch (err) {
    console.warn(`  Warning: Could not fetch ${chamber} committees: ${err.message}`);
    return { chamber, committees: [] };
  }
}

function normalizeCommittee(committee, chamber) {
  const systemCode = committee.systemCode || '';
  const subcommittees = (committee.subcommittees || []).map(sc => ({
    systemCode: sc.systemCode || '',
    name: sc.name || '',
  }));

  const summary = {
    systemCode,
    name: committee.name || '',
    chamber,
    committeeType: committee.committeeTypeCode || '',
    url: `https://www.congress.gov/committee/${chamber.toLowerCase()}/${systemCode}`,
    subcommittees: subcommittees.length > 0 ? subcommittees : undefined,
  };

  return { summary, detail: { ...summary } };
}

async function main() {
  console.log('=== Fetching Congress Committees ===\n');
  const startTime = Date.now();

  // Fetch all 3 chamber types in parallel
  const chamberLabels = { house: 'House', senate: 'Senate', joint: 'Joint' };
  const results = await Promise.all(
    ['house', 'senate', 'joint'].map(c => fetchCommitteesByChamber(c))
  );

  const allSummaries = [];
  for (const { chamber, committees } of results) {
    for (const c of committees) {
      const { summary, detail } = normalizeCommittee(c, chamberLabels[chamber]);
      if (summary.systemCode) {
        allSummaries.push(summary);
        writeJSON(`committees/${summary.systemCode}.json`, detail);
      }
    }
  }

  allSummaries.sort((a, b) => {
    const chamberOrder = { Senate: 0, House: 1, Joint: 2 };
    if (a.chamber !== b.chamber) return (chamberOrder[a.chamber] || 3) - (chamberOrder[b.chamber] || 3);
    return a.name.localeCompare(b.name);
  });

  const index = {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    total: allSummaries.length,
    committees: allSummaries,
  };
  writeJSON('committees/index.json', index);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! Wrote ${allSummaries.length} committee files + index in ${elapsed}s.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
