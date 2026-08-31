/**
 * Guards the bills-index referral column.
 *
 * The defect this replaced: the latest-action line printed the same sentence
 * on twenty of twenty-five rows — "Referred to the House Committee on …" —
 * truncated mid-word, saying what the stage badge beside it already said. The
 * one useful fact in that sentence is which committee, and it sat at the end
 * where the truncation ate it.
 *
 * So the parse has to reach the committee name for every wording Congress.gov
 * actually uses, and fall back to the intact string for every wording it does
 * not — a bad parse here silently replaces real information with a wrong
 * committee name, which is worse than the boilerplate it replaced.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { referral } from '../shared/referral.mjs';
import { shortSponsorName } from '../shared/sponsor-name.mjs';

test('a House referral yields just the committee name', () => {
  assert.deepEqual(referral('Referred to the House Committee on Energy and Commerce.'), {
    verb: 'Referred to',
    object: 'Energy and Commerce',
    extra: '',
  });
});

test('the Senate reading prefix is the same fact and parses the same way', () => {
  // 71 of the bills currently indexed use this form. Without it they fall
  // through and print the boilerplate this helper exists to strip.
  assert.deepEqual(referral('Read twice and referred to the Committee on the Judiciary.'), {
    verb: 'Referred to',
    object: 'the Judiciary',
    extra: '',
  });
});

test('a multi-committee referral counts the rest instead of listing them', () => {
  const parsed = referral(
    'Referred to the Committee on Energy and Commerce, and in addition to the Committees on Science, Space, and Technology, and Ways and Means.',
  );
  assert.equal(parsed.verb, 'Referred to');
  assert.equal(parsed.object, 'Energy and Commerce');
  // Committee names contain "and", so the count comes from commas, never from
  // splitting on the conjunction.
  assert.match(parsed.extra, /^\+ \d+ more committees$/);
});

test('one additional committee is singular', () => {
  const parsed = referral(
    'Referred to the Committee on Armed Services, and in addition to the Committee on Foreign Affairs.',
  );
  assert.equal(parsed.extra, '+ 1 more committee');
});

test('the Union Calendar keeps its number as the footnote', () => {
  assert.deepEqual(referral('Placed on the Union Calendar, Calendar No. 660.'), {
    verb: 'Placed on',
    object: 'Union Calendar',
    extra: 'No. 660',
  });
});

test('the Senate calendar keeps the order it was placed under', () => {
  assert.deepEqual(
    referral('Placed on Senate Legislative Calendar under General Orders. Calendar No. 12.'),
    { verb: 'Placed on', object: 'Senate Calendar', extra: 'General Orders' },
  );
});

test('enactment outranks everything else', () => {
  assert.deepEqual(referral('Became Public Law No: 119-42.'), {
    verb: 'Enacted',
    object: 'Public Law 119-42',
    extra: '',
  });
});

test('an unrecognized action keeps its text rather than being dropped', () => {
  // Degrading to what the page showed before is acceptable; degrading to an
  // empty column, or to a wrong committee, is not.
  assert.deepEqual(referral('Held at the desk.'), {
    verb: 'Latest action',
    object: 'Held at the desk',
    extra: '',
  });
  assert.deepEqual(referral('Ordered to be Reported by Voice Vote.'), {
    verb: 'Latest action',
    object: 'Ordered to be Reported by Voice Vote',
    extra: '',
  });
});

test('an empty action produces an empty object, not the word undefined', () => {
  for (const input of ['', null, undefined, '   ']) {
    assert.deepEqual(referral(input), { verb: 'Latest action', object: '', extra: '' });
  }
});

test('a sponsor is shortened to title and family name', () => {
  assert.equal(shortSponsorName('Sen. Collins, Susan M. [R-ME]'), 'Sen. Collins');
  assert.equal(shortSponsorName('Rep. Roy, Chip [R-TX-21]'), 'Rep. Roy');
});

test('a sponsor name with no comma still loses its bracketed suffix', () => {
  assert.equal(shortSponsorName('Sen. Collins [R-ME]'), 'Sen. Collins');
  assert.equal(shortSponsorName('Tom Barrett'), 'Tom Barrett');
  assert.equal(shortSponsorName(''), '');
  assert.equal(shortSponsorName(undefined), '');
});
