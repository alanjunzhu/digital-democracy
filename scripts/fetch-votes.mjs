#!/usr/bin/env node
/**
 * Fetch recent House roll call votes from Congress.gov API.
 * Senate votes are NOT available in API v3.
 *
 * Outputs:
 *   data/votes/index.json       - Summary list of recent votes
 *   data/votes/{voteId}.json    - Individual vote details
 */

import { fetchJSON, getCongressAPIBaseUrl, sleep } from './lib/api-client.mjs';
import { writeJSON } from './lib/data-writer.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119;
const SESSION = 1;
const MAX_VOTES = 100;

if (!API_KEY) {
  console.error('Error: CONGRESS_API_KEY environment variable is required.');
  process.exit(1);
}

async function fetchVoteList() {
  console.log(`Fetching House votes (Congress ${CONGRESS_NUMBER}, Session ${SESSION})...`);
  const url = `${getCongressAPIBaseUrl()}/house-vote/${CONGRESS_NUMBER}/${SESSION}?api_key=${API_KEY}&limit=250&format=json`;
  await sleep(500);
  try {
    const data = await fetchJSON(url);
    const votes = data.houseVotes || data.votes || [];
    console.log(`  Got ${votes.length} votes`);
    return votes.slice(0, MAX_VOTES);
  } catch (err) {
    console.warn(`  Warning: Could not fetch vote list: ${err.message}`);
    return [];
  }
}

async function fetchVoteDetail(rollCallNumber) {
  const url = `${getCongressAPIBaseUrl()}/house-vote/${CONGRESS_NUMBER}/${SESSION}/${rollCallNumber}?api_key=${API_KEY}&format=json`;
  await sleep(300);
  try {
    const data = await fetchJSON(url);
    return data.houseVote || data.vote || null;
  } catch (err) {
    console.warn(`  Warning: Could not fetch vote ${rollCallNumber}: ${err.message}`);
    return null;
  }
}

function parsePartyTotals(partyTotal) {
  if (!partyTotal) return { democratic: z(), republican: z(), independent: z() };

  function extract(obj) {
    if (!obj) return z();
    return {
      yea: obj.yeaTotal || obj.yea || 0,
      nay: obj.nayTotal || obj.nay || 0,
      notVoting: (obj.notVotingTotal || obj.notVoting || 0) + (obj.presentTotal || obj.present || 0),
    };
  }

  function z() { return { yea: 0, nay: 0, notVoting: 0 }; }

  return {
    democratic: extract(partyTotal.democratic || partyTotal.Democrat),
    republican: extract(partyTotal.republican || partyTotal.Republican),
    independent: extract(partyTotal.independent || partyTotal.Independent),
  };
}

function normalizeVote(vote, detail) {
  const src = detail || vote;
  const rollCall = src.rollCallNumber || src.rollCall || vote.rollCallNumber || 0;
  const voteId = `rc${rollCall}`;

  const partyBreakdown = parsePartyTotals(src.votePartyTotal || src.partyTotal);
  const totalYea = partyBreakdown.democratic.yea + partyBreakdown.republican.yea + partyBreakdown.independent.yea;
  const totalNay = partyBreakdown.democratic.nay + partyBreakdown.republican.nay + partyBreakdown.independent.nay;

  // Extract bill reference
  const legType = src.legislationType || '';
  const legNum = src.legislationNumber || '';
  let billType, billNumber, billId;
  if (legType && legNum) {
    billType = legType.toLowerCase().replace('.', '');
    billNumber = parseInt(legNum);
    billId = `${billType}${billNumber}`;
  }

  const summary = {
    voteId,
    rollCallNumber: rollCall,
    congress: CONGRESS_NUMBER,
    session: SESSION,
    date: src.date || src.actionDate || vote.date || '',
    question: src.voteQuestion || src.question || '',
    result: src.result || '',
    billType: billType || undefined,
    billNumber: billNumber || undefined,
    billId: billId || undefined,
    partyBreakdown,
    totalYea,
    totalNay,
    url: `https://clerk.house.gov/Votes/${new Date().getFullYear()}${String(rollCall).padStart(3, '0')}`,
  };

  const voteDetail = {
    ...summary,
    description: src.description || src.voteQuestion || '',
    voteType: src.voteType || '',
  };

  return { summary, detail: voteDetail };
}

async function main() {
  console.log('=== Fetching House Votes ===\n');

  const votes = await fetchVoteList();
  if (votes.length === 0) {
    console.log('No votes found. Writing empty index.');
    writeJSON('votes/index.json', {
      lastUpdated: new Date().toISOString(),
      congress: CONGRESS_NUMBER,
      total: 0,
      votes: [],
    });
    return;
  }

  console.log(`\nFetching details for ${votes.length} votes...`);
  const summaries = [];
  let processed = 0;

  for (const vote of votes) {
    const rollCall = vote.rollCallNumber || vote.rollCall;
    if (!rollCall) continue;

    const detail = await fetchVoteDetail(rollCall);
    const { summary, detail: voteDetail } = normalizeVote(vote, detail);
    summaries.push(summary);
    writeJSON(`votes/${summary.voteId}.json`, voteDetail);

    processed++;
    if (processed % 25 === 0) {
      console.log(`  Processed ${processed}/${votes.length} votes`);
    }
  }

  // Sort by date descending, then roll call descending
  summaries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.rollCallNumber - a.rollCallNumber;
  });

  const index = {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    total: summaries.length,
    votes: summaries,
  };
  writeJSON('votes/index.json', index);

  console.log(`\nDone! Wrote ${summaries.length} vote files + index.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
