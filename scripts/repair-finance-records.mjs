#!/usr/bin/env node
/**
 * Reconcile the stored trade records the way the fetch now does.
 *
 * Two scrapers parse the same PTR PDFs and describe the line items in their own
 * words, so the stored file carries each shared line twice, and CongressWatch
 * passes a filer's typo through unchecked — a purchase filed in February 2026
 * dated 12/26/2026. This rewrites data/finances/by-member.json in place; it
 * needs no API key.
 */

import { pathToFileURL } from 'url';
import { readJSON, writeJSON } from './lib/data-writer.mjs';
import { reconcileFinanceTrades } from '../shared/finance-sources.mjs';

function main() {
  const stored = readJSON('finances/by-member.json');
  if (!stored?.members) {
    console.error('No finances/by-member.json to repair.');
    process.exitCode = 1;
    return;
  }

  // A filing belongs to one member, so reconciling inside each profile is the
  // same work as reconciling the whole corpus — and it keeps every row attached
  // to the profile it was already filed under.
  const members = {};
  const totals = { dateRepaired: 0, futureDropped: 0, duplicateDropped: 0, disclosureFilled: 0 };
  let before = 0;
  let after = 0;

  for (const [bioguideId, profile] of Object.entries(stored.members)) {
    const { trades, stats } = reconcileFinanceTrades(profile.trades || []);
    before += (profile.trades || []).length;
    after += trades.length;
    for (const key of Object.keys(totals)) totals[key] += stats[key];
    members[bioguideId] = { ...profile, trades };
  }

  writeJSON('finances/by-member.json', { ...stored, members, lastUpdated: new Date().toISOString() });

  console.log(`Reconciled ${before} stored rows into ${after}:`);
  console.log(`  ${totals.duplicateDropped} duplicate line items dropped`);
  console.log(`  ${totals.dateRepaired} transaction dates repaired`);
  console.log(`  ${totals.futureDropped} still-future rows dropped`);
  console.log(`  ${totals.disclosureFilled} disclosure dates filled from the filing`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { main };
