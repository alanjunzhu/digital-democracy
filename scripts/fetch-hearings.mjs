#!/usr/bin/env node
/**
 * Fetch committee meeting schedules from the Congress.gov API.
 *
 * Outputs:
 *   data/hearings/index.json      - Summary list
 *   data/hearings/{eventId}.json  - Individual meeting detail
 *
 * This reads `/committee-meeting/`, not `/hearing/`. They are different
 * datasets: `/hearing/` publishes transcripts of meetings already held, which
 * lag by months and carry no schedule at all. `/committee-meeting/` is the
 * schedule — it is the only one of the two with a meetingStatus, a room, and a
 * witness list.
 *
 * A schedule is the most time-sensitive thing on a site that rebuilds on a
 * cron, so the status is stored rather than assumed. A meeting can be canceled
 * hours after a build, and the honest handling of that is to render the status
 * the API last reported alongside the date it was read — never to imply the
 * page is live.
 */

import { pathToFileURL } from 'url';
import { batchProcess, fetchJSON, getCongressAPIBaseUrl, paginateCongressAPI } from './lib/api-client.mjs';
import { writeJSON } from './lib/data-writer.mjs';
import { getBillId, normalizeBillType } from '../shared/congress-urls.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119;

/**
 * Fetched per chamber rather than as one list, because Senate coverage is
 * thinner than the House's and a shared cap would let the House crowd it out
 * entirely. `nochamber` carries joint committees and commissions.
 */
const CHAMBERS = ['house', 'senate', 'nochamber'];

const MAX_PER_CHAMBER = 200;

/** The four values Congress.gov reports; anything else is passed through as-is. */
const KNOWN_STATUSES = ['Scheduled', 'Canceled', 'Postponed', 'Rescheduled'];

const CHAMBER_LABEL = { house: 'House', senate: 'Senate', nochamber: 'NoChamber' };

async function fetchMeetingsOfChamber(chamber) {
  console.log(`Fetching ${CHAMBER_LABEL[chamber]} committee meetings...`);
  const baseUrl = `${getCongressAPIBaseUrl()}/committee-meeting/${CONGRESS_NUMBER}/${chamber}`;
  const collected = [];

  try {
    for await (const page of paginateCongressAPI(baseUrl, API_KEY, {
      limit: 250,
      maxPages: Math.ceil(MAX_PER_CHAMBER / 250),
    })) {
      collected.push(...(page.committeeMeetings || []));
      if (collected.length >= MAX_PER_CHAMBER) break;
    }
  } catch (err) {
    console.warn(`  Warning: could not fetch ${chamber} meetings: ${err.message}`);
    return [];
  }

  const meetings = collected.slice(0, MAX_PER_CHAMBER);
  console.log(`  Got ${meetings.length} ${CHAMBER_LABEL[chamber]}`);
  return meetings.map((m) => ({ ...m, chamber: CHAMBER_LABEL[chamber] }));
}

/** Normalized to the four known spellings; an unknown value is kept verbatim. */
export function normalizeMeetingStatus(status) {
  const raw = String(status || '').trim();
  if (!raw) return 'Scheduled';
  return KNOWN_STATUSES.find((known) => known.toLowerCase() === raw.toLowerCase()) || raw;
}

/**
 * Committees named by a meeting, keyed the way committee pages are so the
 * upcoming-meetings section on a committee can find its own.
 */
export function normalizeMeetingCommittees(committees = []) {
  const seen = new Set();
  const out = [];

  for (const committee of committees) {
    const systemCode = String(committee?.systemCode || '').trim().toLowerCase();
    if (!systemCode || seen.has(systemCode)) continue;
    seen.add(systemCode);
    out.push({ systemCode, name: committee?.name || '' });
  }

  return out;
}

/**
 * Bills a meeting is about.
 *
 * The API nests these as `relatedItems.bills.bill[]` in some responses and as a
 * flat `bills[]` in others, so both shapes are read. Anything without a type
 * and number is dropped rather than stored as a link that would 404.
 */
export function normalizeRelatedBillIds(relatedItems) {
  const bills = relatedItems?.bills?.bill || relatedItems?.bills || [];
  const seen = new Set();

  for (const bill of Array.isArray(bills) ? bills : []) {
    if (!bill?.type || bill?.number === undefined || bill?.number === null) continue;
    seen.add(getBillId(normalizeBillType(bill.type), bill.number));
  }

  return [...seen];
}

export function normalizeLocation(location) {
  const room = location?.room || '';
  const building = location?.building || '';
  const address = [location?.address?.city, location?.address?.state].filter(Boolean).join(', ');
  if (!room && !building && !address) return null;
  return { room, building, address };
}

export function normalizeWitnesses(witnesses = []) {
  return (Array.isArray(witnesses) ? witnesses : [])
    .map((w) => ({
      name: w?.name || '',
      position: w?.position || '',
      organization: w?.organization || '',
    }))
    .filter((w) => w.name);
}

