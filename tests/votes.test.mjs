import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyVoteRecordRepairs,
  buildSenateNameLookup,
  chooseSessionVotes,
  houseVoteUrl,
  isBioguideId,
  probeRollCalls,
  resolveSenateBioguide,
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

test('Senate LIS ids map to bioguide ids using last name and state abbreviation', () => {
  assert.equal(isBioguideId('B001319'), true);
  assert.equal(isBioguideId('S428'), false);

  const lookup = buildSenateNameLookup([
    { bioguideId: 'B001319', lastName: 'Britt', state: 'Alabama', chamber: 'Senate' },
    { bioguideId: 'V000128', lastName: 'Van Hollen', state: 'Maryland', chamber: 'Senate' },
    { bioguideId: 'A000055', lastName: 'Aderholt', state: 'Alabama', chamber: 'House' },
  ]);

  assert.equal(resolveSenateBioguide({ name: 'Katie Britt', state: 'AL', bioguideId: 'S428' }, lookup), 'B001319');
  assert.equal(resolveSenateBioguide({ name: 'Chris Van Hollen', state: 'MD', bioguideId: 'S317' }, lookup), 'V000128');
  assert.equal(
    resolveSenateBioguide(
      { name: 'Ben Ray Lujan', state: 'NM', bioguideId: 'S306' },
      buildSenateNameLookup([{ bioguideId: 'L000570', lastName: 'Luján', state: 'New Mexico', chamber: 'Senate' }])
    ),
    'L000570'
  );
  assert.equal(resolveSenateBioguide({ name: 'Katie Britt', state: 'AL', bioguideId: 'B001319' }, lookup), 'B001319');
});

test('stored Senate votes get bioguide ids and resolution bill ids', () => {
  const lookup = buildSenateNameLookup([
    { bioguideId: 'B001319', lastName: 'Britt', state: 'Alabama', chamber: 'Senate' },
  ]);
  const repaired = applyVoteRecordRepairs({
    voteId: 's2-rc217',
    chamber: 'Senate',
    question: 'S. Res. 817',
    billId: 's817',
    billType: 's',
    billNumber: 817,
    memberVotes: [{ bioguideId: 'S428', name: 'Katie Britt', state: 'AL', voteCast: 'Yea' }],
  }, lookup);

  assert.equal(repaired.billId, 'sres817');
  assert.equal(repaired.memberVotes[0].bioguideId, 'B001319');
});
