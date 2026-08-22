#!/usr/bin/env node
/**
 * Fetch roll call votes from official sources:
 *   - House: clerk.house.gov XML (no API key needed)
 *   - Senate: senate.gov XML (no API key needed)
 *
 * Fetches BOTH sessions of the current Congress to get full date range.
 * Uses concurrent batch fetching for speed — no API key = generous rate limits.
 *
 * Outputs:
 *   data/votes/index.json          - Summary list of recent votes
 *   data/votes/{voteId}.json       - Individual vote details with member positions
 *   data/votes/by-member.json      - Lookup: bioguideId -> vote positions
 */

import { pathToFileURL } from 'url';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { writeJSON, readJSON, getDataDir } from './lib/data-writer.mjs';
import { batchFetchText } from './lib/api-client.mjs';

const CONGRESS_NUMBER = 119;
const SESSIONS = [
  { session: 1, year: 2025 },
  { session: 2, year: 2026 },
];
// House sessions regularly exceed 300 roll calls; stop after a run of misses
// rather than fetching a fixed window that is both too short and too wasteful.
const MAX_PROBE = 1500;
const PROBE_BATCH = 25;
const STOP_AFTER_MISSES = 8;

// ─── XML Parsing Helpers ───

function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractAttr(xml, attr) {
  const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractAllTags(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi');
  return xml.match(regex) || [];
}

// ─── House Votes ───

export function houseVoteUrl(year, rollCall) {
  const paddedRC = String(rollCall).padStart(3, '0');
  return `https://clerk.house.gov/evs/${year}/roll${paddedRC}.xml`;
}

export function senateVoteUrl(session, voteNumber) {
  const congress = String(CONGRESS_NUMBER);
  const sess = String(session);
  const paddedVote = String(voteNumber).padStart(5, '0');
  return `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${sess}/vote_${congress}_${sess}_${paddedVote}.xml`;
}

/**
 * Fetch roll-call XML in batches and stop after a run of consecutive misses.
 * House and Senate numbering is contiguous, so a gap means the session is done.
 * A hard cap of 300 missed later votes in a long session and wasted requests
 * on a short one.
 */
export async function probeRollCalls({
  urlFor,
  parse,
  max = MAX_PROBE,
  batchSize = PROBE_BATCH,
  stopAfterMisses = STOP_AFTER_MISSES,
  label = 'XML',
}) {
  const found = [];
  let consecutiveMisses = 0;

  for (let start = 1; start <= max; start += batchSize) {
    const end = Math.min(start + batchSize - 1, max);
    const urls = [];
    for (let n = start; n <= end; n++) urls.push(urlFor(n));

    const results = await batchFetchText(urls, {
      concurrency: 10,
      delayMs: 80,
      label: `${label} ${start}-${end}`,
    });

    for (let i = 0; i < results.length; i++) {
      const xml = results[i];
      if (!xml) {
        consecutiveMisses++;
        if (consecutiveMisses >= stopAfterMisses) return found;
        continue;
      }
      consecutiveMisses = 0;
      try {
        const vote = parse(xml, start + i);
        if (vote?.rollCallNumber > 0) found.push(vote);
      } catch (err) {
        console.warn(`  Error parsing ${label} ${start + i}: ${err.message}`);
      }
    }
  }

  return found;
}

export function loadStoredVoteFiles(chamberLetter, session) {
  const dir = join(getDataDir(), 'votes');
  if (!existsSync(dir)) return [];
  const prefix = `${chamberLetter}${session}-rc`;
  const votes = [];
  for (const file of readdirSync(dir)) {
    if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;
    const vote = readJSON(`votes/${file}`);
    if (vote?.rollCallNumber > 0) votes.push(vote);
  }
  return votes;
}

export function chooseSessionVotes(fetched, existing, { chamber, session } = {}) {
  if (fetched.length > 0) return fetched;
  if (existing.length > 0) {
    console.warn(
      `  ${chamber || 'Chamber'} session ${session ?? ''} returned 0 votes; keeping ${existing.length} previously stored votes.`
    );
    return existing;
  }
  return [];
}

function parseHouseVoteXML(xml, session, year) {
  const rollCall = parseInt(extractTag(xml, 'rollcall-num')) || 0;
  const question = extractTag(xml, 'vote-question') || '';
  const result = extractTag(xml, 'vote-result') || '';
  const voteType = extractTag(xml, 'vote-type') || '';
  const dateStr = extractTag(xml, 'action-date') || '';
  const legNum = extractTag(xml, 'legis-num') || '';

  let date = '';
  if (dateStr) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      date = parsed.toISOString().split('T')[0];
    } else {
      date = dateStr;
    }
  }

  // Parse bill reference
  let billType, billNumber, billId;
  if (legNum) {
    const billMatch = legNum.match(/(H\.\s*R\.|H\.?\s*Res\.|H\.\s*J\.\s*Res\.|H\.\s*Con\.\s*Res\.|S\.|S\.\s*Res\.|S\.\s*J\.\s*Res\.|S\.\s*Con\.\s*Res\.)\s*(\d+)/i);
    if (billMatch) {
      const rawType = billMatch[1].replace(/\s+/g, '').replace(/\./g, '').toLowerCase();
      billNumber = parseInt(billMatch[2]);
      const typeMap = { 'hr': 'hr', 'hres': 'hres', 'hjres': 'hjres', 'hconres': 'hconres', 's': 's', 'sres': 'sres', 'sjres': 'sjres', 'sconres': 'sconres' };
      billType = typeMap[rawType] || rawType;
      billId = `${billType}${billNumber}`;
    }
  }

  // Parse party totals
  const totalsXML = extractTag(xml, 'vote-totals') || '';
  const partyTotals = extractAllTags(totalsXML, 'totals-by-party');

  const partyBreakdown = { democratic: z(), republican: z(), independent: z() };
  for (const pt of partyTotals) {
    const party = extractTag(pt, 'party').toLowerCase();
    const yea = parseInt(extractTag(pt, 'yea-total')) || 0;
    const nay = parseInt(extractTag(pt, 'nay-total')) || 0;
    const present = parseInt(extractTag(pt, 'present-total')) || 0;
    const notVoting = parseInt(extractTag(pt, 'not-voting-total')) || 0;
    const data = { yea, nay, notVoting: notVoting + present };

    if (party === 'democratic' || party === 'democrat') partyBreakdown.democratic = data;
    else if (party === 'republican') partyBreakdown.republican = data;
    else if (party === 'independent') partyBreakdown.independent = data;
  }

  // Fallback: totals-by-vote
  if (partyBreakdown.democratic.yea === 0 && partyBreakdown.republican.yea === 0) {
    const totalsByVote = extractAllTags(totalsXML, 'totals-by-vote');
    if (totalsByVote.length > 0) {
      const tv = totalsByVote[0];
      partyBreakdown.democratic.yea = parseInt(extractTag(tv, 'yea-total')) || 0;
      partyBreakdown.democratic.nay = parseInt(extractTag(tv, 'nay-total')) || 0;
    }
  }

  const totalYea = partyBreakdown.democratic.yea + partyBreakdown.republican.yea + partyBreakdown.independent.yea;
  const totalNay = partyBreakdown.democratic.nay + partyBreakdown.republican.nay + partyBreakdown.independent.nay;

  // Parse member votes
  const memberVotes = [];
  const recordedVotes = extractAllTags(xml, 'recorded-vote');
  for (const rv of recordedVotes) {
    const legislator = rv.match(/<legislator[^>]*>([\s\S]*?)<\/legislator>/i);
    if (!legislator) continue;

    const fullTag = legislator[0];
    const name = legislator[1].trim();
    const bioguideId = extractAttr(fullTag, 'name-id') || extractAttr(fullTag, 'bioguide-id') || '';
    const party = extractAttr(fullTag, 'party') || '';
    const state = extractAttr(fullTag, 'state') || '';
    const voteCast = extractTag(rv, 'vote') || '';

    if (bioguideId) {
      memberVotes.push({ bioguideId, name, party, state, voteCast });
    }
  }

  return {
    voteId: `h${session}-rc${rollCall}`,
    rollCallNumber: rollCall,
    congress: CONGRESS_NUMBER,
    session,
    chamber: 'House',
    date,
    question,
    result,
    voteType,
    billType,
    billNumber,
    billId,
    partyBreakdown,
    totalYea,
    totalNay,
    memberVotes,
    url: `https://clerk.house.gov/Votes/${year}${String(rollCall).padStart(3, '0')}`,
  };
}

