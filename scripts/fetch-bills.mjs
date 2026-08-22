#!/usr/bin/env node
/**
 * Fetch recent bills from Congress.gov API.
 *
 * Outputs:
 *   data/bills/index.json          - Summary list of recent bills
 *   data/bills/{billId}.json       - Individual bill details
 */

import { pathToFileURL } from 'url';
import { fetchJSON, paginateCongressAPI, getCongressAPIBaseUrl, batchProcess } from './lib/api-client.mjs';
import { readJSON, writeJSON } from './lib/data-writer.mjs';
import {
  billOriginChamber,
  formatBillType,
  getBillId,
  getBillTextWebUrl,
  getBillWebUrl,
  normalizeBillType,
} from '../shared/congress-urls.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119;
const MAX_BILLS = 500;

async function fetchRecentBills() {
  console.log(`Fetching bills from Congress.gov API (Congress ${CONGRESS_NUMBER})...`);
  const baseUrl = `${getCongressAPIBaseUrl()}/bill/${CONGRESS_NUMBER}`;
  const allBills = [];

  // Without an explicit sort the endpoint returns the congress's oldest bills
  // first, which fills the site with measures introduced the week the congress
  // convened. Sort by update date so we get bills with current activity.
  for await (const page of paginateCongressAPI(baseUrl, API_KEY, {
    limit: 250,
    maxPages: Math.ceil(MAX_BILLS / 250),
    params: { sort: 'updateDate+desc' },
  })) {
    const bills = page.bills || [];
    allBills.push(...bills);
    console.log(`  Fetched ${allBills.length} bills so far...`);
    if (allBills.length >= MAX_BILLS) break;
  }

  return allBills.slice(0, MAX_BILLS);
}

export function normalizeBill(bill, detail, actions, extraData) {
  const type = normalizeBillType(bill.type);
  const num = bill.number;
  const billId = getBillId(type, num);
  const originChamber = billOriginChamber(type);

  const sponsor = detail?.sponsors?.[0];
  const latestAction = bill.latestAction || detail?.latestAction;

  const summary = {
    congress: CONGRESS_NUMBER,
    type: formatBillType(type),
    number: Number(num),
    billId,
    title: detail?.title || bill.title || '',
    introducedDate: detail?.introducedDate || bill.introducedDate || '',
    sponsor: sponsor ? {
      bioguideId: sponsor.bioguideId || '',
      name: `${sponsor.firstName || ''} ${sponsor.lastName || ''}`.trim() || sponsor.fullName || '',
      party: sponsor.party || '',
      state: sponsor.state || '',
    } : undefined,
    latestAction: latestAction?.text || '',
    latestActionDate: latestAction?.actionDate || '',
    updateDate: detail?.updateDate || bill.updateDate || '',
    originChamber,
    policyArea: detail?.policyArea?.name || '',
    url: getBillWebUrl(CONGRESS_NUMBER, type, num),
  };

  // Extract summaries
  const summariesArr = extraData?.summaries?.summaries || detail?.summaries || [];
  const summaryText = Array.isArray(summariesArr) && summariesArr.length > 0
    ? (summariesArr[summariesArr.length - 1].text || summariesArr[0].text || '')
    : '';

  // Extract subjects
  const subjectsData = extraData?.subjects || detail?.subjects || {};
  const legislativeSubjects = subjectsData?.legislativeSubjects || subjectsData?.subjects || [];
  const subjectNames = Array.isArray(legislativeSubjects)
    ? legislativeSubjects.map(s => s.name || s).filter(Boolean)
    : [];

  const committees = normalizeBillCommittees(extraData?.committees?.committees || detail?.committees);

  const cosponsorsCount = typeof detail?.cosponsors === 'number'
    ? detail.cosponsors
    : detail?.cosponsors?.count || 0;

  const billDetail = {
    ...summary,
    summary: summaryText,
    cosponsors: cosponsorsCount,
    committees,
    subjects: subjectNames,
    actions: (actions || []).map(a => ({
      date: a.actionDate || '',
      text: a.text || '',
      chamber: a.actionCode?.startsWith('H') ? 'House' : a.actionCode?.startsWith('S') ? 'Senate' : undefined,
    })).slice(0, 20),
    textUrl: getBillTextWebUrl(CONGRESS_NUMBER, type, num),
  };

  return { summary, detail: billDetail };
}

/**
 * Keep each referral's systemCode and chamber, not just its name. Names like
 * "Judiciary Committee" exist in both chambers, so a name on its own cannot be
 * linked to the right committee.
 */
