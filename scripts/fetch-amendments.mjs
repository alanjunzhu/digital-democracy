#!/usr/bin/env node
/**
 * Fetch amendments from the Congress.gov API.
 *
 * Outputs:
 *   data/amendments/index.json          - Summary list
 *   data/amendments/{amendmentId}.json  - Individual amendment detail
 *
 * The point of storing these is the joins rather than the list: an amendment
 * names the bill it changes, the member who sponsored it, and — through its
 * actions — the roll call taken on it. That last one closes a real gap, since
 * House roll calls are titled only "On Agreeing to the Amendment" and carry no
 * reference to which amendment was at issue.
 */

import { pathToFileURL } from 'url';
import { batchProcess, fetchJSON, getCongressAPIBaseUrl, paginateCongressAPI } from './lib/api-client.mjs';
import { writeJSON } from './lib/data-writer.mjs';
import {
  amendmentChamber,
  formatAmendmentType,
  getAmendmentId,
  getAmendmentWebUrl,
  getBillId,
  normalizeAmendmentType,
  normalizeBillType,
  recordedVoteId,
} from '../shared/congress-urls.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119;

/** Amendment types that exist in a modern congress. SUAMDT stopped at the 98th. */
const AMENDMENT_TYPES = ['hamdt', 'samdt'];

/** Bounded the same way bills are, so one chamber cannot crowd out the other. */
const MAX_PER_TYPE = 250;

/**
 * Without an explicit sort the endpoint returns a congress's oldest amendments
 * first, so a capped fetch would only ever show ones submitted the week the
 * congress convened — the same trap documented in fetch-bills.mjs.
 */
async function fetchAmendmentsOfType(type) {
  console.log(`Fetching ${formatAmendmentType(type)} amendments...`);
  const baseUrl = `${getCongressAPIBaseUrl()}/amendment/${CONGRESS_NUMBER}/${type}`;
  const collected = [];

  try {
    for await (const page of paginateCongressAPI(baseUrl, API_KEY, {
      limit: 250,
      maxPages: Math.ceil(MAX_PER_TYPE / 250),
      params: { sort: 'updateDate+desc' },
    })) {
      collected.push(...(page.amendments || []));
      if (collected.length >= MAX_PER_TYPE) break;
    }
  } catch (err) {
    console.warn(`  Warning: could not fetch ${type} amendments: ${err.message}`);
    return [];
  }

  console.log(`  Got ${Math.min(collected.length, MAX_PER_TYPE)} ${formatAmendmentType(type)}`);
  return collected.slice(0, MAX_PER_TYPE);
}

/**
 * Roll calls referenced anywhere in an amendment's action list.
 *
 * The API gives chamber, session and roll number rather than an id, so the
 * stored voteId is composed rather than looked up. Entries missing any part are
 * dropped instead of yielding a malformed id that would 404 on the vote page.
 */
