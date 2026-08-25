import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildPolicyIndex,
  classifyVote,
  isContestedVote,
  majoritySide,
  partyAverage,
  tallyPartyVotes,
} from '../shared/policy-areas.mjs';

function vote(id, chamber, casts, extra = {}) {
  return {
    voteId: id,
    chamber,
    date: '2025-03-01',
    question: 'On Passage',
    result: 'Passed',
    memberVotes: casts.map(([bioguideId, party, voteCast]) => ({ bioguideId, party, voteCast })),
    ...extra,
  };
}

const ROSTER = [
  { bioguideId: 'D000001', name: 'Dem, One', party: 'Democratic', chamber: 'Senate', state: 'CA' },
  { bioguideId: 'D000002', name: 'Dem, Two', party: 'Democratic', chamber: 'Senate', state: 'NY' },
  { bioguideId: 'D000003', name: 'Dem, Three', party: 'Democratic', chamber: 'Senate', state: 'IL' },
  { bioguideId: 'R000001', name: 'Rep, One', party: 'Republican', chamber: 'Senate', state: 'TX' },
  { bioguideId: 'R000002', name: 'Rep, Two', party: 'Republican', chamber: 'Senate', state: 'UT' },
];

function immigrationVotes(count, { crossover = 0 } = {}) {
  const votes = [];
  for (let i = 0; i < count; i++) {
    const demTwo = i < crossover ? 'Yea' : 'Nay';
    votes.push(vote(`s-rc${i}`, 'Senate', [
      ['D000001', 'D', 'Nay'],
      ['D000002', 'D', demTwo],
      ['D000003', 'D', 'Nay'],
      ['R000001', 'R', 'Yea'],
      ['R000002', 'R', 'Yea'],
    ], { topic: 'Immigration' }));
  }
  return votes;
}

test('a vote takes its area from its own topic first', () => {
  assert.deepEqual(
    classifyVote({ topic: 'Immigration', question: 'On Passage' }),
    { areaId: 'immigration', source: 'topic' }
  );
});

test('a vote with no topic falls back to the policy area of the bill it names', () => {
  const result = classifyVote(
    { billId: 'hr100', question: 'On Passage' },
    { billsById: { hr100: { policyArea: 'Health' } } }
  );
  assert.deepEqual(result, { areaId: 'health', source: 'bill' });
});

test('question and bill wording classify a vote when nothing else does', () => {
  assert.deepEqual(
    classifyVote({ question: 'Confirmation: Jane Doe, of Ohio, to be U.S. District Judge' }),
    { areaId: 'nominations', source: 'question' }
  );
  assert.deepEqual(
    classifyVote({ billId: 'hr5', question: 'On Passage' }, { billsById: { hr5: { title: 'A bill to expand the Clean Air Act' } } }),
    { areaId: 'energy', source: 'question' }
  );
});

test('floor mechanics are reported as procedural rather than forced into an area', () => {
  assert.deepEqual(
    classifyVote({ question: 'On Ordering the Previous Question' }),
    { areaId: null, source: 'procedural' }
  );
  assert.deepEqual(
    classifyVote({ topic: 'Procedural', question: 'On Motion to Table' }),
    { areaId: null, source: 'procedural' }
  );
  assert.deepEqual(classifyVote({ question: 'On Passage' }), { areaId: null, source: 'unclassified' });
});

test('party tallies are recounted from member casts, not the stored breakdown', () => {
  const tally = tallyPartyVotes([
    { party: 'D', voteCast: 'Nay' },
    { party: 'D', voteCast: 'Not Voting' },
    { party: 'R', voteCast: 'Yea' },
    { party: 'I', voteCast: 'Nay' },
  ]);
  assert.deepEqual(tally.democratic, { yea: 0, nay: 1 });
  assert.deepEqual(tally.republican, { yea: 1, nay: 0 });
  assert.deepEqual(tally.independent, { yea: 0, nay: 1 });
  assert.equal(majoritySide(tally.democratic), 'nay');
  assert.equal(majoritySide({ yea: 2, nay: 2 }), null);
});

test('a roll call is contested only when the two party majorities disagree', () => {
  assert.equal(isContestedVote([
    { party: 'D', voteCast: 'Nay' },
    { party: 'R', voteCast: 'Yea' },
  ]), true);
  assert.equal(isContestedVote([
    { party: 'D', voteCast: 'Yea' },
    { party: 'R', voteCast: 'Yea' },
  ]), false);
});

