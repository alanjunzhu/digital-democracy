#!/usr/bin/env node
/**
 * Fetch House roll call votes from Congress.gov API v3.
 * Also fetches per-member vote positions so each member's voting record is available.
 *
 * Outputs:
 *   data/votes/index.json          - Summary list of recent votes
 *   data/votes/{voteId}.json       - Individual vote details with member positions
 *   data/votes/by-member.json      - Lookup of member bioguideId -> their vote positions
 */

import { fetchJSON, getCongressAPIBaseUrl, sleep } from './lib/api-client.mjs';
import { writeJSON } from './lib/data-writer.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119;
const SESSION = 1;
const MAX_VOTES = 150;

if (!API_KEY) {
  console.error('Error: CONGRESS_API_KEY environment variable is required.');
  process.exit(1);
}

async function fetchVoteList() {
  console.log(`Fetching House roll call votes (Congress ${CONGRESS_NUMBER}, Session ${SESSION})...`);

  // Congress.gov API v3 endpoint for House roll call votes
  const baseUrl = `${getCongressAPIBaseUrl()}/house-roll-call-vote/${CONGRESS_NUMBER}/${SESSION}`;
  const url = `${baseUrl}?api_key=${API_KEY}&limit=250&format=json`;

  await sleep(500);
  try {
    const data = await fetchJSON(url);
    console.log(`  [debug] Response keys:`, Object.keys(data));

    // The response wraps votes in "houseRollCallVotes"
    const votes = data.houseRollCallVotes || [];
    if (Array.isArray(votes) && votes.length > 0) {
      console.log(`  Found ${votes.length} votes`);
      console.log(`  [debug] Vote[0] keys:`, Object.keys(votes[0]));
      console.log(`  [debug] Vote[0] sample:`, JSON.stringify(votes[0]).slice(0, 300));
      return votes.slice(0, MAX_VOTES);
    }

    // Fallback: try to find array in any top-level key
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        console.log(`  Found ${data[key].length} votes under key '${key}'`);
        console.log(`  [debug] Vote[0] keys:`, Object.keys(data[key][0]));
        return data[key].slice(0, MAX_VOTES);
      }
    }

    console.log(`  [debug] Full response (first 1000 chars):`, JSON.stringify(data).slice(0, 1000));
  } catch (err) {
    console.warn(`  Vote list fetch failed: ${err.message}`);
  }

  // Fallback: try alternate endpoint name
  console.log('  Trying alternate endpoint: house-vote...');
  const altUrl = `${getCongressAPIBaseUrl()}/house-vote/${CONGRESS_NUMBER}/${SESSION}?api_key=${API_KEY}&limit=250&format=json`;
  await sleep(500);
  try {
    const data = await fetchJSON(altUrl);
    console.log(`  [debug] Alt response keys:`, Object.keys(data));

    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        console.log(`  Found ${data[key].length} votes under key '${key}'`);
        return data[key].slice(0, MAX_VOTES);
      }
    }
    console.log(`  [debug] Alt full response (first 1000 chars):`, JSON.stringify(data).slice(0, 1000));
  } catch (err) {
    console.warn(`  Alt endpoint failed: ${err.message}`);
  }

  // Fallback: try fetching individual known roll call numbers
  console.log('  Trying to fetch individual roll call votes directly...');
  const directVotes = [];
  for (let rc = 1; rc <= 10; rc++) {
    const rcUrl = `${getCongressAPIBaseUrl()}/house-roll-call-vote/${CONGRESS_NUMBER}/${SESSION}/${rc}?api_key=${API_KEY}&format=json`;
    await sleep(400);
    try {
      const data = await fetchJSON(rcUrl);
      const vote = data.houseRollCallVote || data.houseVote || data;
      if (vote && (vote.rollCallNumber || vote.rollCall)) {
        directVotes.push(vote);
        if (rc <= 2) {
          console.log(`  [debug] Direct vote ${rc} keys:`, Object.keys(vote));
          console.log(`  [debug] Direct vote ${rc} sample:`, JSON.stringify(vote).slice(0, 400));
        }
      }
    } catch (err) {
      if (rc <= 2) console.log(`  [debug] Direct vote ${rc} failed: ${err.message}`);
    }
  }
  if (directVotes.length > 0) {
    console.log(`  Found ${directVotes.length} votes via direct fetch`);
    return directVotes;
  }

  console.warn('  No votes found from any method.');
  return [];
}

async function fetchVoteDetailWithMembers(rollCallNumber) {
  // First try the detailed endpoint that includes member positions
  const endpoints = [
    `${getCongressAPIBaseUrl()}/house-roll-call-vote/${CONGRESS_NUMBER}/${SESSION}/${rollCallNumber}`,
    `${getCongressAPIBaseUrl()}/house-vote/${CONGRESS_NUMBER}/${SESSION}/${rollCallNumber}`,
  ];

  for (const baseUrl of endpoints) {
    const url = `${baseUrl}?api_key=${API_KEY}&format=json`;
    await sleep(350);
    try {
      const data = await fetchJSON(url);
      const vote = data.houseRollCallVote || data.houseVote || data.vote || data;
      if (vote && (vote.rollCallNumber || vote.rollCall)) {
        return vote;
      }
    } catch (err) {
      // try next
    }
  }

  return null;
}