export function normalizeRecordedVotes(actions = []) {
  const seen = new Set();
  const votes = [];

  for (const action of actions) {
    for (const recorded of action?.recordedVotes || []) {
      const voteId = recordedVoteId(recorded);
      const key = voteId || `${recorded?.chamber}-${recorded?.rollNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      votes.push({
        voteId,
        chamber: recorded?.chamber || '',
        rollNumber: Number(recorded?.rollNumber) || 0,
        sessionNumber: Number(recorded?.sessionNumber) || 0,
        date: recorded?.date || '',
      });
    }
  }

  return votes;
}

/** The bill an amendment changes, as our stored bill id. */
export function normalizeAmendedBill(amendedBill) {
  if (!amendedBill?.type || amendedBill?.number === undefined || amendedBill?.number === null) {
    return { amendedBillId: null, amendedBillTitle: '' };
  }
  return {
    amendedBillId: getBillId(normalizeBillType(amendedBill.type), amendedBill.number),
    amendedBillTitle: amendedBill.title || '',
  };
}

export function normalizeAmendment(listItem, detail, actions = []) {
  const type = normalizeAmendmentType(listItem.type || detail?.type);
  const number = listItem.number ?? detail?.number;
  const amendmentId = getAmendmentId(type, number);
  const source = detail || listItem;

  const sponsorRaw = source?.sponsors?.[0];
  const sponsor = sponsorRaw
    ? {
        bioguideId: sponsorRaw.bioguideId || '',
        fullName: sponsorRaw.fullName || '',
        party: sponsorRaw.party || '',
        state: sponsorRaw.state || '',
      }
    : null;

  const latestAction = source?.latestAction || listItem?.latestAction;
  const { amendedBillId, amendedBillTitle } = normalizeAmendedBill(source?.amendedBill);

  const summary = {
    amendmentId,
    congress: Number(source?.congress) || CONGRESS_NUMBER,
    type: formatAmendmentType(type),
    number: Number(number),
    chamber: amendmentChamber(type),
    // House amendments describe themselves; Senate ones state a purpose.
    purpose: source?.purpose || '',
    description: source?.description || '',
    submittedDate: source?.submittedDate || '',
    proposedDate: source?.proposedDate || '',
    latestAction: latestAction?.text || '',
    latestActionDate: latestAction?.actionDate || '',
    sponsor,
    amendedBillId,
    amendedBillTitle,
    cosponsorCount: Number(source?.cosponsors?.count) || 0,
    recordedVotes: normalizeRecordedVotes(actions),
    url: getAmendmentWebUrl(CONGRESS_NUMBER, type, number),
  };

  const full = {
    ...summary,
    // Congress.gov's amendment actions include tracking records with a date
    // and a type but no text at all (seen on IntroReferral entries) — nothing
    // this page shows besides text, so a date-only row would just be a blank
    // line with no information in it.
    actions: actions
      .map((a) => ({ date: a?.actionDate || '', text: a?.text || '', type: a?.type || '' }))
      .filter((a) => a.text),
  };

  return { summary, full };
}

async function fetchAmendmentAllData(type, number) {
  const base = `${getCongressAPIBaseUrl()}/amendment/${CONGRESS_NUMBER}/${type}/${number}`;
  const qs = `api_key=${API_KEY}&format=json`;

  const [detailRes, actionsRes] = await Promise.all([
    fetchJSON(`${base}?${qs}`).catch(() => null),
    fetchJSON(`${base}/actions?${qs}&limit=100`).catch(() => null),
  ]);

  return {
    detail: detailRes?.amendment || detailRes || null,
    actions: actionsRes?.actions || [],
  };
}

async function main() {
  console.log('=== Fetching Congress Amendments ===\n');
  const startTime = Date.now();

  if (!API_KEY) {
    console.error('Error: CONGRESS_API_KEY environment variable is required.');
    process.exit(1);
  }

  const listed = [];
  for (const type of AMENDMENT_TYPES) {
    listed.push(...(await fetchAmendmentsOfType(type)));
  }

  if (listed.length === 0) {
    // A run that reaches nothing keeps whatever is already committed, the same
    // way the vote and finance fetches do, rather than publishing an empty set.
    console.warn('\nNo amendments returned; leaving existing data in place.');
    return;
  }

  console.log(`\nFetching details for ${listed.length} amendments (2 calls each)...\n`);

  const results = await batchProcess(
    listed,
    async (item) => {
      const type = normalizeAmendmentType(item.type);
      const data = await fetchAmendmentAllData(type, item.number);
      return { item, ...data };
    },
    { concurrency: 5, delayMs: 200, label: 'amendment details' }
  );

  const summaries = [];
  for (const result of results) {
    if (!result) continue;
    const { summary, full } = normalizeAmendment(result.item, result.detail, result.actions);
    if (!Number.isFinite(full.number)) continue;
    writeJSON(`amendments/${summary.amendmentId}.json`, full);
    summaries.push(summary);
  }

  // Newest activity first, matching how bills and votes are ordered.
  summaries.sort((a, b) => String(b.latestActionDate || b.submittedDate || '')
    .localeCompare(String(a.latestActionDate || a.submittedDate || '')));

  const withVotes = summaries.filter((a) => (a.recordedVotes || []).some((v) => v.voteId)).length;
  const withBill = summaries.filter((a) => a.amendedBillId).length;

  writeJSON('amendments/index.json', {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    total: summaries.length,
    amendments: summaries,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nWrote ${summaries.length} amendments in ${elapsed}s`);
  console.log(`  ${withBill} linked to a bill, ${withVotes} linked to a roll call`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