function z() { return { yea: 0, nay: 0, notVoting: 0 }; }

// ─── Senate Votes ───

function parseSenateVoteXML(xml, session) {
  const voteNumber = parseInt(extractTag(xml, 'vote_number')) || 0;
  const question = extractTag(xml, 'vote_question_text') || extractTag(xml, 'question') || '';
  const result = extractTag(xml, 'vote_result_text') || extractTag(xml, 'vote_result') || '';
  const voteDate = extractTag(xml, 'vote_date') || '';
  const title = extractTag(xml, 'vote_title') || '';

  let date = '';
  if (voteDate) {
    const parsed = new Date(voteDate);
    if (!isNaN(parsed.getTime())) {
      date = parsed.toISOString().split('T')[0];
    } else {
      date = voteDate;
    }
  }

  // Bill reference
  const docName = extractTag(xml, 'document_name') || '';
  let billType, billNumber, billId;
  if (docName) {
    const billMatch = docName.match(/(H\.\s*R\.|S\.|H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.)\s*(\d+)/i);
    if (billMatch) {
      const rawType = billMatch[1].replace(/\s+/g, '').replace(/\./g, '').toLowerCase();
      billNumber = parseInt(billMatch[2]);
      const typeMap = { 'hr': 'hr', 's': 's', 'hjres': 'hjres', 'sjres': 'sjres', 'hconres': 'hconres', 'sconres': 'sconres' };
      billType = typeMap[rawType] || rawType;
      billId = `${billType}${billNumber}`;
    }
  }

  // Parse counts
  const countXml = extractTag(xml, 'count') || xml;
  const yeas = parseInt(extractTag(countXml, 'yeas')) || 0;
  const nays = parseInt(extractTag(countXml, 'nays')) || 0;

  // Parse member votes
  const memberVotes = [];
  const members = extractAllTags(xml, 'member');
  const partyCount = { D: { yea: 0, nay: 0, nv: 0 }, R: { yea: 0, nay: 0, nv: 0 }, I: { yea: 0, nay: 0, nv: 0 } };

  for (const m of members) {
    const firstName = extractTag(m, 'first_name') || '';
    const lastName = extractTag(m, 'last_name') || '';
    const party = extractTag(m, 'party') || '';
    const state = extractTag(m, 'state') || '';
    const voteCast = extractTag(m, 'vote_cast') || '';
    const lisId = extractTag(m, 'lis_member_id') || '';

    const name = `${firstName} ${lastName}`.trim();
    const castLower = voteCast.toLowerCase();
    const partyKey = party === 'D' ? 'D' : party === 'R' ? 'R' : 'I';

    if (castLower === 'yea' || castLower === 'aye') partyCount[partyKey].yea++;
    else if (castLower === 'nay' || castLower === 'no') partyCount[partyKey].nay++;
    else partyCount[partyKey].nv++;

    memberVotes.push({ bioguideId: lisId || '', name, party, state, voteCast });
  }

  const partyBreakdown = {
    democratic: { yea: partyCount.D.yea, nay: partyCount.D.nay, notVoting: partyCount.D.nv },
    republican: { yea: partyCount.R.yea, nay: partyCount.R.nay, notVoting: partyCount.R.nv },
    independent: { yea: partyCount.I.yea, nay: partyCount.I.nay, notVoting: partyCount.I.nv },
  };

  return {
    voteId: `s${session}-rc${voteNumber}`,
    rollCallNumber: voteNumber,
    congress: CONGRESS_NUMBER,
    session,
    chamber: 'Senate',
    date,
    question: title || question,
    result,
    voteType: '',
    billType,
    billNumber,
    billId,
    partyBreakdown,
    totalYea: yeas || (partyCount.D.yea + partyCount.R.yea + partyCount.I.yea),
    totalNay: nays || (partyCount.D.nay + partyCount.R.nay + partyCount.I.nay),
    memberVotes,
    url: `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${CONGRESS_NUMBER}${session}/vote_${CONGRESS_NUMBER}_${session}_${String(voteNumber).padStart(5, '0')}.htm`,
  };
}

