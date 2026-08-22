import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compareMembers,
  fetchLegislatorFile,
  isEmptyValue,
  normalizeMember,
  normalizeSponsoredLegislation,
  preserveExistingValues,
  splitMemberName,
} from '../scripts/fetch-members.mjs';
import { bioFields, fillMemberRecord } from '../scripts/backfill-member-bio.mjs';

test('member names are parsed from the "Last, First" form Congress.gov returns', () => {
  assert.deepEqual(splitMemberName('Tuberville, Tommy'), { firstName: 'Tommy', lastName: 'Tuberville' });
  assert.deepEqual(splitMemberName('Van Drew, Jefferson'), { firstName: 'Jefferson', lastName: 'Van Drew' });
  assert.deepEqual(splitMemberName('Ocasio-Cortez, Alexandria'), { firstName: 'Alexandria', lastName: 'Ocasio-Cortez' });
  assert.deepEqual(splitMemberName('Vance, J. D.'), { firstName: 'J.', lastName: 'Vance' });
  // A suffix follows the given names.
  assert.deepEqual(splitMemberName('Smith, John, Jr.'), { firstName: 'John', lastName: 'Smith' });
  assert.deepEqual(splitMemberName('Andy Biggs'), { firstName: 'Andy', lastName: 'Biggs' });
  assert.deepEqual(splitMemberName(''), { firstName: '', lastName: '' });
  assert.deepEqual(splitMemberName(undefined), { firstName: '', lastName: '' });
});

test('a member keeps a usable name even when the supplementary source is missing', () => {
  const { summary } = normalizeMember(
    { bioguideId: 'T000278', name: 'Tuberville, Tommy', state: 'Alabama', partyName: 'Republican', terms: { item: [{ chamber: 'Senate' }] } },
    null,
    null,
    null
  );

  assert.equal(summary.firstName, 'Tommy');
  assert.equal(summary.lastName, 'Tuberville');
  assert.equal(summary.chamber, 'Senate');
});

test('emptiness covers the shapes member records use', () => {
  assert.equal(isEmptyValue(''), true);
  assert.equal(isEmptyValue(undefined), true);
  assert.equal(isEmptyValue(null), true);
  assert.equal(isEmptyValue([]), true);
  assert.equal(isEmptyValue({}), true);
  assert.equal(isEmptyValue({ twitter: undefined, facebook: '' }), true);
  assert.equal(isEmptyValue({ twitter: 'RepX' }), false);
  assert.equal(isEmptyValue('Tommy'), false);
  assert.equal(isEmptyValue(0), false);
  assert.equal(isEmptyValue(false), false);
});

test('a fetch that lost a source keeps the values it could not refresh', () => {
  const previous = {
    bioguideId: 'B001302',
    firstName: 'Andy',
    lastName: 'Biggs',
    website: 'https://biggs.house.gov',
    phone: '(202) 225-2635',
    socialMedia: { twitter: 'RepAndyBiggsAZ', facebook: 'RepAndyBiggs' },
    terms: [{ chamber: 'House', startDate: '2017' }],
  };
  const next = {
    bioguideId: 'B001302',
    firstName: '',
    lastName: '',
    website: '',
    phone: '(202) 225-9999',
    socialMedia: { twitter: '', facebook: undefined },
    terms: [],
  };

  const merged = preserveExistingValues(next, previous);

  assert.equal(merged.firstName, 'Andy');
  assert.equal(merged.website, 'https://biggs.house.gov');
  // A fresh value still wins.
  assert.equal(merged.phone, '(202) 225-9999');
  assert.deepEqual(merged.socialMedia, { twitter: 'RepAndyBiggsAZ', facebook: 'RepAndyBiggs' });
  assert.deepEqual(merged.terms, [{ chamber: 'House', startDate: '2017' }]);
});

test('preserving values never adds keys the new record does not have', () => {
  const merged = preserveExistingValues(
    { bioguideId: 'B001302', firstName: '' },
    { bioguideId: 'B001302', firstName: 'Andy', terms: [{ chamber: 'House' }], committees: ['Judiciary Committee'] }
  );

  assert.deepEqual(Object.keys(merged), ['bioguideId', 'firstName']);
  assert.equal(merged.firstName, 'Andy');
  assert.equal(preserveExistingValues({ a: '' }, null).a, '');
});

test('members sort Senate first, then by state and surname', () => {
  const members = [
    { chamber: 'House', state: 'Alabama', lastName: 'Aderholt' },
    { chamber: 'Senate', state: 'Alaska', lastName: 'Sullivan' },
    { chamber: 'Senate', state: 'Alabama', lastName: 'Tuberville' },
    { chamber: 'Senate', state: 'Alabama', lastName: 'Britt' },
  ].sort(compareMembers);

  assert.deepEqual(members.map(m => m.lastName), ['Britt', 'Tuberville', 'Sullivan', 'Aderholt']);
});

