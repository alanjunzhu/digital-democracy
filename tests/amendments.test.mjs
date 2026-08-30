/**
 * Guards the amendment fetch normalizers and the disposition classifier.
 *
 * Two things here are load-bearing beyond the usual field mapping.
 *
 * The first is the roll-call join. The amendment endpoint reports a vote as
 * chamber + session + roll number, never as an id, so the stored `voteId` is
 * composed rather than looked up. If that composition drifts from the one
 * fetch-votes.mjs uses, every "voted on" link on an amendment page points at a
 * page that does not exist — and it fails silently, since a wrong id looks
 * exactly like an amendment that was never voted on.
 *
 * The second is the disposition wording. Amendment actions are phrased as
 * freely as roll-call results, which is what left a third of all roll calls
 * rendering backwards before shared/vote-outcome.mjs existed. "Not agreed to"
 * contains "agreed to", so ordering the tests wrong reverses the verdict on
 * every failed amendment.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeAmendedBill,
  normalizeAmendment,
  normalizeRecordedVotes,
} from '../scripts/fetch-amendments.mjs';
import {
  AMENDMENT_DISPOSITION_DOT,
  AMENDMENT_DISPOSITIONS,
  getAmendmentDisposition,
  getAmendmentVerdict,
} from '../shared/amendment-outcome.mjs';

test('a recorded vote is composed into the id fetch-votes.mjs stores', () => {
  const votes = normalizeRecordedVotes([
    {
      actionDate: '2025-06-11',
      text: 'Amendment SA 2137 agreed to in Senate by Yea-Nay Vote. 51-49.',
      recordedVotes: [
        { chamber: 'Senate', rollNumber: 217, sessionNumber: 2, date: '2025-06-11T22:14:00Z' },
      ],
    },
    {
      actionDate: '2025-05-02',
      text: 'On agreeing to the Roy amendment; Failed by recorded vote: 198 - 229.',
      recordedVotes: [
        { chamber: 'House', rollNumber: 283, sessionNumber: 2, date: '2025-05-02T16:02:00Z' },
      ],
    },
  ]);

  assert.deepEqual(
    votes.map((v) => v.voteId),
    ['s2-rc217', 'h2-rc283'],
  );
});

test('the same roll call named by several actions is stored once', () => {
  // A Senate amendment's vote shows up on both the disposition action and the
  // "Considered by Senate" action that precedes it.
  const recordedVotes = [{ chamber: 'Senate', rollNumber: 217, sessionNumber: 2, date: '2025-06-11T22:14:00Z' }];
  const votes = normalizeRecordedVotes([
    { actionDate: '2025-06-11', text: 'Amendment SA 2137 agreed to in Senate.', recordedVotes },
    { actionDate: '2025-06-11', text: 'Considered by Senate.', recordedVotes },
  ]);

  assert.equal(votes.length, 1);
});

test('a vote missing its chamber or roll number stores a null id rather than a broken one', () => {
  const [vote] = normalizeRecordedVotes([
    { actionDate: '2025-03-01', text: 'Considered.', recordedVotes: [{ chamber: '', rollNumber: 5 }] },
  ]);

  // Kept, so the page can still say a vote was taken — but not linked.
  assert.equal(vote.voteId, null);
  assert.equal(vote.rollNumber, 5);
});

test('actions without votes, and no actions at all, yield an empty list', () => {
  assert.deepEqual(normalizeRecordedVotes(), []);
  assert.deepEqual(normalizeRecordedVotes([{ actionDate: '2025-04-01', text: 'Amendment submitted.' }]), []);
  assert.deepEqual(normalizeRecordedVotes([null, undefined]), []);
});

test('the amended bill is stored as our own bill id so the link resolves', () => {
  assert.deepEqual(normalizeAmendedBill({ congress: 119, type: 'HR', number: 1, title: 'One Big Bill' }), {
    amendedBillId: 'hr1',
    amendedBillTitle: 'One Big Bill',
  });
});

test('an amendment with no bill attached is not given one', () => {
  for (const input of [undefined, null, {}, { type: 'HR' }, { number: 1 }]) {
    assert.deepEqual(normalizeAmendedBill(input), { amendedBillId: null, amendedBillTitle: '' });
  }
});

test('a Senate amendment normalizes from its detail record', () => {
  const listItem = {
    congress: 119,
    number: 2137,
    type: 'SAMDT',
    latestAction: {
      actionDate: '2025-06-11',
      text: 'Amendment SA 2137 agreed to in Senate by Yea-Nay Vote. 51-49.',
    },
  };
  const detail = {
    ...listItem,
    purpose: 'To strike the provision relating to State enforcement.',
    submittedDate: '2025-06-09T04:00:00Z',
    amendedBill: { congress: 119, type: 'HR', number: 1, title: 'One Big Bill' },
    cosponsors: { count: 3 },
    sponsors: [{ bioguideId: 'C001098', fullName: 'Sen. Cruz, Ted [R-TX]', party: 'R', state: 'TX' }],
  };

  const { summary } = normalizeAmendment(listItem, detail, []);

  assert.equal(summary.amendmentId, 'samdt2137');
  assert.equal(summary.type, 'S.Amdt.');
  assert.equal(summary.chamber, 'Senate');
  assert.equal(summary.amendedBillId, 'hr1');
  assert.equal(summary.cosponsorCount, 3);
  assert.equal(summary.sponsor.bioguideId, 'C001098');
  assert.equal(summary.url, 'https://www.congress.gov/amendment/119th-congress/senate-amendment/2137');
});

test('an amendment whose detail call failed still normalizes from the list item', () => {
  // fetchAmendmentAllData swallows a failed detail request and passes null, so
  // one bad response must not drop the amendment from the index entirely.
  const { summary } = normalizeAmendment(
    {
      congress: 119,
      number: 312,
      type: 'HAMDT',
      description: 'An amendment numbered 12 printed in Part B of House Report 119-40.',
      latestAction: {
        actionDate: '2025-05-02',
        text: 'On agreeing to the Roy amendment; Failed by recorded vote: 198 - 229.',
      },
    },
    null,
    [],
  );

  assert.equal(summary.amendmentId, 'hamdt312');
  assert.equal(summary.type, 'H.Amdt.');
  assert.equal(summary.chamber, 'House');
  assert.equal(summary.sponsor, null);
  assert.equal(summary.amendedBillId, null);
  assert.equal(summary.url, 'https://www.congress.gov/amendment/119th-congress/house-amendment/312');
});

test('a failed amendment is not read as agreed because "not agreed to" contains "agreed to"', () => {
  for (const action of [
    'Amendment SA 2137 not agreed to in Senate by Yea-Nay Vote. 49-51.',
    'On agreeing to the Roy amendment; Failed by recorded vote: 198 - 229.',
    'Amendment SA 45 ruled out of order by the chair.',
    'Motion to table amendment SA 88 agreed to in Senate.',
  ]) {
    assert.equal(getAmendmentDisposition(action), 'rejected', action);
    assert.equal(getAmendmentVerdict(action), 'Rejected', action);
  }
});

test('the affirmative wordings are read as agreed', () => {
  for (const action of [
    'Amendment SA 2137 agreed to in Senate by Yea-Nay Vote. 51-49.',
    'On agreeing to the Foxx amendment; Agreed to by recorded vote: 220 - 207.',
    'Amendment adopted in the House.',
    'Amendment incorporated into the bill as an original text.',
  ]) {
    assert.equal(getAmendmentDisposition(action), 'agreed', action);
    assert.equal(getAmendmentVerdict(action), 'Agreed to', action);
  }
});

test('a withdrawn amendment reads as withdrawn, not pending', () => {
  const action = 'Proposed amendment SA 501 withdrawn in Senate by Unanimous Consent.';
  assert.equal(getAmendmentDisposition(action), 'withdrawn');
  assert.equal(getAmendmentVerdict(action), 'Withdrawn');
});

test('an amendment still in play, or with no action recorded, is pending', () => {
  for (const action of ['Amendment SA 9 proposed by Senator Thune.', 'Amendment submitted in the Senate.', '', null, undefined]) {
    assert.equal(getAmendmentDisposition(action), 'pending');
    assert.equal(getAmendmentVerdict(action), 'Pending');
  }
});

test('every disposition has a dot colour and none of them is green', () => {
  for (const disposition of AMENDMENT_DISPOSITIONS) {
    const dot = AMENDMENT_DISPOSITION_DOT[disposition];
    assert.ok(dot, `${disposition} has no dot colour`);
    assert.doesNotMatch(dot, /green/, `${disposition} uses green, which the design system reserves against`);
  }
  assert.equal(
    Object.keys(AMENDMENT_DISPOSITION_DOT).length,
    AMENDMENT_DISPOSITIONS.length,
    'dot map and disposition list have drifted apart',
  );
});
