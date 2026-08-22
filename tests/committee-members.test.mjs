import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommitteeMemberIndex,
  getCommitteeMembers,
} from '../shared/committee-members.mjs';

test('buildCommitteeMemberIndex maps committee names to member summaries', () => {
  const index = buildCommitteeMemberIndex(
    {
      members: {
        A001: { name: 'Alice Alpha', committees: ['Ways and Means Committee', 'Trade Subcommittee'] },
        B002: { name: 'Bob Beta', committees: ['Ways and Means Committee'] },
      },
    },
    [
      { bioguideId: 'A001', name: 'Alice Alpha', party: 'Democratic', chamber: 'House', state: 'CA', imageUrl: '/a.jpg' },
      { bioguideId: 'B002', name: 'Bob Beta', party: 'Republican', chamber: 'House', state: 'TX', imageUrl: '/b.jpg' },
    ],
  );

  const ways = getCommitteeMembers(index, 'Ways and Means Committee');
  assert.equal(ways.length, 2);
  assert.equal(ways[0].bioguideId, 'A001');
  assert.equal(ways[1].party, 'Republican');

  const trade = getCommitteeMembers(index, 'Trade Subcommittee');
  assert.equal(trade.length, 1);
});