test('legislator files fall back to the next host when one is unreachable', async () => {
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    requested.push(String(url));
    // theunitedstates.io stopped resolving; github.io serves the same files.
    if (String(url).includes('unitedstates.github.io')) {
      return new Response('[]', { status: 404 });
    }
    return Response.json([{ id: { bioguide: 'B001302' }, name: { first: 'Andy' } }]);
  };

  try {
    const data = await fetchLegislatorFile('legislators-current.json', 'legislator');
    assert.equal(data.length, 1);
    assert.equal(requested.length, 2);
    assert.match(requested[0], /unitedstates\.github\.io/);
    assert.match(requested[1], /theunitedstates\.io/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('legislator files return nothing when no host answers, so values are kept', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });

  try {
    assert.equal(await fetchLegislatorFile('legislators-current.json', 'legislator'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bio fields read a social record in either shape', () => {
  const nested = bioFields({ name: 'Biggs, Andy' }, null, {
    id: { bioguide: 'B001302' },
    social: { twitter: 'RepAndyBiggsAZ', youtube_id: 'UCq' },
  });
  assert.deepEqual(nested.socialMedia, { twitter: 'RepAndyBiggsAZ', facebook: undefined, youtube: 'UCq' });

  const bare = bioFields({ name: 'Biggs, Andy' }, null, { twitter: 'RepAndyBiggsAZ' });
  assert.equal(bare.socialMedia.twitter, 'RepAndyBiggsAZ');

  const none = bioFields({ name: 'Biggs, Andy' }, null, undefined);
  assert.equal(none.socialMedia, undefined);
  assert.equal(none.firstName, 'Andy');
});

test('bio fields come from the member\'s most recent term', () => {
  const fields = bioFields({ name: 'Biggs, Andy' }, {
    name: { first: 'Andy', last: 'Biggs' },
    bio: { birthday: '1958-11-07', gender: 'M' },
    terms: [
      { url: 'https://old.house.gov', phone: '(202) 000-0000' },
      { url: 'https://biggs.house.gov', phone: '(202) 225-2635', address: '464 Cannon' },
    ],
  }, null);

  assert.equal(fields.website, 'https://biggs.house.gov');
  assert.equal(fields.phone, '(202) 225-2635');
  assert.equal(fields.officeAddress, '464 Cannon');
  assert.equal(fields.birthDate, '1958-11-07');
});

test('the backfill fills blanks without reshaping the record', () => {
  const sources = {
    legislators: { B001302: { name: { first: 'Andy', last: 'Biggs' }, terms: [{ url: 'https://biggs.house.gov' }] } },
    social: { B001302: { social: { twitter: 'RepAndyBiggsAZ' } } },
  };

  const summary = fillMemberRecord(
    { bioguideId: 'B001302', name: 'Biggs, Andy', firstName: '', lastName: '', website: '', phone: '(202) 225-2635' },
    sources,
    'summary'
  );
  assert.equal(summary.firstName, 'Andy');
  assert.equal(summary.website, 'https://biggs.house.gov');
  assert.equal(summary.phone, '(202) 225-2635', 'an existing value is kept');
  assert.ok(!('socialMedia' in summary), 'summaries do not gain detail-only fields');
  assert.ok(!('birthDate' in summary));

  const detail = fillMemberRecord(
    { bioguideId: 'B001302', name: 'Biggs, Andy', firstName: '', website: '', terms: [] },
    sources,
    'detail'
  );
  assert.equal(detail.firstName, 'Andy');
  assert.deepEqual(detail.socialMedia, { twitter: 'RepAndyBiggsAZ', facebook: undefined, youtube: undefined });
});

test('a member absent from the supplementary source is left alone', () => {
  const record = { bioguideId: 'R000595', name: 'Rubio, Marco', firstName: '', lastName: '', website: '' };
  const filled = fillMemberRecord(record, { legislators: {}, social: {} }, 'summary');

  assert.equal(filled.firstName, 'Marco', 'still parsed from the Congress.gov name');
  assert.equal(filled.lastName, 'Rubio');
  assert.equal(filled.website, '');
});

test('sponsored legislation is stored as bill summaries for this congress', () => {
  const bills = normalizeSponsoredLegislation([
    {
      congress: 119,
      type: 'HR',
      number: '21',
      title: 'A sponsored bill',
      introducedDate: '2025-01-03',
      latestAction: { actionDate: '2025-01-04', text: 'Referred to committee' },
    },
    { congress: 118, type: 'S', number: '9', title: 'Previous congress' },
    { congress: 119, type: 'HR', number: '21', title: 'Duplicate' },
  ]);

  assert.equal(bills.length, 1);
  assert.equal(bills[0].billId, 'hr21');
  assert.equal(bills[0].type, 'H.R.');
  assert.equal(bills[0].latestAction, 'Referred to committee');
  assert.equal(bills[0].url, 'https://www.congress.gov/bill/119th-congress/house-bill/21');

  const { detail } = normalizeMember(
    { bioguideId: 'B001302', name: 'Biggs, Andy', state: 'Arizona', partyName: 'Republican', terms: { item: [{ chamber: 'House' }] } },
    null,
    null,
    null,
    [{ congress: 119, type: 'HRES', number: '34', title: 'A resolution', introducedDate: '2025-01-09' }]
  );
  assert.equal(detail.sponsoredBills[0].billId, 'hres34');
});
