#!/usr/bin/env node
/**
 * Fetch recent bills from Congress.gov API.
 *
 * Outputs:
 *   data/bills/index.json          - Summary list of recent bills
 *   data/bills/{billId}.json       - Individual bill details
 */

import { fetchJSON, paginateCongressAPI, getCongressAPIBaseUrl, sleep } from './lib/api-client.mjs';
import { writeJSON } from './lib/data-writer.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119;
const MAX_BILLS = 500; // Fetch up to 500 recent bills

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

async function fetchBillDetail(congress, type, number) {
  const url = `${getCongressAPIBaseUrl()}/bill/${congress}/${type}/${number}?api_key=${API_KEY}&format=json`;
  await sleep(300);
  try {
    const data = await fetchJSON(url);
    const bill = data.bill || data;
    // Debug first bill
    if (number <= 10) {
      console.log(`  [debug] Bill ${type}${number} keys:`, Object.keys(bill));
      console.log(`  [debug] summaries:`, JSON.stringify(bill.summaries)?.slice(0, 150));
      console.log(`  [debug] subjects:`, JSON.stringify(bill.subjects)?.slice(0, 150));
      console.log(`  [debug] committees:`, JSON.stringify(bill.committees)?.slice(0, 150));
    }
    return bill;
  } catch (err) {
    console.warn(`  Warning: Could not fetch detail for ${type}${number}: ${err.message}`);
    return null;
  }
}

async function fetchBillSubResource(congress, type, number, resource) {
  const url = `${getCongressAPIBaseUrl()}/bill/${congress}/${type}/${number}/${resource}?api_key=${API_KEY}&format=json&limit=50`;
  await sleep(300);
  try {
    const data = await fetchJSON(url);
    return data;
  } catch (err) {
    return null;
  }
}

async function fetchBillActions(congress, type, number) {
  const url = `${getCongressAPIBaseUrl()}/bill/${congress}/${type}/${number}/actions?api_key=${API_KEY}&format=json&limit=50`;
  await sleep(300);
  try {
    const data = await fetchJSON(url);
    return data.actions || [];
  } catch (err) {
    console.warn(`  Warning: Could not fetch actions for ${type}${number}: ${err.message}`);
    return [];
  }
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

  // Extract summaries — may be inline array or from sub-resource
  const summariesArr = extraData?.summaries?.summaries || detail?.summaries || [];
  const summaryText = Array.isArray(summariesArr) && summariesArr.length > 0
    ? (summariesArr[summariesArr.length - 1].text || summariesArr[0].text || '')
    : '';

  // Extract subjects — may be inline or from sub-resource
  const subjectsData = extraData?.subjects || detail?.subjects || {};
  const legislativeSubjects = subjectsData?.legislativeSubjects || subjectsData?.subjects || [];
  const subjectNames = Array.isArray(legislativeSubjects)
    ? legislativeSubjects.map(s => s.name || s).filter(Boolean)
    : [];

  // Extract committees — may be inline or from sub-resource
  const committeesData = extraData?.committees?.committees || detail?.committees || [];
  const committeeNames = Array.isArray(committeesData)
    ? committeesData.map(c => c.name || c.committee?.name).filter(Boolean)
    : [];

  // Cosponsors count
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

async function main() {
  console.log('=== Fetching Congress Bills ===\n');

  const bills = await fetchRecentBills();
  console.log(`\nFetching details for ${bills.length} bills...`);

  const summaries = [];
  let processed = 0;

  for (const bill of bills) {
    const type = normalizeBillType(bill.type);
    const num = bill.number;

    const [detail, actions] = await Promise.all([
      fetchBillDetail(CONGRESS_NUMBER, type, num),
      fetchBillActions(CONGRESS_NUMBER, type, num),
    ]);

    // Fetch sub-resources for richer data (summaries, subjects, committees)
    let extraData = {};
    const [summariesRes, subjectsRes, committeesRes] = await Promise.all([
      fetchBillSubResource(CONGRESS_NUMBER, type, num, 'summaries'),
      fetchBillSubResource(CONGRESS_NUMBER, type, num, 'subjects'),
      fetchBillSubResource(CONGRESS_NUMBER, type, num, 'committees'),
    ]);
    extraData = { summaries: summariesRes, subjects: subjectsRes, committees: committeesRes };

    const { summary, detail: billDetail } = normalizeBill(bill, detail, actions, extraData);
    summaries.push(summary);
    writeJSON(`bills/${summary.billId}.json`, billDetail);

    processed++;
    if (processed % 50 === 0) {
      console.log(`  Processed ${processed}/${bills.length} bills`);
    }
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
    members: undefined, // preserve existing
    bills: new Date().toISOString(),
  });

  console.log(`\nDone! Wrote ${summaries.length} bill files + index.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
