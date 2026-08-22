#!/usr/bin/env node
/**
 * Rewrite stored roll-call JSON so member pages and bill pages can join it.
 *
 * Senate XML stores LIS ids (S428). The original matcher skipped those and
 * keyed on full state names, so no senator received a voting record. Citations
 * such as "S. Res. 817" were also stored as s817. This script needs no API key.
 */

import { join } from 'path';
import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import { readJSON, writeJSON, getDataDir } from './lib/data-writer.mjs';
import {
  applyVoteRecordRepairs,
  buildSenateNameLookup,
  isBioguideId,
} from './fetch-votes.mjs';
import { rebuildByMemberIndex } from '../shared/vote-member-index.mjs';

export { rebuildByMemberIndex };

function main() {
  const members = readJSON('members/index.json')?.members || [];
  const lookup = buildSenateNameLookup(members);
  const files = readdirSync(join(getDataDir(), 'votes')).filter(
    file => file.endsWith('.json') && file !== 'index.json' && file !== 'by-member.json'
  );

  const votes = [];
  let senateMatched = 0;
  let citationFixed = 0;

  for (const file of files) {
    const voteId = file.replace(/\.json$/, '');
    const raw = readJSON(`votes/${voteId}.json`);
    if (!raw?.voteId) continue;
    const repaired = applyVoteRecordRepairs(raw, lookup);
    if (raw.chamber === 'Senate') {
      senateMatched += repaired.memberVotes.filter(mv => isBioguideId(mv.bioguideId)).length;
    }
    if (repaired.billId && repaired.billId !== raw.billId) citationFixed++;
    if (JSON.stringify(repaired) !== JSON.stringify(raw)) {
      writeJSON(`votes/${voteId}.json`, repaired);
    }
    votes.push(repaired);
  }

  votes.sort((a, b) => {
    if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
    return (b.rollCallNumber || 0) - (a.rollCallNumber || 0);
  });

  const summaries = votes.map(({ memberVotes, ...summary }) => summary);
  const houseTotal = summaries.filter(v => v.chamber === 'House').length;
  const senateTotal = summaries.filter(v => v.chamber === 'Senate').length;
  const byMember = rebuildByMemberIndex(votes, { isBioguideId });

  writeJSON('votes/index.json', {
    lastUpdated: new Date().toISOString(),
    congress: 119,
    total: summaries.length,
    houseTotal,
    senateTotal,
    votes: summaries,
  });
  writeJSON('votes/by-member.json', {
    lastUpdated: new Date().toISOString(),
    congress: 119,
    totalMembers: Object.keys(byMember).length,
    members: byMember,
  });

  console.log(`Repaired ${votes.length} vote files.`);
  console.log(`  Senate positions with a bioguide id: ${senateMatched}`);
  console.log(`  Citations rewritten: ${citationFixed}`);
  console.log(`  Members in by-member.json: ${Object.keys(byMember).length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
