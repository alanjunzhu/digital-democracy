/**
 * Runs the fetch scripts end to end against a stand-in for the Congress.gov
 * API, checking what they write to disk.
 *
 * The stand-in mirrors the behaviour that caused the bugs these tests guard:
 * its bill list returns the congress's oldest measures unless asked to sort by
 * update date, and its committee bills endpoint spans several congresses.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const OLDEST_BILLS = [
  { congress: 119, type: 'HR', number: '1', title: 'A bill from the first week', originChamber: 'House', updateDate: '2025-01-03', latestAction: { actionDate: '2025-01-03', text: 'Introduced in House' } },
  { congress: 119, type: 'HRES', number: '2', title: 'A resolution from the first week', originChamber: 'House', updateDate: '2025-01-06', latestAction: { actionDate: '2025-01-06', text: 'Introduced in House' } },
];

const RECENTLY_UPDATED_BILLS = [
  { congress: 119, type: 'HRES', number: '34', title: 'A resolution with current activity', originChamber: 'House', updateDate: '2026-08-14', latestAction: { actionDate: '2026-08-14', text: 'Agreed to in House.' } },
  { congress: 119, type: 'S', number: '900', title: 'A senate bill with current activity', originChamber: 'Senate', updateDate: '2026-08-12', latestAction: { actionDate: '2026-08-12', text: 'Referred to the Committee on the Judiciary.' } },
];

const COMMITTEES = {
  house: [
    {
      systemCode: 'hswm00',
      name: 'Ways and Means Committee',
      chamber: 'House',
      committeeTypeCode: 'Standing',
      subcommittees: [{ systemCode: 'hswm04', name: 'Trade Subcommittee' }],
    },
    {
      systemCode: 'hswm04',
      name: 'Trade Subcommittee',
      chamber: 'House',
      committeeTypeCode: 'Subcommittee',
      parent: { systemCode: 'hswm00', name: 'Ways and Means Committee' },
    },
  ],
  senate: [
    { systemCode: 'ssju00', name: 'Judiciary Committee', chamber: 'Senate', committeeTypeCode: 'Standing' },
  ],
  joint: [],
};

const COMMITTEE_BILLS = {
  hswm00: [
    { congress: 119, type: 'HRES', number: '34', relationshipType: 'Reported by', actionDate: '2026-08-14T16:00:00Z' },
    { congress: 119, type: 'HR', number: '1', relationshipType: 'Referred to', actionDate: '2025-01-03T16:00:00Z' },
    // A different congress; must not appear in the stored record.
    { congress: 117, type: 'HR', number: '4', relationshipType: 'Referred to', actionDate: '2022-02-18T16:00:00Z' },
  ],
  hswm04: [],
  ssju00: [
    { congress: 119, type: 'S', number: '900', relationshipType: 'Referred to', actionDate: '2026-08-12T16:00:00Z' },
  ],
};

const requestedUrls = [];

function json(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  requestedUrls.push(req.url);
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);

  // /bill/119 — oldest first unless a sort is requested, like the real API.
  if (parts[0] === 'bill' && parts.length === 2) {
    const sorted = url.searchParams.get('sort') === 'updateDate desc';
    const bills = sorted ? RECENTLY_UPDATED_BILLS : OLDEST_BILLS;
    return json(res, { bills, pagination: { count: bills.length } });
  }

  // /bill/119/{type}/{number} and its sub-resources
  if (parts[0] === 'bill' && parts.length >= 4) {
    const [, , type, number, sub] = parts;
    const bill = [...OLDEST_BILLS, ...RECENTLY_UPDATED_BILLS].find(
      b => b.type.toLowerCase() === type && b.number === number
    );
    if (!bill) {
      res.writeHead(404).end();
      return;
    }
    if (sub === 'actions') return json(res, { actions: [{ actionDate: bill.latestAction.actionDate, text: bill.latestAction.text, actionCode: 'H1000' }] });
    if (sub === 'summaries') return json(res, { summaries: [{ text: '<p>Summary text.</p>' }] });
    if (sub === 'subjects') return json(res, { subjects: { legislativeSubjects: [{ name: 'Taxation' }] } });
    if (sub === 'committees') {
      const committee = bill.originChamber === 'Senate'
        ? { systemCode: 'ssju00', name: 'Judiciary Committee', chamber: 'Senate', type: 'Standing' }
        : { systemCode: 'hswm00', name: 'Ways and Means Committee', chamber: 'House', type: 'Standing' };
      return json(res, { committees: [{ ...committee, activities: [{ name: 'Referred to', date: '2025-01-09T17:03:00Z' }] }] });
    }
    return json(res, {
      bill: {
        ...bill,
        introducedDate: '2025-01-09',
        policyArea: { name: 'Taxation' },
        sponsors: [{ bioguideId: 'B001302', firstName: 'Andy', lastName: 'Biggs', party: 'R', state: 'AZ' }],
        cosponsors: { count: 3 },
      },
    });
  }

  // /committee/119/{chamber} — a numeric second segment is the congress
  if (parts[0] === 'committee' && parts.length === 3 && /^\d+$/.test(parts[1])) {
    const committees = COMMITTEES[parts[2]] || [];
    return json(res, { committees, pagination: { count: committees.length } });
  }

  // /committee/{chamber}/{code} and /committee/{chamber}/{code}/bills
  if (parts[0] === 'committee' && parts.length >= 3) {
    const code = parts[2];
    if (parts[3] === 'bills') {
      const bills = COMMITTEE_BILLS[code] || [];
      return json(res, { 'committee-bills': { bills, count: bills.length }, pagination: { count: bills.length } });
    }
    return json(res, {
      committee: {
        systemCode: code,
        url: code === 'hswm00' ? 'https://waysandmeans.house.gov/' : undefined,
      },
    });
  }

  res.writeHead(404).end();
});

describe('fetch scripts against a stand-in API', () => {
  let dataDir;
  let env;

  before(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    dataDir = mkdtempSync(join(tmpdir(), 'congress-data-'));
    env = {
      ...process.env,
      CONGRESS_API_KEY: 'test-key',
      CONGRESS_API_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      CONGRESS_DATA_DIR: dataDir,
    };

    await run('node', ['scripts/fetch-bills.mjs'], { cwd: repoRoot, env });
    await run('node', ['scripts/fetch-committees.mjs'], { cwd: repoRoot, env });
  });

  after(() => server.close());

  const read = relativePath => JSON.parse(readFileSync(join(dataDir, relativePath), 'utf-8'));

  test('the bill list is requested sorted by update date', () => {
    const listRequests = requestedUrls.filter(u => /^\/bill\/119\?/.test(u));
    assert.ok(listRequests.length > 0, 'expected the bill list endpoint to be called');
    assert.ok(
      listRequests.every(u => u.includes('sort=updateDate+desc')),
      `expected every bill list request to sort by update date, got ${listRequests.join(', ')}`
    );
  });

  test('bills with current activity are stored instead of the congress\'s oldest', () => {
    const index = read('bills/index.json');
    assert.deepEqual(index.bills.map(b => b.billId).sort(), ['hres34', 's900']);
    assert.equal(index.bills[0].latestActionDate, '2026-08-14');
  });

  test('a stored resolution points at the resolution page, not the bill page', () => {
    const resolution = read('bills/hres34.json');
    assert.equal(resolution.url, 'https://www.congress.gov/bill/119th-congress/house-resolution/34');
    assert.equal(resolution.textUrl, 'https://www.congress.gov/bill/119th-congress/house-resolution/34/text');
    assert.equal(resolution.type, 'H.Res.');
    assert.equal(resolution.cosponsors, 3);
  });

  test('committee referrals on a bill keep the systemCode', () => {
    assert.deepEqual(read('bills/s900.json').committees, [
      {
        name: 'Judiciary Committee',
        systemCode: 'ssju00',
        chamber: 'Senate',
        type: 'Standing',
        activities: [{ name: 'Referred to', date: '2025-01-09T17:03:00Z' }],
      },
    ]);
  });

  test('committee records list the current congress\'s legislation, newest first', () => {
    const committee = read('committees/hswm00.json');
    assert.deepEqual(committee.bills.map(b => b.billId), ['hres34', 'hr1']);
    assert.equal(committee.billCount, 2);
    assert.equal(committee.bills[0].relationshipType, 'Reported by');
    assert.equal(committee.bills[0].actionDate, '2026-08-14');
    assert.equal(committee.bills[0].url, 'https://www.congress.gov/bill/119th-congress/house-resolution/34');
  });

  test('committee records carry the corrected profile URL and website', () => {
    const committee = read('committees/hswm00.json');
    assert.equal(committee.url, 'https://www.congress.gov/committee/house-ways-and-means/hswm00');
    assert.equal(committee.officialWebsite, 'https://waysandmeans.house.gov/');
    assert.equal(committee.isSubcommittee, false);
  });

  test('subcommittees are recorded with their parent and no profile URL of their own', () => {
    const subcommittee = read('committees/hswm04.json');
    assert.equal(subcommittee.isSubcommittee, true);
    assert.deepEqual(subcommittee.parent, { systemCode: 'hswm00', name: 'Ways and Means Committee' });
    assert.equal(subcommittee.url, null);
  });

  test('the committee index covers every chamber, Senate first then by name', () => {
    const index = read('committees/index.json');
    assert.deepEqual(index.committees.map(c => c.systemCode), ['ssju00', 'hswm04', 'hswm00']);
    assert.equal(index.total, 3);
  });

  test('each fetch keeps the other\'s last-updated timestamp', () => {
    const meta = read('meta/last-updated.json');
    assert.ok(meta.bills, 'expected the bills timestamp to be recorded');
  });
});
