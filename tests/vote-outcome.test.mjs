/**
 * Guards the roll-call verdict shown on the home page, the votes index, and
 * both detail pages.
 *
 * The regression this covers: the verdict used to be decided by comparing the
 * result against a fixed set (`'Passed'`, `'Agreed to'`). The House Clerk does
 * write bare strings like that, but the Senate spells the motion out, so every
 * "Nomination Confirmed (51-47)" and "Cloture Motion Agreed to (50-45)" fell
 * through to the else-branch and rendered as "Rejected" — about a third of all
 * roll calls, each one asserting the opposite of what happened.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getVoteOutcome, getVoteVerdict } from '../shared/vote-outcome.mjs';

test('the verbose Senate result forms are read as carried, not rejected', () => {
  for (const result of [
    'Resolution Agreed to (50-47)',
    'Concurrent Resolution Agreed to (50-48)',
    'Cloture Motion Agreed to (50-45)',
    'Cloture on the Motion to Proceed Agreed to (99-0, 3/5 majority required)',
    'Motion to Proceed Agreed to (84-12)',
    'Motion to Discharge Agreed to (50-47)',
    'Motion to Table Agreed to (53-47)',
    'Amendment Agreed to (98-0)',
    'Nomination Confirmed (51-47)',
    'Joint Resolution Passed (52-47)',
    'Bill Passed (89-10)',
    'Point of Order Sustained (51-46)',
    'Point of Order Well Taken (51-47)',
  ]) {
    assert.equal(getVoteOutcome(result), 'agreed', result);
    assert.equal(getVoteVerdict(result), 'Agreed', result);
  }
});

test('defeats are read as rejected across every phrasing the Senate uses', () => {
  for (const result of [
    'Motion to Discharge Rejected (49-50)',
    'Motion to Proceed Rejected (47-52)',
    'Amendment Rejected (48-51)',
    'Motion Rejected (48-50, 3/5 majority required)',
    'Cloture Motion Rejected (53-47, 3/5 majority required)',
    'Cloture on the Motion to Proceed Rejected (51-45, 3/5 majority required)',
    'Motion to Table Failed (45-52)',
    'Joint Resolution Defeated (49-49)',
    'Motion to Adjourn Rejected (46-51)',
  ]) {
    assert.equal(getVoteOutcome(result), 'rejected', result);
    assert.equal(getVoteVerdict(result), 'Rejected', result);
  }
});

test('the terse House forms still classify', () => {
  assert.equal(getVoteOutcome('Passed'), 'agreed');
  assert.equal(getVoteOutcome('Failed'), 'rejected');
  assert.equal(getVoteOutcome('Agreed to'), 'agreed');
});

test('negative wording wins over the positive word nested inside it', () => {
  // "Not Sustained" contains "Sustained"; "Table Failed" contains "Table".
  assert.equal(getVoteOutcome('Point of Order Not Sustained (47-52)'), 'rejected');
  assert.equal(getVoteOutcome('Motion to Table Failed (46-52)'), 'rejected');
});

test('an unreadable result is reported as-is rather than asserted to be a defeat', () => {
  // One real row carries a member name where the result should be.
  assert.equal(getVoteOutcome('Johnson (LA)'), 'unknown');
  assert.equal(getVoteVerdict('Johnson (LA)'), 'Johnson (LA)');
  assert.equal(getVoteOutcome(''), 'unknown');
  assert.equal(getVoteOutcome(null), 'unknown');
  assert.equal(getVoteVerdict(undefined), '—');
});

test('a carried vote is never classified from a tally alone', () => {
  // 3/5-majority motions can win the raw count and still fail, so the wording
  // is authoritative — not whether yea beat nay.
  assert.equal(getVoteOutcome('Motion Rejected (53-46, 3/5 majority required)'), 'rejected');
  assert.equal(getVoteOutcome('Cloture Motion Rejected (49-41, 3/5 majority required)'), 'rejected');
});