// ─── Cross-reference Senate members with bioguide IDs ───

function crossRefSenateMembers(votes, membersIndex) {
  const lookup = {};
  for (const m of membersIndex) {
    if (m.chamber !== 'Senate') continue;
    const key = `${m.lastName?.toLowerCase()}_${m.state?.toLowerCase()}`;
    lookup[key] = m.bioguideId;
  }

  let matched = 0;
  for (const vote of votes) {
    for (const mv of vote.memberVotes) {
      if (mv.bioguideId && mv.bioguideId.length > 3) continue;
      const lastName = mv.name.split(' ').pop()?.toLowerCase() || '';
      const state = mv.state?.toLowerCase() || '';
      const key = `${lastName}_${state}`;
      if (lookup[key]) {
        mv.bioguideId = lookup[key];
        matched++;
      }
    }
  }
  return matched;
}

// ─── Topic inference ───

function inferTopicFromQuestion(question) {
  if (!question) return null;
  const q = question.toLowerCase();

  const topicPatterns = [
    { topic: 'Immigration', patterns: ['immigration', 'border', 'asylum', 'deportation', 'visa', 'citizenship', 'alien', 'ice '] },
    { topic: 'Armed Forces and National Security', patterns: ['defense', 'military', 'veterans', 'armed forces', 'national security', 'ndaa', 'pentagon'] },
    { topic: 'Health', patterns: ['health', 'medicare', 'medicaid', 'drug', 'pharmaceutical', 'hospital', 'medical'] },
    { topic: 'Taxation', patterns: ['tax', 'irs', 'revenue', 'tariff', 'duty', 'excise'] },
    { topic: 'Economics and Public Finance', patterns: ['budget', 'appropriation', 'spending', 'debt', 'deficit', 'fiscal', 'reconciliation'] },
    { topic: 'Education', patterns: ['education', 'school', 'student', 'university', 'college'] },
    { topic: 'Energy', patterns: ['energy', 'oil', 'gas', 'renewable', 'solar', 'nuclear', 'pipeline', 'drilling'] },
    { topic: 'Environmental Protection', patterns: ['environment', 'climate', 'pollution', 'epa', 'clean air', 'clean water', 'emission'] },
    { topic: 'Crime and Law Enforcement', patterns: ['crime', 'law enforcement', 'police', 'fbi', 'prison', 'sentencing', 'justice'] },
    { topic: 'International Affairs', patterns: ['foreign', 'international', 'treaty', 'ambassador', 'sanctions', 'aid to', 'nato'] },
    { topic: 'Transportation and Public Works', patterns: ['transportation', 'highway', 'railroad', 'aviation', 'infrastructure'] },
    { topic: 'Agriculture and Food', patterns: ['agriculture', 'farm', 'food', 'usda', 'crop'] },
    { topic: 'Labor and Employment', patterns: ['labor', 'worker', 'wage', 'employment', 'union', 'osha'] },
    { topic: 'Finance and Financial Sector', patterns: ['bank', 'financial', 'wall street', 'securities', 'crypto', 'housing'] },
    { topic: 'Government Operations and Politics', patterns: ['government', 'federal agency', 'regulation', 'inspector general'] },
    { topic: 'Civil Rights and Liberties', patterns: ['civil rights', 'discrimination', 'voting rights', 'equal', 'freedom'] },
    { topic: 'Science, Technology, Communications', patterns: ['technology', 'science', 'nasa', 'internet', 'cyber', 'ai ', 'artificial intelligence'] },
  ];

  for (const { topic, patterns } of topicPatterns) {
    for (const p of patterns) {
      if (q.includes(p)) return topic;
    }
  }

  if (q.includes('motion to') || q.includes('previous question') || q.includes('rule for') || q.includes('ordering the previous')) {
    return 'Procedural';
  }
  if (q.includes('journal') || q.includes('adjourn')) {
    return 'Procedural';
  }
  if (q.includes('nomination') || q.includes('confirming')) {
    return 'Nominations';
  }

  return null;
}