function normalizeLinks(items = [], { nameKey = 'name' } = {}) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      name: item?.[nameKey] || item?.name || '',
      url: item?.url || '',
      format: item?.format || '',
    }))
    .filter((item) => item.url);
}

export function normalizeMeeting(listItem, detail) {
  const source = detail || listItem;
  const eventId = String(listItem?.eventId ?? source?.eventId ?? '').trim();

  const summary = {
    eventId,
    congress: Number(source?.congress) || CONGRESS_NUMBER,
    chamber: source?.chamber || listItem?.chamber || 'NoChamber',
    // "Hearing", "Markup" or "Business Meeting" — a markup is not a hearing and
    // the index says which is which rather than calling everything a hearing.
    type: source?.type || '',
    title: source?.title || '',
    meetingStatus: normalizeMeetingStatus(source?.meetingStatus),
    // The meeting's own time, not the record's updateDate.
    date: source?.date || '',
    committees: normalizeMeetingCommittees(source?.committees),
    location: normalizeLocation(source?.location),
    relatedBillIds: normalizeRelatedBillIds(source?.relatedItems),
    url: listItem?.url || source?.url || null,
  };

  const full = {
    ...summary,
    witnesses: normalizeWitnesses(source?.witnesses),
    videos: normalizeLinks(source?.videos),
    meetingDocuments: normalizeLinks(source?.meetingDocuments, { nameKey: 'name' }),
  };

  return { summary, full };
}

async function fetchMeetingDetail(chamber, eventId) {
  const url = `${getCongressAPIBaseUrl()}/committee-meeting/${CONGRESS_NUMBER}/${chamber}/${eventId}?api_key=${API_KEY}&format=json`;
  const res = await fetchJSON(url).catch(() => null);
  return res?.committeeMeeting || null;
}

async function main() {
  console.log('=== Fetching Committee Meetings ===\n');
  const startTime = Date.now();

  if (!API_KEY) {
    console.error('Error: CONGRESS_API_KEY environment variable is required.');
    process.exit(1);
  }

  const listed = [];
  const byChamber = {};
  for (const chamber of CHAMBERS) {
    const meetings = await fetchMeetingsOfChamber(chamber);
    byChamber[CHAMBER_LABEL[chamber]] = meetings.length;
    for (const meeting of meetings) listed.push({ ...meeting, apiChamber: chamber });
  }

  if (listed.length === 0) {
    // Same rule the other fetches follow: a run that reaches nothing keeps
    // whatever is already committed rather than publishing an empty schedule,
    // which would read as "no meetings scheduled".
    console.warn('\nNo meetings returned; leaving existing data in place.');
    return;
  }

  console.log(`\nFetching details for ${listed.length} meetings...\n`);

  const results = await batchProcess(
    listed,
    async (item) => ({ item, detail: await fetchMeetingDetail(item.apiChamber, item.eventId) }),
    { concurrency: 5, delayMs: 200, label: 'meeting details' }
  );

  const summaries = [];
  const seen = new Set();
  for (const result of results) {
    if (!result) continue;
    const { summary, full } = normalizeMeeting(result.item, result.detail);
    // An event listed under two committees appears once per committee.
    if (!summary.eventId || seen.has(summary.eventId)) continue;
    seen.add(summary.eventId);
    writeJSON(`hearings/${summary.eventId}.json`, full);
    summaries.push(summary);
  }

  // Soonest first among what is still ahead, then the most recent past meeting.
  // The schedule is the point of the page, so upcoming leads.
  const now = Date.now();
  const time = (m) => {
    const t = Date.parse(m.date || '');
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  summaries.sort((a, b) => {
    const [ta, tb] = [time(a), time(b)];
    const [aheadA, aheadB] = [ta >= now, tb >= now];
    if (aheadA !== aheadB) return aheadA ? -1 : 1;
    return aheadA ? ta - tb : tb - ta;
  });

  const upcoming = summaries.filter((m) => time(m) >= now).length;
  const withBills = summaries.filter((m) => m.relatedBillIds.length > 0).length;
  const undated = summaries.filter((m) => !m.date).length;

  writeJSON('hearings/index.json', {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    total: summaries.length,
    hearings: summaries,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nWrote ${summaries.length} meetings in ${elapsed}s`);
  console.log(`  By chamber: ${Object.entries(byChamber).map(([c, n]) => `${c} ${n}`).join(', ')}`);
  console.log(`  ${upcoming} upcoming, ${withBills} linked to a bill, ${undated} without a date`);

  // Thin chamber coverage is a fact about the source, not about Congress, and
  // the pages say so — but it is worth seeing in the run log too.
  for (const [chamber, count] of Object.entries(byChamber)) {
    if (count === 0) console.warn(`  Note: ${chamber} returned no meetings for this congress.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
