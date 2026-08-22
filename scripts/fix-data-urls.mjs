#!/usr/bin/env node
/**
 * Rewrite the congress.gov URLs stored in data/ using the canonical builders.
 *
 * Everything needed is already in the records (congress, bill type, number,
 * committee chamber and systemCode), so this repairs data fetched before the
 * URL formats were corrected without spending API calls. Safe to re-run.
 *
 * Usage: node scripts/fix-data-urls.mjs [--check]
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import { getDataDir, readJSON, writeJSON } from './lib/data-writer.mjs';
import {
  getBillTextWebUrl,
  getBillWebUrl,
  getCommitteeWebUrl,
  isSubcommitteeCode,
  parentCommitteeCode,
} from '../shared/congress-urls.mjs';

const checkOnly = process.argv.includes('--check');
let changed = 0;

function save(relativePath, record) {
  changed++;
  if (!checkOnly) writeJSON(relativePath, record);
}

function billUrls(bill) {
  return {
    url: getBillWebUrl(bill.congress, bill.type, bill.number),
    textUrl: getBillTextWebUrl(bill.congress, bill.type, bill.number),
  };
}

function fixBills() {
  const index = readJSON('bills/index.json');
  if (index?.bills) {
    let indexChanged = false;
    for (const bill of index.bills) {
      const { url } = billUrls(bill);
      if (url && bill.url !== url) {
        bill.url = url;
        indexChanged = true;
      }
    }
    if (indexChanged) save('bills/index.json', index);
  }

  for (const file of readdirSync(join(getDataDir(), 'bills'))) {
    if (file === 'index.json' || !file.endsWith('.json')) continue;
    const bill = readJSON(`bills/${file}`);
    if (!bill) continue;

    const { url, textUrl } = billUrls(bill);
    if (!url) continue;
    if (bill.url === url && bill.textUrl === textUrl) continue;

    bill.url = url;
    bill.textUrl = textUrl;
    save(`bills/${file}`, bill);
  }
}

function committeeFields(committee, byCode) {
  const isSubcommittee = isSubcommitteeCode(committee.systemCode);
  const parentCode = parentCommitteeCode(committee.systemCode);
  const parent = isSubcommittee
    ? { systemCode: parentCode, name: byCode.get(parentCode)?.name || '' }
    : undefined;

  return {
    isSubcommittee,
    parent,
    url: getCommitteeWebUrl(committee.chamber, committee.systemCode, committee.name),
  };
}

function fixCommittees() {
  const index = readJSON('committees/index.json');
  const byCode = new Map((index?.committees || []).map(c => [c.systemCode, c]));

  if (index?.committees) {
    let indexChanged = false;
    for (const committee of index.committees) {
      const fields = committeeFields(committee, byCode);
      if (committee.url !== fields.url || committee.isSubcommittee !== fields.isSubcommittee) {
        Object.assign(committee, fields);
        indexChanged = true;
      }
    }
    if (indexChanged) save('committees/index.json', index);
  }

  for (const file of readdirSync(join(getDataDir(), 'committees'))) {
    if (file === 'index.json' || !file.endsWith('.json')) continue;
    const committee = readJSON(`committees/${file}`);
    if (!committee) continue;

    const fields = committeeFields(committee, byCode);
    if (committee.url === fields.url && committee.isSubcommittee === fields.isSubcommittee) continue;

    Object.assign(committee, fields);
    save(`committees/${file}`, committee);
  }
}

fixBills();
fixCommittees();

console.log(`${checkOnly ? 'Would rewrite' : 'Rewrote'} ${changed} file(s).`);
if (checkOnly && changed > 0) process.exit(1);
