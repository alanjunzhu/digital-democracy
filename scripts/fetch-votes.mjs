#!/usr/bin/env node
/**
 * Fetch roll call votes from official sources:
 *   - House: clerk.house.gov XML (no API key needed)
 *   - Senate: senate.gov XML (no API key needed)
 *
 * These provide individual member vote positions (Yea/Nay/Not Voting).
 *
 * Outputs:
 *   data/votes/index.json          - Summary list of recent votes
 *   data/votes/{voteId}.json       - Individual vote details with member positions
 *   data/votes/by-member.json      - Lookup: bioguideId -> vote positions
 */

import { writeJSON } from './lib/data-writer.mjs';
import { sleep } from './lib/api-client.mjs';

const CONGRESS_NUMBER = 119;
const SESSION = 1;
const YEAR = 2025; // 119th Congress, 1st session starts Jan 2025
const MAX_HOUSE_VOTES = 200;
const MAX_SENATE_VOTES = 200;

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

function extractSelfClosingOrTag(xml, tag) {
  // Match both <tag>content</tag> and <tag attr="val" />
  const regex = new RegExp(`<${tag}[^>]*(?:>([\\s\\S]*?)</${tag}>|/>)`, 'i');
  const match = xml.match(regex);
  return match ? (match[1] || '').trim() : '';
}

// ─── House Votes (clerk.house.gov) ───

async function fetchHouseVoteXML(rollCall) {
  const paddedRC = String(rollCall).padStart(3, '0');
  const url = `https://clerk.house.gov/evs/${YEAR}/roll${paddedRC}.xml`;
  await sleep(300);
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function parseHouseVoteXML(xml) {
  // Extract vote metadata
  const rollCall = parseInt(extractTag(xml, 'rollcall-num')) || 0;
  const question = extractTag(xml, 'vote-question') || '';
  const result = extractTag(xml, 'vote-result') || '';
  const voteType = extractTag(xml, 'vote-type') || '';
  const dateStr = extractTag(xml, 'action-date') || '';
  const timeStr = extractTag(xml, 'action-time') || '';
  const legNum = extractTag(xml, 'legis-num') || '';

  // Parse date
  let date = '';
  if (dateStr) {
    // Format: "20-Jan-2025" or similar
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      date = parsed.toISOString().split('T')[0];
    } else {
      date = dateStr;
    }
  }

  // Parse bill reference from legis-num
  let billType, billNumber, billId;
  if (legNum) {
    const billMatch = legNum.match(/(H\.\s*R\.|H\.?\s*Res\.|H\.\s*J\.\s*Res\.|H\.\s*Con\.\s*Res\.|S\.|S\.\s*Res\.|S\.\s*J\.\s*Res\.|S\.\s*Con\.\s*Res\.)\s*(\d+)/i);
    if (billMatch) {
      const rawType = billMatch[1].replace(/\s+/g, '').replace(/\./g, '').toLowerCase();
      billNumber = parseInt(billMatch[2]);
      // Normalize type
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

  // Fallback: parse totals-by-vote if party totals are empty
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

  // Parse individual member votes
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
      memberVotes.push({
        bioguideId,
        name,
        party,
        state,
        voteCast,
      });
    }
  }

  return {
    voteId: `h-rc${rollCall}`,
    rollCallNumber: rollCall,
    congress: CONGRESS_NUMBER,
    session: SESSION,
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
    url: `https://clerk.house.gov/Votes/${YEAR}${String(rollCall).padStart(3, '0')}`,
  };
}

function z() { return { yea: 0, nay: 0, notVoting: 0 }; }

// ─── Senate Votes (senate.gov) ───