test('members are scored on support and party-line lean within an area', () => {
  const index = buildPolicyIndex(immigrationVotes(4, { crossover: 1 }), ROSTER, { minAreaVotes: 4 });
  assert.equal(index.areas.length, 1);
  const area = index.areas[0];
  assert.equal(area.id, 'immigration');
  assert.deepEqual(area.votes, { total: 4, contested: 4, house: 0, senate: 4 });

  const byId = Object.fromEntries(area.scores.map(s => [s.id, s]));
  assert.deepEqual(byId.D000001, { id: 'D000001', n: 4, support: 0, lean: -100 });
  assert.deepEqual(byId.R000001, { id: 'R000001', n: 4, support: 100, lean: 100 });
  // The crossover Democrat voted with Republicans once in four.
  assert.deepEqual(byId.D000002, { id: 'D000002', n: 4, support: 25, lean: -50 });
});

test('the party stand is how often each party majority backed the area\'s measures', () => {
  const votes = [
    ...immigrationVotes(4),
    vote('s-rc9', 'Senate', [
      ['D000001', 'D', 'Yea'],
      ['D000002', 'D', 'Yea'],
      ['D000003', 'D', 'Yea'],
      ['R000001', 'R', 'Nay'],
      ['R000002', 'R', 'Nay'],
    ], { topic: 'Immigration' }),
  ];
  const area = buildPolicyIndex(votes, ROSTER, { minAreaVotes: 4 }).areas[0];
  assert.deepEqual(area.partyStand, { democratic: 20, republican: 80 });
});

test('thin areas and thin voting records are left out', () => {
  const index = buildPolicyIndex(immigrationVotes(3), ROSTER, { minAreaVotes: 4 });
  assert.deepEqual(index.areas, []);

  const sparse = buildPolicyIndex(immigrationVotes(4), [
    ...ROSTER,
    { bioguideId: 'R000003', name: 'Late, Arrival', party: 'Republican', chamber: 'Senate', state: 'IA' },
  ], { minAreaVotes: 4, minMemberVotes: 3 });
  assert.equal(sparse.areas[0].scores.some(s => s.id === 'R000003'), false);
  assert.equal(sparse.members.some(m => m.id === 'R000003'), false);
});

test('lopsided and procedural roll calls are counted but never scored', () => {
  const votes = [
    ...immigrationVotes(4),
    vote('s-rc20', 'Senate', [
      ['D000001', 'D', 'Yea'],
      ['D000002', 'D', 'Yea'],
      ['D000003', 'D', 'Yea'],
      ['R000001', 'R', 'Yea'],
      ['R000002', 'R', 'Yea'],
    ], { topic: 'Immigration' }),
    vote('s-rc21', 'Senate', [['D000001', 'D', 'Yea'], ['R000001', 'R', 'Nay']], { topic: 'Procedural', question: 'On Motion to Table' }),
  ];
  const index = buildPolicyIndex(votes, ROSTER, { minAreaVotes: 4 });
  assert.equal(index.coverage.total, 6);
  assert.equal(index.coverage.classified, 5);
  assert.equal(index.coverage.contested, 4);
  assert.equal(index.coverage.procedural, 1);
  assert.deepEqual(index.areas[0].votes, { total: 5, contested: 4, house: 0, senate: 4 });
});

test('party averages can be narrowed to one chamber', () => {
  const roster = [...ROSTER, { bioguideId: 'R000004', name: 'House, Member', party: 'Republican', chamber: 'House', state: 'FL' }];
  const votes = immigrationVotes(4).map(v => ({
    ...v,
    memberVotes: [...v.memberVotes, { bioguideId: 'R000004', party: 'R', voteCast: 'Nay' }],
  }));
  const index = buildPolicyIndex(votes, roster, { minAreaVotes: 4 });
  const membersById = Object.fromEntries(index.members.map(m => [m.id, m]));

  assert.deepEqual(
    partyAverage(index.areas[0], membersById, { party: 'republican', chamber: 'Senate' }),
    { avg: 100, members: 2 }
  );
  assert.deepEqual(
    partyAverage(index.areas[0], membersById, { party: 'republican', chamber: 'all' }),
    { avg: 66.7, members: 3 }
  );
});
