import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  averageAlignmentByParty,
  isPartyLineVote,
  normalizeVoteSide,
  partyBucket,
  partyMajoritySide,
  rankPartyAlignment,
  scoreMemberPartyAlignment,
  summarizePartyLineVotes,
} from '../shared/party-alignment.mjs';

test('party labels and vote casts normalize cleanly', () => {
  assert.equal(partyBucket('Democratic'), 'democratic');
  assert.equal(partyBucket('R'), 'republican');
  assert.equal(partyBucket('Independent'), 'independent');
  assert.equal(normalizeVoteSide('Aye'), 'yea');
  assert.equal(normalizeVoteSide('Not Voting'), null);
  assert.equal(partyMajoritySide({ yea: 10, nay: 2 }), 'yea');
  assert.equal(partyMajoritySide({ yea: 5, nay: 5 }), null);
});

test('a party-line vote needs opposing Democratic and Republican majorities', () => {
  assert.equal(isPartyLineVote({
    democratic: { yea: 200, nay: 10 },
    republican: { yea: 5, nay: 210 },
    independent: { yea: 0, nay: 0 },
  }), true);
  assert.equal(isPartyLineVote({
    democratic: { yea: 100, nay: 100 },
    republican: { yea: 5, nay: 210 },
    independent: { yea: 0, nay: 0 },
  }), false);
});

test('member alignment counts only comparable Yea/Nay votes', () => {
  const breakdowns = {
    'h1-rc1': {
      democratic: { yea: 180, nay: 20 },
      republican: { yea: 10, nay: 200 },
      independent: { yea: 0, nay: 0 },
    },
    'h1-rc2': {
      democratic: { yea: 20, nay: 180 },
      republican: { yea: 200, nay: 10 },
      independent: { yea: 0, nay: 0 },
    },
  };

  const alignment = scoreMemberPartyAlignment(
    [
      { voteId: 'h1-rc1', voteCast: 'Yea' },
      { voteId: 'h1-rc2', voteCast: 'Yea' },
      { voteId: 'h1-rc2', voteCast: 'Present' },
    ],
    breakdowns,
    'Democratic',
  );

  assert.equal(alignment.comparable, 2);
  assert.equal(alignment.withParty, 1);
  assert.equal(alignment.againstParty, 1);
  assert.equal(alignment.pct, 50);
});

test('analytics helpers rank loyalists and summarize party-line rates', () => {
  const breakdowns = {
    a: {
      democratic: { yea: 200, nay: 10 },
      republican: { yea: 5, nay: 210 },
      independent: { yea: 0, nay: 0 },
    },
    b: {
      democratic: { yea: 200, nay: 10 },
      republican: { yea: 5, nay: 210 },
      independent: { yea: 0, nay: 0 },
    },
  };
  const members = [
    { bioguideId: 'D1', name: 'Loyal, Dem', party: 'Democratic', chamber: 'House', state: 'CA' },
    { bioguideId: 'D2', name: 'Rebel, Dem', party: 'Democratic', chamber: 'House', state: 'NY' },
  ];
  const byMember = {
    D1: Array.from({ length: 12 }, (_, i) => ({ voteId: i % 2 === 0 ? 'a' : 'b', voteCast: 'Yea' })),
    D2: Array.from({ length: 12 }, (_, i) => ({ voteId: i % 2 === 0 ? 'a' : 'b', voteCast: i % 2 === 0 ? 'Nay' : 'Yea' })),
  };

  const ranked = rankPartyAlignment(members, byMember, breakdowns, { limit: 5 });
  assert.equal(ranked[0].bioguideId, 'D1');
  assert.ok((ranked[0].alignment.pct ?? 0) > (ranked[1].alignment.pct ?? 0));

  const summary = summarizePartyLineVotes([
    { chamber: 'House', partyBreakdown: breakdowns.a },
    { chamber: 'Senate', partyBreakdown: {
      democratic: { yea: 50, nay: 0 },
      republican: { yea: 50, nay: 0 },
      independent: { yea: 0, nay: 0 },
    } },
  ]);
  assert.equal(summary.partyLine, 1);
  assert.equal(summary.pct, 50);

  const averages = averageAlignmentByParty(ranked);
  assert.ok(averages.some(a => a.party === 'democratic' && a.members === 2));
});
