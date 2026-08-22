import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  committeeMembershipKeys,
  fetchUnitedstatesFile,
  mapCommitteeMemberships,
} from '../scripts/lib/unitedstates.mjs';

test('congress.gov systemCodes map onto unitedstates membership keys', () => {
  assert.deepEqual(committeeMembershipKeys('hswm00'), ['HSWM00', 'HSWM']);
  assert.deepEqual(committeeMembershipKeys('hswm04'), ['HSWM04']);
  assert.deepEqual(committeeMembershipKeys('ssju00'), ['SSJU00', 'SSJU']);
  assert.deepEqual(committeeMembershipKeys(''), []);
});

test('membership JSON is keyed by bioguide using our committee names', () => {
  const memberships = mapCommitteeMemberships(
    {
      HSWM: [{ bioguide: 'S001195', name: 'Jason Smith' }, { bioguide: 'N000015' }],
      HSWM04: [{ bioguide: 'S001195' }],
      SSJU: [{ bioguide: 'G000555' }],
      UNKNOWN: [{ bioguide: 'X000000' }],
    },
    [
      { systemCode: 'hswm00', name: 'Ways and Means Committee' },
      { systemCode: 'hswm04', name: 'Trade Subcommittee' },
      { systemCode: 'ssju00', name: 'Judiciary Committee' },
    ]
  );

  assert.deepEqual(memberships.S001195, ['Ways and Means Committee', 'Trade Subcommittee']);
  assert.deepEqual(memberships.N000015, ['Ways and Means Committee']);
  assert.deepEqual(memberships.G000555, ['Judiciary Committee']);
  assert.equal(memberships.X000000, undefined);
});

test('a missing membership file produces no assignments', () => {
  assert.deepEqual(mapCommitteeMemberships(null, [{ systemCode: 'hswm00', name: 'Ways and Means Committee' }]), {});
  assert.deepEqual(mapCommitteeMemberships([], [{ systemCode: 'hswm00', name: 'Ways and Means Committee' }]), {});
});

test('legislator files fall back to the next host when one is unreachable', async () => {
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    requested.push(String(url));
    if (String(url).includes('unitedstates.github.io')) {
      return new Response('[]', { status: 404 });
    }
    return Response.json({ HSWM: [{ bioguide: 'S001195' }] });
  };

  try {
    const data = await fetchUnitedstatesFile('committee-membership-current.json', 'committee membership');
    assert.equal(data.HSWM[0].bioguide, 'S001195');
    assert.match(requested[0], /unitedstates\.github\.io/);
    assert.match(requested[1], /theunitedstates\.io/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
