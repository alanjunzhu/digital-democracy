#!/usr/bin/env node
/**
 * Fetch all committees from Congress.gov API.
 * Only ~3 API calls needed (one per chamber type).
 *
 * Outputs:
 *   data/committees/index.json          - Summary list of all committees
 *   data/committees/{systemCode}.json   - Individual committee details
 */

import { fetchJSON, getCongressAPIBaseUrl, sleep } from './lib/api-client.mjs';
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
  await sleep(500);
  try {
    const data = await fetchJSON(url);
    const committees = data.committees || [];
    console.log(`  Got ${committees.length} ${chamber} committees`);
    return committees;
  } catch (err) {
    console.warn(`  Warning: Could not fetch ${chamber} committees: ${err.message}`);
    return [];
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

  const detail = {
    ...summary,
  };

  return { summary, detail };
}

async function main() {
  console.log('=== Fetching Congress Committees ===\n');

  // Only 3 API calls total!
  const chambers = ['house', 'senate', 'joint'];
  const chamberLabels = { house: 'House', senate: 'Senate', joint: 'Joint' };
  const allSummaries = [];

  for (const chamber of chambers) {
    const committees = await fetchCommitteesByChamber(chamber);
    for (const c of committees) {
      const { summary, detail } = normalizeCommittee(c, chamberLabels[chamber]);

      // Only write full committees (systemCode ends in "00"), skip subcommittees
      if (summary.systemCode) {
        allSummaries.push(summary);
        writeJSON(`committees/${summary.systemCode}.json`, detail);
      }
    }
  }

  // Sort by chamber then name
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

  console.log(`\nDone! Wrote ${allSummaries.length} committee files + index.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
