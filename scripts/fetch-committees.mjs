#!/usr/bin/env node
/**
 * Fetch all committees from Congress.gov API, including the legislation
 * referred to each one.
 *
 * Outputs:
 *   data/committees/index.json          - Summary list of all committees
 *   data/committees/{systemCode}.json   - Individual committee details
 */

import { pathToFileURL } from 'url';
import { batchProcess, fetchJSON, getCongressAPIBaseUrl, paginateCongressAPI } from './lib/api-client.mjs';
import { writeJSON } from './lib/data-writer.mjs';
import {
  formatBillType,
  getBillId,
  getBillWebUrl,
  getCommitteeWebUrl,
  isApiUrl,
  isSubcommitteeCode,
  parentCommitteeCode,
} from '../shared/congress-urls.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119;

// The bills endpoint spans every congress a committee has ever existed for, so
// results are filtered by update date and then by congress.
const CONGRESS_START = '2025-01-03T00:00:00Z';
const MAX_BILLS_PER_COMMITTEE = 250;

async function fetchCommitteesByChamber(chamber) {
  console.log(`Fetching ${chamber} committees...`);
  const url = `${getCongressAPIBaseUrl()}/committee/${CONGRESS_NUMBER}/${chamber}?api_key=${API_KEY}&limit=250&format=json`;
  try {
    const data = await fetchJSON(url);
    const committees = data?.committees || [];
    console.log(`  Got ${committees.length} ${chamber} committees`);
    return { chamber, committees };
  } catch (err) {
    console.warn(`  Warning: Could not fetch ${chamber} committees: ${err.message}`);
    return { chamber, committees: [] };
  }
}

/**
 * Legislation referred to a committee, newest activity first.
 * Endpoint: /committee/{chamber}/{committeeCode}/bills
 */
/** The bills payload has been keyed both ways across API versions. */
function committeeBillsPayload(page) {
  return page?.['committee-bills'] || page?.committeeBills || page || {};
}

export function normalizeCommitteeBills(pages, congress = CONGRESS_NUMBER) {
  const seen = new Set();
  const bills = [];

  for (const page of pages) {
    for (const bill of committeeBillsPayload(page).bills || []) {
      if (Number(bill?.congress) !== Number(congress)) continue;
      const type = bill.type || '';
      const number = bill.number;
      if (!type || number === undefined || number === null) continue;

      const billId = getBillId(type, number);
      if (seen.has(billId)) continue;
      seen.add(billId);

      bills.push({
        billId,
        congress: Number(bill.congress),
        type: formatBillType(type),
        number: Number(number),
        relationshipType: bill.relationshipType || '',
        actionDate: (bill.actionDate || '').slice(0, 10),
        url: getBillWebUrl(bill.congress, type, number),
      });
    }
  }

  bills.sort((a, b) => (b.actionDate || '').localeCompare(a.actionDate || '') || a.billId.localeCompare(b.billId));
  return bills.slice(0, MAX_BILLS_PER_COMMITTEE);
}

async function fetchCommitteeBills(chamber, systemCode) {
  const baseUrl = `${getCongressAPIBaseUrl()}/committee/${chamber}/${systemCode}/bills`;
  const pages = [];

  try {
    // This endpoint takes no sort parameter, so it is narrowed by update date
    // and ordered locally.
    for await (const page of paginateCongressAPI(baseUrl, API_KEY, {
      limit: 250,
      maxPages: 2,
      params: { fromDateTime: CONGRESS_START },
    })) {
      pages.push(page);
    }
  } catch (err) {
    console.warn(`  Warning: Could not fetch bills for ${systemCode}: ${err.message}`);
  }

  return { bills: normalizeCommitteeBills(pages) };
}

/**
 * The API's item-level response carries the committee's own congressional
 * website. Only accept a real website — the list-level `url` is an
 * api.congress.gov referrer, which is not useful to a visitor.
 */
export function extractOfficialWebsite(committeeDetail) {
  const candidates = [
    committeeDetail?.committeeUrl,
    committeeDetail?.website,
    committeeDetail?.homepage,
    committeeDetail?.url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate) && !isApiUrl(candidate)) {
      return candidate;
    }
  }
  return '';
}

async function fetchCommitteeDetail(chamber, systemCode) {
  const url = `${getCongressAPIBaseUrl()}/committee/${chamber}/${systemCode}?api_key=${API_KEY}&format=json`;
  try {
    const data = await fetchJSON(url);
    return data?.committee || null;
  } catch (err) {
    console.warn(`  Warning: Could not fetch detail for ${systemCode}: ${err.message}`);
    return null;
  }
}

export function normalizeCommittee(committee, chamber) {
  const systemCode = committee.systemCode || '';
  const subcommittees = (committee.subcommittees || []).map(sc => ({
    systemCode: sc.systemCode || '',
    name: sc.name || '',
  }));

  const parentCode = parentCommitteeCode(systemCode);
  const parent = isSubcommitteeCode(systemCode)
    ? {
        systemCode: committee.parent?.systemCode || parentCode,
        name: committee.parent?.name || '',
      }
    : undefined;

  const summary = {
    systemCode,
    name: committee.name || '',
    chamber,
    committeeType: committee.committeeTypeCode || '',
    isSubcommittee: isSubcommitteeCode(systemCode),
    parent,
    url: getCommitteeWebUrl(chamber, systemCode, committee.name || ''),
    subcommittees: subcommittees.length > 0 ? subcommittees : undefined,
  };

  return { summary, detail: { ...summary } };
}

async function main() {
  console.log('=== Fetching Congress Committees ===\n');
  const startTime = Date.now();

  if (!API_KEY) {
    console.error('Error: CONGRESS_API_KEY environment variable is required.');
    process.exit(1);
  }

  // Fetch all 3 chamber types in parallel
  const chamberLabels = { house: 'House', senate: 'Senate', joint: 'Joint' };
  const results = await Promise.all(
    ['house', 'senate', 'joint'].map(c => fetchCommitteesByChamber(c))
  );

  const committees = [];
  for (const { chamber, committees: chamberCommittees } of results) {
    for (const c of chamberCommittees) {
      const { summary } = normalizeCommittee(c, chamberLabels[chamber]);
      if (summary.systemCode) committees.push({ apiChamber: chamber, summary });
    }
  }

  console.log(`\nFetching legislation and websites for ${committees.length} committees...`);
  const enriched = await batchProcess(
    committees,
    async ({ apiChamber, summary }) => {
      const [detail, billsResult] = await Promise.all([
        fetchCommitteeDetail(apiChamber, summary.systemCode),
        fetchCommitteeBills(apiChamber, summary.systemCode),
      ]);
      return { summary, detail, billsResult };
    },
    { concurrency: 8, delayMs: 150, label: 'committee detail + bills' }
  );

  const allSummaries = [];
  let withBills = 0;

  for (const entry of enriched) {
    if (!entry) continue;
    const { summary, detail, billsResult } = entry;
    const officialWebsite = extractOfficialWebsite(detail);
    const bills = billsResult?.bills || [];
    if (bills.length > 0) withBills++;

    allSummaries.push({ ...summary, billCount: bills.length });
    writeJSON(`committees/${summary.systemCode}.json`, {
      ...summary,
      officialWebsite: officialWebsite || undefined,
      billCount: bills.length,
      bills,
    });
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
  console.log(`${withBills} of ${allSummaries.length} committees have ${CONGRESS_NUMBER}th Congress legislation.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