async function fetchSenateVoteXML(voteNumber) {
  const congress = String(CONGRESS_NUMBER);
  const session = String(SESSION);
  const paddedVote = String(voteNumber).padStart(5, '0');
  const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${paddedVote}.xml`;
  await sleep(300);
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function parseSenateVoteXML(xml) {
  const voteNumber = parseInt(extractTag(xml, 'vote_number')) || 0;
  const question = extractTag(xml, 'vote_question_text') || extractTag(xml, 'question') || '';
  const result = extractTag(xml, 'vote_result_text') || extractTag(xml, 'vote_result') || '';
  const voteDate = extractTag(xml, 'vote_date') || '';
  const title = extractTag(xml, 'vote_title') || '';
  const docTitle = extractTag(xml, 'document_title') || '';

  // Parse date
  let date = '';
  if (voteDate) {
    const parsed = new Date(voteDate);
    if (!isNaN(parsed.getTime())) {
      date = parsed.toISOString().split('T')[0];
    } else {
      date = voteDate;
    }
  }

  // Try to extract bill reference from document
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

  // Parse individual member votes
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
    const bioguideId = extractTag(m, 'member_full') ? '' : ''; // Senate XML doesn't always have bioguide

    const name = `${firstName} ${lastName}`.trim();
    const castLower = voteCast.toLowerCase();
    const partyKey = party === 'D' ? 'D' : party === 'R' ? 'R' : 'I';

    if (castLower === 'yea' || castLower === 'aye') partyCount[partyKey].yea++;
    else if (castLower === 'nay' || castLower === 'no') partyCount[partyKey].nay++;
    else partyCount[partyKey].nv++;

    memberVotes.push({
      bioguideId: lisId || '', // Will try to cross-reference later
      name,
      party,
      state,
      voteCast,
    });
  }

  const partyBreakdown = {
    democratic: { yea: partyCount.D.yea, nay: partyCount.D.nay, notVoting: partyCount.D.nv },
    republican: { yea: partyCount.R.yea, nay: partyCount.R.nay, notVoting: partyCount.R.nv },
    independent: { yea: partyCount.I.yea, nay: partyCount.I.nay, notVoting: partyCount.I.nv },
  };

  return {
    voteId: `s-rc${voteNumber}`,
    rollCallNumber: voteNumber,
    congress: CONGRESS_NUMBER,
    session: SESSION,
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
    url: `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${CONGRESS_NUMBER}${SESSION}/vote_${CONGRESS_NUMBER}_${SESSION}_${String(voteNumber).padStart(5, '0')}.htm`,
  };
}

// ─── Cross-reference Senate members with bioguide IDs ───

function crossRefSenateMembers(votes, membersIndex) {
  // Build a lookup by last name + state
  const lookup = {};
  for (const m of membersIndex) {
    const key = `${m.lastName?.toLowerCase()}_${m.state?.toLowerCase()}`;
    lookup[key] = m.bioguideId;
    // Also try with full state name
    const key2 = `${m.lastName?.toLowerCase()}_${m.state}`;
    lookup[key2] = m.bioguideId;
  }

  for (const vote of votes) {
    for (const mv of vote.memberVotes) {
      if (mv.bioguideId) continue; // Already has one
      const lastName = mv.name.split(' ').pop()?.toLowerCase() || '';
      const state = mv.state?.toLowerCase() || '';
      const key = `${lastName}_${state}`;
      if (lookup[key]) {
        mv.bioguideId = lookup[key];
      }
    }
  }
}

// ─── Main ───

async function main() {
  console.log('=== Fetching Roll Call Votes ===\n');

  // Try to load members index for cross-referencing Senate bioguide IDs
  let membersIndex = [];
  try {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const data = JSON.parse(readFileSync(join(process.cwd(), 'data', 'members', 'index.json'), 'utf-8'));
    membersIndex = data.members || [];
    console.log(`Loaded ${membersIndex.length} members for cross-reference`);
  } catch {
    console.log('No members index found for cross-reference');
  }

  // ── Fetch House Votes ──
  console.log(`\n--- House Votes (clerk.house.gov, year ${YEAR}) ---`);
  const houseVotes = [];
  let consecutiveFails = 0;

  for (let rc = 1; rc <= MAX_HOUSE_VOTES + 50; rc++) {
    const xml = await fetchHouseVoteXML(rc);
    if (xml) {
      try {
        const vote = parseHouseVoteXML(xml);
        if (vote.rollCallNumber > 0) {
          houseVotes.push(vote);
          consecutiveFails = 0;
          if (rc <= 2) {
            console.log(`  [debug] House RC ${rc}: "${vote.question}" -> ${vote.result}`);
            console.log(`  [debug]   Members: ${vote.memberVotes.length}, Yea: ${vote.totalYea}, Nay: ${vote.totalNay}`);
          }
        }
      } catch (err) {
        console.warn(`  Error parsing House RC ${rc}: ${err.message}`);
      }
    } else {
      consecutiveFails++;
      if (consecutiveFails >= 10) {
        console.log(`  Stopping House after ${rc} roll calls (${consecutiveFails} consecutive misses)`);
        break;
      }
    }
    if (rc % 25 === 0) console.log(`  Checked ${rc} roll calls, found ${houseVotes.length} votes...`);
  }
  console.log(`  Total House votes: ${houseVotes.length}`);

  // ── Fetch Senate Votes ──
  console.log(`\n--- Senate Votes (senate.gov) ---`);
  const senateVotes = [];
  consecutiveFails = 0;

  for (let vn = 1; vn <= MAX_SENATE_VOTES + 50; vn++) {
    const xml = await fetchSenateVoteXML(vn);
    if (xml) {
      try {
        const vote = parseSenateVoteXML(xml);
        if (vote.rollCallNumber > 0) {
          senateVotes.push(vote);
          consecutiveFails = 0;
          if (vn <= 2) {
            console.log(`  [debug] Senate vote ${vn}: "${vote.question}" -> ${vote.result}`);
            console.log(`  [debug]   Members: ${vote.memberVotes.length}, Yea: ${vote.totalYea}, Nay: ${vote.totalNay}`);
          }
        }
      } catch (err) {
        console.warn(`  Error parsing Senate vote ${vn}: ${err.message}`);
      }
    } else {
      consecutiveFails++;
      if (consecutiveFails >= 10) {
        console.log(`  Stopping Senate after ${vn} votes (${consecutiveFails} consecutive misses)`);
        break;
      }
    }
    if (vn % 25 === 0) console.log(`  Checked ${vn} votes, found ${senateVotes.length} votes...`);
  }
  console.log(`  Total Senate votes: ${senateVotes.length}`);

  // Cross-reference Senate members with bioguide IDs
  if (senateVotes.length > 0 && membersIndex.length > 0) {
    crossRefSenateMembers(senateVotes, membersIndex);
    const sampleVote = senateVotes[0];
    const withBioguide = sampleVote.memberVotes.filter(mv => mv.bioguideId).length;
    console.log(`  Cross-referenced: ${withBioguide}/${sampleVote.memberVotes.length} members have bioguide IDs`);
  }

  // ── Combine and Write ──
  const allVotes = [...houseVotes, ...senateVotes];

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

  // Sort by date descending
  allVotes.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.rollCallNumber - a.rollCallNumber;
  });

  const summaries = [];
  const byMember = {};

  for (const vote of allVotes) {
    // Summary (without member positions)
    const { memberVotes, ...summary } = vote;
    summaries.push(summary);

    // Write detail file with member positions
    writeJSON(`votes/${vote.voteId}.json`, vote);

    // Index by member
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
        voteCast: mv.voteCast,
      });
    }
  }

  // Write index
  writeJSON('votes/index.json', {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    total: summaries.length,
    houseTotal: houseVotes.length,
    senateTotal: senateVotes.length,
    votes: summaries,
  });

  // Write by-member index
  const memberCount = Object.keys(byMember).length;
  writeJSON('votes/by-member.json', {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    totalMembers: memberCount,
    members: byMember,
  });

  console.log(`\n=== Done! ===`);
  console.log(`  House votes: ${houseVotes.length}`);
  console.log(`  Senate votes: ${senateVotes.length}`);
  console.log(`  Total vote files: ${allVotes.length}`);
  console.log(`  Members with vote records: ${memberCount}`);

  if (memberCount > 0) {
    const sampleId = Object.keys(byMember)[0];
    console.log(`  Sample member ${sampleId}: ${byMember[sampleId].length} votes`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
