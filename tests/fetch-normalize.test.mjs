import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeBill, normalizeBillCommittees } from '../scripts/fetch-bills.mjs';
import { billsWindowStart, extractOfficialWebsite, normalizeCommitteeBills } from '../scripts/fetch-committees.mjs';

test('a resolution is normalized with its own congress.gov URLs', () => {
  const { summary, detail } = normalizeBill(
    {
      type: 'HRES',
      number: '34',
      title: 'Providing for consideration of the bill',
      latestAction: { actionDate: '2026-08-14', text: 'Agreed to in House.' },
      updateDate: '2026-08-15',
    },
    { introducedDate: '2025-01-09', policyArea: { name: 'Congress' } },
    [],
    {}
  );

  assert.equal(summary.billId, 'hres34');
  assert.equal(summary.type, 'H.Res.');
  assert.equal(summary.number, 34);
  assert.equal(summary.originChamber, 'House');
  assert.equal(summary.url, 'https://www.congress.gov/bill/119th-congress/house-resolution/34');
  assert.equal(detail.textUrl, 'https://www.congress.gov/bill/119th-congress/house-resolution/34/text');
  assert.equal(summary.latestActionDate, '2026-08-14');
  assert.equal(summary.updateDate, '2026-08-15');
});

test('committee referrals keep the systemCode that identifies the chamber', () => {
  const committees = normalizeBillCommittees([
    {
      systemCode: 'ssju00',
      name: 'Judiciary Committee',
      chamber: 'Senate',
      type: 'Standing',
      activities: [{ name: 'Referred to', date: '2025-01-09T17:03:00Z' }],
    },
    // Same committee reported twice by the API.
    { systemCode: 'ssju00', name: 'Judiciary Committee', chamber: 'Senate' },
  ]);

  assert.equal(committees.length, 1);
  assert.deepEqual(committees[0], {
    name: 'Judiciary Committee',
    systemCode: 'ssju00',
    chamber: 'Senate',
    type: 'Standing',
    activities: [{ name: 'Referred to', date: '2025-01-09T17:03:00Z' }],
  });
});

test('committee referrals tolerate a missing or nested committee payload', () => {
  assert.deepEqual(normalizeBillCommittees(undefined), []);
  assert.deepEqual(normalizeBillCommittees({ nope: true }), []);

  const nested = normalizeBillCommittees([{ committee: { name: 'Rules Committee', systemCode: 'hsru00' } }]);
  assert.equal(nested[0].systemCode, 'hsru00');
  assert.equal(nested[0].activities, undefined);
});

test('committee legislation is filtered to the current congress and sorted by newest action', () => {
  const pages = [
    {
      'committee-bills': {
        bills: [
          { congress: 119, type: 'HR', number: '900', relationshipType: 'Referred to', actionDate: '2025-02-03T16:38:41Z' },
          { congress: 118, type: 'HR', number: '10', relationshipType: 'Referred to', actionDate: '2024-05-01T16:38:41Z' },
          { congress: 119, type: 'HRES', number: '55', relationshipType: 'Reported by', actionDate: '2026-07-06T16:38:41Z' },
        ],
      },
    },
    {
      'committee-bills': {
        // Repeated across pages by the API.
        bills: [{ congress: 119, type: 'HR', number: '900', relationshipType: 'Referred to', actionDate: '2025-02-03T16:38:41Z' }],
      },
    },
  ];

  const bills = normalizeCommitteeBills(pages, 119);

  assert.deepEqual(bills.map(b => b.billId), ['hres55', 'hr900']);
  assert.deepEqual(bills[0], {
    billId: 'hres55',
    congress: 119,
    type: 'H.Res.',
    number: 55,
    relationshipType: 'Reported by',
    actionDate: '2026-07-06',
    url: 'https://www.congress.gov/bill/119th-congress/house-resolution/55',
  });
});

test('committee legislation reads the alternate response shapes', () => {
  const flat = normalizeCommitteeBills([{ bills: [{ congress: 119, type: 'S', number: '5', actionDate: '2026-01-02T00:00:00Z' }] }], 119);
  assert.deepEqual(flat.map(b => b.billId), ['s5']);

  const camel = normalizeCommitteeBills([{ committeeBills: { bills: [{ congress: 119, type: 'S', number: '6' }] } }], 119);
  assert.deepEqual(camel.map(b => b.billId), ['s6']);

  assert.deepEqual(normalizeCommitteeBills([null, {}, { 'committee-bills': {} }], 119), []);
});

test('the committee bills window stays recent but never predates the congress', () => {
  // A year into the congress the window rolls; earlier than that it is pinned.
  assert.equal(billsWindowStart(Date.parse('2026-08-22T00:00:00Z')), '2025-08-22T00:00:00Z');
  assert.equal(billsWindowStart(Date.parse('2025-06-01T00:00:00Z')), '2025-01-03T00:00:00Z');
});

test('only a real website is treated as the committee website', () => {
  assert.equal(extractOfficialWebsite({ url: 'https://waysandmeans.house.gov/' }), 'https://waysandmeans.house.gov/');
  assert.equal(extractOfficialWebsite({ url: 'https://api.congress.gov/v3/committee/house/hswm00?format=json' }), '');
  assert.equal(extractOfficialWebsite(null), '');
});