// ─── Main ───

async function main() {
  console.log('=== Fetching Roll Call Votes (Concurrent) ===\n');
  const startTime = Date.now();

  const membersIndex = readJSON('members/index.json')?.members || [];
  if (membersIndex.length > 0) {
    console.log(`Loaded ${membersIndex.length} members for cross-reference`);
  } else {
    console.log('No members index found for cross-reference');
  }

  const billTopics = {};
  for (const b of readJSON('bills/index.json')?.bills || []) {
    if (b.billId && b.policyArea) billTopics[b.billId] = b.policyArea;
  }
  if (Object.keys(billTopics).length > 0) {
    console.log(`Loaded ${Object.keys(billTopics).length} bill topics for categorization`);
  } else {
    console.log('No bill data found for topic categorization');
  }

  const allHouseVotes = [];
  const allSenateVotes = [];

  for (const { session, year } of SESSIONS) {
    console.log(`\n--- House Votes (Session ${session}, Year ${year}) ---`);
    const houseFetched = await probeRollCalls({
      urlFor: n => houseVoteUrl(year, n),
      parse: xml => parseHouseVoteXML(xml, session, year),
      label: `House S${session}`,
    });
    const houseVotes = chooseSessionVotes(
      houseFetched,
      loadStoredVoteFiles('h', session),
      { chamber: 'House', session }
    );
    allHouseVotes.push(...houseVotes);
    console.log(`  Found ${houseFetched.length} House votes for session ${session}${houseFetched.length === 0 && houseVotes.length ? ` (kept ${houseVotes.length} stored)` : ''}`);

    console.log(`\n--- Senate Votes (Session ${session}) ---`);
    const senateFetched = await probeRollCalls({
      urlFor: n => senateVoteUrl(session, n),
      parse: xml => parseSenateVoteXML(xml, session),
      label: `Senate S${session}`,
    });
    const senateVotes = chooseSessionVotes(
      senateFetched,
      loadStoredVoteFiles('s', session),
      { chamber: 'Senate', session }
    );
    allSenateVotes.push(...senateVotes);
    console.log(`  Found ${senateFetched.length} Senate votes for session ${session}${senateFetched.length === 0 && senateVotes.length ? ` (kept ${senateVotes.length} stored)` : ''}`);
  }

  console.log(`\nTotal: ${allHouseVotes.length} House + ${allSenateVotes.length} Senate`);

  // Cross-reference Senate members with bioguide IDs
  if (allSenateVotes.length > 0 && membersIndex.length > 0) {
    const matched = crossRefSenateMembers(allSenateVotes, membersIndex);
    console.log(`  Cross-referenced ${matched} Senate member-vote entries with bioguide IDs`);
  }

  // ── Combine and Write ──
  const allVotes = [...allHouseVotes, ...allSenateVotes];

  if (allVotes.length === 0) {
    console.log('\nNo votes found. Writing empty index.');
    writeJSON('votes/index.json', {
      lastUpdated: new Date().toISOString(),
      congress: CONGRESS_NUMBER,
      total: 0,
      votes: [],
    });
    return;
  }

  // Categorize votes by topic
  for (const vote of allVotes) {
    if (vote.billId && billTopics[vote.billId]) {
      vote.topic = billTopics[vote.billId];
    } else {
      vote.topic = inferTopicFromQuestion(vote.question);
    }
  }

  // Sort by date descending
  allVotes.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.rollCallNumber - a.rollCallNumber;
  });

  const summaries = [];
  const byMember = {};

  for (const vote of allVotes) {
    const { memberVotes, ...summary } = vote;
    summaries.push(summary);
    writeJSON(`votes/${vote.voteId}.json`, vote);

    for (const mv of memberVotes) {
      const id = mv.bioguideId;
      if (!id) continue;
      if (!byMember[id]) byMember[id] = [];
      byMember[id].push({
        voteId: vote.voteId,
        rollCallNumber: vote.rollCallNumber,
        chamber: vote.chamber,
        date: vote.date,
        question: vote.question,
        result: vote.result,
        billId: vote.billId || null,
        topic: vote.topic || null,
        voteCast: mv.voteCast,
      });
    }
  }

  writeJSON('votes/index.json', {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    total: summaries.length,
    houseTotal: allHouseVotes.length,
    senateTotal: allSenateVotes.length,
    votes: summaries,
  });

  const memberCount = Object.keys(byMember).length;
  writeJSON('votes/by-member.json', {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    totalMembers: memberCount,
    members: byMember,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Done in ${elapsed}s! ===`);
  console.log(`  House votes: ${allHouseVotes.length}`);
  console.log(`  Senate votes: ${allSenateVotes.length}`);
  console.log(`  Total vote files: ${allVotes.length}`);
  console.log(`  Members with vote records: ${memberCount}`);
  console.log(`  Votes with topics: ${allVotes.filter(v => v.topic).length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
