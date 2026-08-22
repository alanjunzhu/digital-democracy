import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichMemberVotes,
  rebuildByMemberIndex,
  slimMemberVoteEntry,
  summariesByVoteId,
} from '../shared/vote-member-index.mjs';

test('slim member vote entries store only voteId and voteCast', () => {
  assert.deepEqual(slimMemberVoteEntry('h1-rc42', 'Yea'), { voteId: 'h1-rc42', voteCast: 'Yea' });
});

test('rebuildByMemberIndex produces slim entries keyed by bioguide id', () => {
  const byMember = rebuildByMemberIndex([
    {
      voteId: 's1-rc1',
      memberVotes: [
        { bioguideId: 'S000033', voteCast: 'Yea' },
        { bioguideId: 'bad-id', voteCast: 'Nay' },
      ],
    },
  ]);
  assert.deepEqual(byMember.S000033, [{ voteId: 's1-rc1', voteCast: 'Yea' }]);
  assert.equal(byMember['bad-id'], undefined);
});

test('enrichMemberVotes joins roll-call summaries for display', () => {
  const summaries = summariesByVoteId([
    {
      voteId: 's1-rc1',
      rollCallNumber: 1,
      chamber: 'Senate',
      date: '2025-01-03',
      question: 'S. Res. 1',
      result: 'Agreed to',
      billId: 'sres1',
      topic: 'Procedural',
    },
  ]);
  const enriched = enrichMemberVotes([{ voteId: 's1-rc1', voteCast: 'Yea' }], summaries);
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0].question, 'S. Res. 1');
  assert.equal(enriched[0].voteCast, 'Yea');
});
