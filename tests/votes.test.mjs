import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chooseSessionVotes,
  houseVoteUrl,
  probeRollCalls,
  senateVoteUrl,
} from '../scripts/fetch-votes.mjs';

test('vote URLs use the clerk and senate roll-call paths', () => {
  assert.equal(houseVoteUrl(2026, 1), 'https://clerk.house.gov/evs/2026/roll001.xml');
  assert.equal(houseVoteUrl(2026, 222), 'https://clerk.house.gov/evs/2026/roll222.xml');
  assert.equal(
    senateVoteUrl(2, 7),
    'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00007.xml'
  );
});

test('a session that returns nothing keeps the votes already on disk', () => {
  const kept = chooseSessionVotes(
    [],
    [{ voteId: 'h2-rc1', rollCallNumber: 1, session: 2, chamber: 'House' }],
    { chamber: 'House', session: 2 }
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].voteId, 'h2-rc1');
  assert.deepEqual(chooseSessionVotes([{ voteId: 'h2-rc9' }], [{ voteId: 'h2-rc1' }]), [{ voteId: 'h2-rc9' }]);
  assert.deepEqual(chooseSessionVotes([], []), []);
});

test('roll-call probing stops after a run of consecutive misses', async () => {
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    requested.push(String(url));
    const match = String(url).match(/roll(\d+)\.xml$/);
    const n = match ? parseInt(match[1], 10) : 0;
    if (n >= 1 && n <= 3) {
      return new Response(`<rollcall-vote><rollcall-num>${n}</rollcall-num></rollcall-vote>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }
    return new Response('', { status: 404 });
  };

  try {
    const found = await probeRollCalls({
      urlFor: n => houseVoteUrl(2026, n),
      parse: (xml, n) => ({ rollCallNumber: n, xml }),
      max: 40,
      batchSize: 5,
      stopAfterMisses: 3,
      label: 'test',
    });
    assert.deepEqual(found.map(v => v.rollCallNumber), [1, 2, 3]);
    // 5 in the first batch, then enough of the second batch to hit 3 misses.
    assert.ok(requested.length <= 10, `probed too many URLs: ${requested.length}`);
    assert.ok(requested.length >= 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
