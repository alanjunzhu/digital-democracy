/**
 * Guards the committee-meeting normalizers.
 *
 * The joins are the fragile part. A meeting's committees are matched to
 * committee pages by `systemCode`, which the stored committee index keys in
 * lowercase — a meeting arriving with "HSAG00" would silently show up on no
 * committee page at all. Related bills are similarly load-bearing and arrive in
 * two different nestings depending on the response.
 *
 * `meetingStatus` matters more here than a normalizer usually would: the site
 * is a static build on a cron, and rendering a canceled meeting as scheduled is
 * exactly the kind of quiet falsehood the freshness caveat exists to prevent.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeLocation,
  normalizeMeeting,
  normalizeMeetingCommittees,
  normalizeMeetingStatus,
  normalizeRelatedBillIds,
  normalizeWitnesses,
} from '../scripts/fetch-hearings.mjs';

test('meeting status keeps the four known spellings and defaults to Scheduled', () => {
  assert.equal(normalizeMeetingStatus('Scheduled'), 'Scheduled');
  assert.equal(normalizeMeetingStatus('canceled'), 'Canceled');
  assert.equal(normalizeMeetingStatus('POSTPONED'), 'Postponed');
  assert.equal(normalizeMeetingStatus('Rescheduled'), 'Rescheduled');
  assert.equal(normalizeMeetingStatus(''), 'Scheduled');
  assert.equal(normalizeMeetingStatus(undefined), 'Scheduled');
});

test('an unrecognized status is kept rather than flattened into Scheduled', () => {
  // Reporting an unknown status as "Scheduled" would assert a meeting is
  // happening on no evidence at all.
  assert.equal(normalizeMeetingStatus('Recessed'), 'Recessed');
});

test('committee system codes are lowercased so they match the committee index', () => {
  assert.deepEqual(
    normalizeMeetingCommittees([
      { systemCode: 'HSAG00', name: 'Committee on Agriculture' },
      { systemCode: 'hsag15', name: 'Livestock and Foreign Agriculture Subcommittee' },
    ]),
    [
      { systemCode: 'hsag00', name: 'Committee on Agriculture' },
      { systemCode: 'hsag15', name: 'Livestock and Foreign Agriculture Subcommittee' },
    ],
  );
});

test('a committee repeated on a meeting is listed once, and a codeless one is dropped', () => {
  assert.deepEqual(
    normalizeMeetingCommittees([
      { systemCode: 'ssfr00', name: 'Foreign Relations Committee' },
      { systemCode: 'ssfr00', name: 'Foreign Relations Committee' },
      { name: 'Some Panel' },
    ]),
    [{ systemCode: 'ssfr00', name: 'Foreign Relations Committee' }],
  );
  assert.deepEqual(normalizeMeetingCommittees(), []);
});

test('related bills are read from both nestings the API uses', () => {
  const nested = { bills: { bill: [{ congress: 119, type: 'HR', number: 1 }] } };
  const flat = { bills: [{ congress: 119, type: 'S', number: 42 }] };

  assert.deepEqual(normalizeRelatedBillIds(nested), ['hr1']);
  assert.deepEqual(normalizeRelatedBillIds(flat), ['s42']);
});

test('a related bill missing its number is dropped rather than linked to a 404', () => {
  assert.deepEqual(normalizeRelatedBillIds({ bills: { bill: [{ type: 'HR' }, { number: 5 }] } }), []);
  assert.deepEqual(normalizeRelatedBillIds(undefined), []);
  assert.deepEqual(normalizeRelatedBillIds({}), []);
});

test('the same bill listed twice on a meeting appears once', () => {
  const items = { bills: { bill: [{ type: 'HR', number: 1 }, { type: 'hr', number: 1 }] } };
  assert.deepEqual(normalizeRelatedBillIds(items), ['hr1']);
});

test('a location with nothing in it is null, not an object of empty strings', () => {
  assert.equal(normalizeLocation(undefined), null);
  assert.equal(normalizeLocation({}), null);
  assert.equal(normalizeLocation({ address: {} }), null);
  assert.deepEqual(normalizeLocation({ room: '2141', building: 'Rayburn House Office Building' }), {
    room: '2141',
    building: 'Rayburn House Office Building',
    address: '',
  });
});

test('witnesses without a name are dropped', () => {
  assert.deepEqual(
    normalizeWitnesses([
      { name: 'Jerome Powell', position: 'Chair', organization: 'Federal Reserve' },
      { position: 'Analyst' },
    ]),
    [{ name: 'Jerome Powell', position: 'Chair', organization: 'Federal Reserve' }],
  );
  assert.deepEqual(normalizeWitnesses(), []);
});

test('a meeting normalizes into a summary and a detail record', () => {
  const listItem = {
    chamber: 'House',
    congress: 119,
    eventId: '117538',
    url: 'https://api.congress.gov/v3/committee-meeting/119/house/117538?format=json',
  };
  const detail = {
    ...listItem,
    type: 'Hearing',
    title: 'Monetary Policy and the State of the Economy',
    meetingStatus: 'Scheduled',
    date: '2025-07-09T14:00:00Z',
    committees: [{ systemCode: 'HSBA00', name: 'Financial Services Committee' }],
    location: { room: '2128', building: 'Rayburn House Office Building' },
    relatedItems: { bills: { bill: [{ congress: 119, type: 'HR', number: 1 }] } },
    witnesses: [{ name: 'Jerome Powell', position: 'Chair', organization: 'Federal Reserve' }],
    videos: [{ name: 'Full hearing', url: 'https://example.gov/video' }],
    meetingDocuments: [{ name: 'Hearing notice', url: 'https://example.gov/notice.pdf', format: 'PDF' }],
  };

  const { summary, full } = normalizeMeeting(listItem, detail);

  assert.equal(summary.eventId, '117538');
  assert.equal(summary.chamber, 'House');
  assert.equal(summary.type, 'Hearing');
  assert.equal(summary.meetingStatus, 'Scheduled');
  assert.equal(summary.date, '2025-07-09T14:00:00Z');
  assert.deepEqual(summary.committees, [{ systemCode: 'hsba00', name: 'Financial Services Committee' }]);
  assert.deepEqual(summary.relatedBillIds, ['hr1']);
  // The heavy fields stay out of the index so it does not balloon.
  assert.equal(summary.witnesses, undefined);
  assert.equal(full.witnesses.length, 1);
  assert.equal(full.videos.length, 1);
  assert.equal(full.meetingDocuments[0].format, 'PDF');
});

test('a meeting whose detail call failed still normalizes from the list item', () => {
  const { summary, full } = normalizeMeeting(
    { chamber: 'Senate', congress: 119, eventId: '56102', url: 'https://api.congress.gov/x' },
    null,
  );

  assert.equal(summary.eventId, '56102');
  assert.equal(summary.chamber, 'Senate');
  // No date is better than a guessed one; the page can say the time is unlisted.
  assert.equal(summary.date, '');
  assert.deepEqual(summary.committees, []);
  assert.deepEqual(summary.relatedBillIds, []);
  assert.equal(summary.location, null);
  assert.deepEqual(full.witnesses, []);
});

test('a numeric eventId is stored as the string the filename and route use', () => {
  const { summary } = normalizeMeeting({ eventId: 117538, chamber: 'House' }, null);
  assert.equal(summary.eventId, '117538');
});