function extractMemberVotes(voteDetail) {
  // The API returns member votes under "results" or "members" or "voteResults"
  const possibleFields = ['results', 'members', 'voteResults', 'memberVotes'];
  let memberVotes = [];

  for (const field of possibleFields) {
    const data = voteDetail[field];
    if (Array.isArray(data) && data.length > 0) {
      memberVotes = data;
      break;
    }
  }

  // Normalize member vote entries
  return memberVotes.map(mv => ({
    bioguideId: mv.bioguideId || mv.member?.bioguideId || '',
    name: [mv.firstName, mv.lastName].filter(Boolean).join(' ') ||
          mv.memberName || mv.name || '',
    party: mv.voteParty || mv.party || '',
    state: mv.voteState || mv.state || '',
    voteCast: mv.voteCast || mv.vote || mv.position || '',
  })).filter(mv => mv.bioguideId);
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
    democratic: extract(partyTotal.democratic || partyTotal.Democrat || partyTotal.D),
    republican: extract(partyTotal.republican || partyTotal.Republican || partyTotal.R),
    independent: extract(partyTotal.independent || partyTotal.Independent || partyTotal.I),
  };
}

function normalizeVote(vote) {
  const rollCall = vote.rollCallNumber || vote.rollCall || 0;
  const voteId = `rc${rollCall}`;

  const partyBreakdown = parsePartyTotals(vote.votePartyTotal || vote.partyTotal);
  const totalYea = partyBreakdown.democratic.yea + partyBreakdown.republican.yea + partyBreakdown.independent.yea;
  const totalNay = partyBreakdown.democratic.nay + partyBreakdown.republican.nay + partyBreakdown.independent.nay;

  // Extract bill reference
  const legType = vote.legislationType || '';
  const legNum = vote.legislationNumber || '';
  let billType, billNumber, billId;
  if (legType && legNum) {
    billType = legType.toLowerCase().replace(/\./g, '');
    billNumber = parseInt(legNum);
    billId = `${billType}${billNumber}`;
  }

  // Extract member votes
  const memberPositions = extractMemberVotes(vote);

  const summary = {
    voteId,
    rollCallNumber: rollCall,
    congress: CONGRESS_NUMBER,
    session: SESSION,
    date: vote.date || vote.startDate || vote.actionDate || '',
    question: vote.voteQuestion || vote.question || '',
    result: vote.result || '',
    billType: billType || undefined,
    billNumber: billNumber || undefined,
    billId: billId || undefined,
    partyBreakdown,
    totalYea,
    totalNay,
    url: `https://clerk.house.gov/Votes/${new Date().getFullYear()}${String(rollCall).padStart(3, '0')}`,
  };

  const detail = {
    ...summary,
    description: vote.description || vote.voteQuestion || '',
    voteType: vote.voteType || '',
    memberVotes: memberPositions,
  };

  return { summary, detail };
}

async function main() {
  console.log('=== Fetching House Roll Call Votes ===\n');

  const rawVotes = await fetchVoteList();

  if (rawVotes.length === 0) {
    console.log('\nNo votes found from list endpoint. Attempting to fetch by iterating roll call numbers...');
  }

  // If we got votes from the list, we need to fetch each one's detail for member positions
  let votes = rawVotes;
  const needsDetailFetch = votes.length > 0 && !votes[0].results && !votes[0].members;

  if (votes.length === 0) {
    // Try brute-force fetching roll calls 1 through MAX_VOTES
    console.log(`Fetching roll calls 1-${MAX_VOTES} individually...`);
    let consecutiveFails = 0;
    for (let rc = 1; rc <= MAX_VOTES + 50; rc++) {
      const detail = await fetchVoteDetailWithMembers(rc);
      if (detail) {
        votes.push(detail);
        consecutiveFails = 0;
        if (rc % 25 === 0) console.log(`  Fetched ${votes.length} votes so far (at RC ${rc})...`);
      } else {
        consecutiveFails++;
        if (consecutiveFails >= 10) {
          console.log(`  Stopping after ${consecutiveFails} consecutive missing roll calls at RC ${rc}`);
          break;
        }
      }
    }
    console.log(`  Total votes fetched: ${votes.length}`);
  }

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

  // Fetch details with member positions if needed
  const summaries = [];
  const byMember = {}; // bioguideId -> [{voteId, rollCall, voteCast, question, date, billId}]
  let processed = 0;

  for (const vote of votes) {
    let fullVote = vote;

    if (needsDetailFetch) {
      const rc = vote.rollCallNumber || vote.rollCall;
      if (!rc) continue;
      const detail = await fetchVoteDetailWithMembers(rc);
      if (detail) fullVote = detail;
    }

    const { summary, detail } = normalizeVote(fullVote);
    summaries.push(summary);
    writeJSON(`votes/${summary.voteId}.json`, detail);

    // Index member votes
    if (detail.memberVotes) {
      for (const mv of detail.memberVotes) {
        if (!mv.bioguideId) continue;
        if (!byMember[mv.bioguideId]) byMember[mv.bioguideId] = [];
        byMember[mv.bioguideId].push({
          voteId: summary.voteId,
          rollCallNumber: summary.rollCallNumber,
          date: summary.date,
          question: summary.question,
          result: summary.result,
          billId: summary.billId || null,
          voteCast: mv.voteCast,
        });
      }
    }

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

  // Write by-member index
  const memberCount = Object.keys(byMember).length;
  writeJSON('votes/by-member.json', {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    totalMembers: memberCount,
    members: byMember,
  });

  console.log(`\nDone! Wrote ${summaries.length} vote files + index.`);
  console.log(`  Member voting records: ${memberCount} members`);
  if (memberCount > 0) {
    const sampleId = Object.keys(byMember)[0];
    console.log(`  Sample member ${sampleId}: ${byMember[sampleId].length} votes`);
    console.log(`  Sample vote:`, JSON.stringify(byMember[sampleId][0]).slice(0, 200));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
