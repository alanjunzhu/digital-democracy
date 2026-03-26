#!/usr/bin/env node
/**
 * Fetch recent bills from Congress.gov API.
 *
 * Outputs:
 *   data/bills/index.json          - Summary list of recent bills
 *   data/bills/{billId}.json       - Individual bill details
 */

import { fetchJSON, paginateCongressAPI, getCongressAPIBaseUrl, batchProcess } from './lib/api-client.mjs';
import { writeJSON } from './lib/data-writer.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119;
const MAX_BILLS = 500;

if (!API_KEY) {
  console.error('Error: CONGRESS_API_KEY environment variable is required.');
  process.exit(1);
}

async function fetchRecentBills() {
  console.log(`Fetching bills from Congress.gov API (Congress ${CONGRESS_NUMBER})...`);
  const baseUrl = `${getCongressAPIBaseUrl()}/bill/${CONGRESS_NUMBER}`;
  const allBills = [];

  for await (const page of paginateCongressAPI(baseUrl, API_KEY, { limit: 250, maxPages: 2 })) {
    const bills = page.bills || [];
    allBills.push(...bills);
    console.log(`  Fetched ${allBills.length} bills so far...`);
    if (allBills.length >= MAX_BILLS) break;
  }

  return allBills.slice(0, MAX_BILLS);
}

function normalizeBillType(type) {
  const map = { hr: 'hr', s: 's', hjres: 'hjres', sjres: 'sjres', hconres: 'hconres', sconres: 'sconres', hres: 'hres', sres: 'sres' };
  return map[type.toLowerCase()] || type.toLowerCase();
}

function formatBillType(type) {
  const map = {
    hr: 'H.R.', s: 'S.', hjres: 'H.J.Res.', sjres: 'S.J.Res.',
    hconres: 'H.Con.Res.', sconres: 'S.Con.Res.', hres: 'H.Res.', sres: 'S.Res.'
  };
  return map[type.toLowerCase()] || type.toUpperCase();
}

function normalizeBill(bill, detail, actions, extraData) {
  const type = normalizeBillType(bill.type);
  const num = bill.number;
  const billId = `${type}${num}`;
  const originChamber = type.startsWith('s') ? 'Senate' : 'House';

  const sponsor = detail?.sponsors?.[0];
  const latestAction = bill.latestAction || detail?.latestAction;

  const summary = {
    congress: CONGRESS_NUMBER,
    type: formatBillType(type),
    number: num,
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
    originChamber,
    policyArea: detail?.policyArea?.name || '',
    url: `https://www.congress.gov/bill/${CONGRESS_NUMBER}th-congress/${originChamber.toLowerCase()}-bill/${num}`,
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

  // Extract committees
  const committeesData = extraData?.committees?.committees || detail?.committees || [];
  const committeeNames = Array.isArray(committeesData)
    ? committeesData.map(c => c.name || c.committee?.name).filter(Boolean)
    : [];

  const cosponsorsCount = typeof detail?.cosponsors === 'number'
    ? detail.cosponsors
    : detail?.cosponsors?.count || 0;

  const billDetail = {
    ...summary,
    summary: summaryText,
    cosponsors: cosponsorsCount,
    committees: committeeNames,
    subjects: subjectNames,
    actions: (actions || []).map(a => ({
      date: a.actionDate || '',
      text: a.text || '',
      chamber: a.actionCode?.startsWith('H') ? 'House' : a.actionCode?.startsWith('S') ? 'Senate' : undefined,
    })).slice(0, 20),
    textUrl: `https://www.congress.gov/bill/${CONGRESS_NUMBER}th-congress/${originChamber.toLowerCase()}-bill/${num}/text`,
  };

  return { summary, detail: billDetail };
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
    members: undefined,
    bills: new Date().toISOString(),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! Wrote ${summaries.length} bill files + index in ${elapsed}s.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
