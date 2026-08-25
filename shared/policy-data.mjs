/**
 * Build-time loader for the policy-area index.
 *
 * Scoring needs every member's cast, which only the per-roll-call files carry,
 * so this reads all of them — once. The policy page and 500-odd member pages
 * render in the same process against data that cannot change mid-build, so the
 * result is memoised the way shared/data-loader.mjs memoises its reads.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { loadDataJSON } from './data-loader.mjs';
import { buildPolicyIndex, tallyPartyVotes } from './policy-areas.mjs';

let cache = null;

function dataPath(...parts) {
  return join(process.cwd(), 'data', ...parts);
}

/** Full roll-call records for every vote in the index, in index order. */
function readFullVotes(votes) {
  const records = [];
  for (const summary of votes) {
    const path = dataPath('votes', `${summary.voteId}.json`);
    if (!existsSync(path)) continue;
    try { records.push(JSON.parse(readFileSync(path, 'utf-8'))); } catch {}
  }
  return records;
}

/**
 * Bill lookups come from the bills index, which carries the policy area and
 * title classification needs. It covers only the most recently fetched bills,
 * so the few measures a roll call names but the index misses are read one file
 * at a time rather than by scanning the directory.
 */
function readBills(votes) {
  const billsById = {};
  for (const bill of loadDataJSON('bills/index.json')?.bills || []) {
    if (bill?.billId) billsById[bill.billId] = bill;
  }
  for (const vote of votes) {
    const billId = vote.billId;
    if (!billId || billsById[billId]) continue;
    const path = dataPath('bills', `${billId}.json`);
    if (!existsSync(path)) continue;
    try { billsById[billId] = JSON.parse(readFileSync(path, 'utf-8')); } catch {}
  }
  return billsById;
}

function build() {
  const votesIndex = loadDataJSON('votes/index.json') || { votes: [] };
  const membersIndex = loadDataJSON('members/index.json') || { members: [] };

  const votes = readFullVotes(votesIndex.votes || []);
  const billsById = readBills(votes);
  const index = buildPolicyIndex(votes, membersIndex.members, { billsById });

  /**
   * Party splits recounted from the individual casts. The stored
   * partyBreakdown files every House member under `democratic`, so anything
   * comparing a member to their party has to count the casts itself.
   */
  const breakdownByVoteId = {};
  for (const vote of votes) {
    if (vote.voteId) breakdownByVoteId[vote.voteId] = tallyPartyVotes(vote.memberVotes);
  }

  return { index, breakdownByVoteId, congress: votesIndex.congress };
}

function load() {
  if (!cache) cache = build();
  return cache;
}

export function loadPolicyIndex() {
  return load().index;
}

/** Roll-call party splits keyed by voteId, recounted from member casts. */
export function loadRecountedBreakdowns() {
  return load().breakdownByVoteId;
}

/** Drop the memoised build — for tests and long-lived dev processes. */
export function clearPolicyCache() {
  cache = null;
}