export function normalizeBillCommittees(committeesData) {
  if (!Array.isArray(committeesData)) return [];

  const seen = new Set();
  const committees = [];

  for (const entry of committeesData) {
    const committee = entry?.committee || entry;
    const name = committee?.name || '';
    const systemCode = committee?.systemCode || '';
    if (!name || seen.has(systemCode || name)) continue;
    seen.add(systemCode || name);

    const activities = Array.isArray(committee.activities)
      ? committee.activities.map(a => ({ name: a.name || '', date: a.date || '' })).filter(a => a.name)
      : [];

    committees.push({
      name,
      systemCode,
      chamber: committee.chamber || '',
      type: committee.type || '',
      activities: activities.length > 0 ? activities : undefined,
    });
  }

  return committees;
}

/**
 * Fetch all data for a single bill (detail + actions + sub-resources) in one go.
 * Uses Promise.all to parallelize the 5 API calls per bill.
 */
async function fetchBillAllData(congress, type, num) {
  const base = `${getCongressAPIBaseUrl()}/bill/${congress}/${type}/${num}`;
  const qs = `api_key=${API_KEY}&format=json`;

  const [detailRes, actionsRes, summariesRes, subjectsRes, committeesRes] = await Promise.all([
    fetchJSON(`${base}?${qs}`).catch(() => null),
    fetchJSON(`${base}/actions?${qs}&limit=50`).catch(() => null),
    fetchJSON(`${base}/summaries?${qs}&limit=50`).catch(() => null),
    fetchJSON(`${base}/subjects?${qs}&limit=50`).catch(() => null),
    fetchJSON(`${base}/committees?${qs}&limit=50`).catch(() => null),
  ]);

  return {
    detail: detailRes?.bill || detailRes || null,
    actions: actionsRes?.actions || [],
    extraData: {
      summaries: summariesRes,
      subjects: subjectsRes,
      committees: committeesRes,
    },
  };
}

async function main() {
  console.log('=== Fetching Congress Bills ===\n');
  const startTime = Date.now();

  if (!API_KEY) {
    console.error('Error: CONGRESS_API_KEY environment variable is required.');
    process.exit(1);
  }

  const bills = await fetchRecentBills();
  console.log(`\nFetching details for ${bills.length} bills (batched, 5 concurrent)...`);
  console.log('  Each bill fetches 5 sub-resources in parallel.\n');

  // Process bills in concurrent batches of 5
  // Each bill makes 5 parallel API calls internally, so effective concurrency is 5×5=25
  // Congress.gov rate limit: 5,000/hr. At ~25 concurrent with 200ms delay, we use ~500/min = safe.
  const results = await batchProcess(
    bills,
    async (bill) => {
      const type = normalizeBillType(bill.type);
      const num = bill.number;
      const data = await fetchBillAllData(CONGRESS_NUMBER, type, num);
      return { bill, ...data };
    },
    { concurrency: 5, delayMs: 200, label: 'bill details' }
  );

  const summaries = [];
  for (const result of results) {
    if (!result) continue;
    const { bill, detail, actions, extraData } = result;
    const { summary, detail: billDetail } = normalizeBill(bill, detail, actions, extraData);
    summaries.push(summary);
    writeJSON(`bills/${summary.billId}.json`, billDetail);
  }

  // Sort by latest action date descending
  summaries.sort((a, b) => {
    const dateA = a.latestActionDate || a.introducedDate || '';
    const dateB = b.latestActionDate || b.introducedDate || '';
    return dateB.localeCompare(dateA);
  });

  const index = {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    total: summaries.length,
    bills: summaries,
  };
  writeJSON('bills/index.json', index);

  writeJSON('meta/last-updated.json', {
    ...(readJSON('meta/last-updated.json') || {}),
    bills: new Date().toISOString(),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! Wrote ${summaries.length} bill files + index in ${elapsed}s.`);
  logActivityRange(summaries);
}

/**
 * Print the span of activity covered by the fetch. A run that only covers the
 * first weeks of the congress means the list endpoint came back in the wrong
 * order, which is easy to miss without this line in the job log.
 */
function logActivityRange(summaries) {
  const dates = summaries.map(s => s.latestActionDate).filter(Boolean).sort();
  if (dates.length === 0) return;
  const months = new Set(dates.map(d => d.slice(0, 7)));
  console.log(`Latest action dates: ${dates[0]} to ${dates[dates.length - 1]} (${months.size} distinct months).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
