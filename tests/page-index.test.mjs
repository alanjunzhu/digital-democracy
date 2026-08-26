import test from 'node:test';
import assert from 'node:assert/strict';

import { MIN_INDEX_SECTIONS, buildPageIndex, slugify } from '../shared/page-index.mjs';

test('labels become anchor ids a URL can carry', () => {
  assert.equal(slugify('Financial Disclosures & Trading'), 'financial-disclosures-and-trading');
  assert.equal(slugify('Where They Stand by Policy Area'), 'where-they-stand-by-policy-area');
  assert.equal(slugify('  Roll Call Votes (12) '), 'roll-call-votes-12');
  assert.equal(slugify(''), '');
  assert.equal(slugify(undefined), '');
});

test('a section only reaches the index when the page actually renders it', () => {
  const index = buildPageIndex([
    { id: 'overview', label: 'Overview' },
    { id: 'voting-record', label: 'Voting Record', when: 412, count: 412 },
    { id: 'trades', label: 'Financial Disclosures', when: 0 },
    { id: 'committees', label: 'Committee Assignments', when: ['Armed Services'] },
    { id: 'policy', label: 'Policy Stances', when: null },
  ]);

  assert.deepEqual(index.map((s) => s.id), ['overview', 'voting-record', 'committees']);
  assert.equal(index[1].count, 412);
  assert.equal(index[0].count, null);
});

test('an index of one or two links is dropped rather than shown', () => {
  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'tally', label: 'Vote Tally' },
  ];
  assert.deepEqual(buildPageIndex(sections), []);
  assert.equal(buildPageIndex([...sections, { id: 'members', label: 'Individual Votes' }]).length, 3);
  assert.equal(MIN_INDEX_SECTIONS, 3);
  assert.deepEqual(buildPageIndex([]), []);
  assert.deepEqual(buildPageIndex(undefined), []);
});

test('ids stay unique and unlabelled entries are skipped', () => {
  const index = buildPageIndex([
    { label: 'Committee Assignments' },
    { label: 'Committee Assignments' },
    { label: '   ' },
    null,
    { label: 'Committee Assignments' },
  ]);

  assert.deepEqual(index.map((s) => s.id), [
    'committee-assignments',
    'committee-assignments-2',
    'committee-assignments-3',
  ]);
});

test('a nested entry is promoted when its parent section is not on the page', () => {
  const index = buildPageIndex([
    { id: 'finances', label: 'Financial Disclosures', when: false },
    { id: 'sectors', label: 'Trading by Sector', depth: 1 },
    { id: 'tickers', label: 'Most Traded Stocks', depth: 1 },
    { id: 'sources', label: 'Sources', depth: 1 },
  ]);

  assert.deepEqual(index.map((s) => [s.id, s.depth]), [
    ['sectors', 0],
    ['tickers', 1],
    ['sources', 1],
  ]);
});
