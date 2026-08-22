import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  billOriginChamber,
  committeeSlug,
  formatBillType,
  getBillId,
  getBillTextWebUrl,
  getBillWebUrl,
  getCommitteeWebUrl,
  isApiUrl,
  isSubcommitteeCode,
  normalizeBillType,
  ordinal,
  parentCommitteeCode,
  parseLegislativeCitation,
} from '../shared/congress-urls.mjs';

test('bill types are normalized from every spelling the API and data use', () => {
  assert.equal(normalizeBillType('HR'), 'hr');
  assert.equal(normalizeBillType('H.R.'), 'hr');
  assert.equal(normalizeBillType('hjres'), 'hjres');
  assert.equal(normalizeBillType('S.Con.Res.'), 'sconres');
  assert.equal(formatBillType('HJRES'), 'H.J.Res.');
  assert.equal(formatBillType('s'), 'S.');
});

test('resolutions get their own congress.gov path, not the bill path', () => {
  assert.equal(
    getBillWebUrl(119, 'HR', 34),
    'https://www.congress.gov/bill/119th-congress/house-bill/34'
  );
  assert.equal(
    getBillWebUrl(119, 'HRES', 34),
    'https://www.congress.gov/bill/119th-congress/house-resolution/34'
  );
  assert.equal(
    getBillWebUrl(119, 'H.J.Res.', 1),
    'https://www.congress.gov/bill/119th-congress/house-joint-resolution/1'
  );
  assert.equal(
    getBillWebUrl(119, 'HCONRES', 3),
    'https://www.congress.gov/bill/119th-congress/house-concurrent-resolution/3'
  );
  assert.equal(
    getBillWebUrl(119, 'SRES', 19),
    'https://www.congress.gov/bill/119th-congress/senate-resolution/19'
  );
  assert.equal(
    getBillWebUrl(119, 'SCONRES', 1),
    'https://www.congress.gov/bill/119th-congress/senate-concurrent-resolution/1'
  );
});

test('text URLs extend the bill URL and unknown types yield no URL', () => {
  assert.equal(
    getBillTextWebUrl(119, 'sjres', 2),
    'https://www.congress.gov/bill/119th-congress/senate-joint-resolution/2/text'
  );
  assert.equal(getBillWebUrl(119, 'notatype', 5), null);
  assert.equal(getBillTextWebUrl(119, 'hr', undefined), null);
});

test('congress numbers get the right ordinal suffix', () => {
  assert.equal(ordinal(119), '119th');
  assert.equal(ordinal(111), '111th');
  assert.equal(ordinal(112), '112th');
  assert.equal(ordinal(113), '113th');
  assert.equal(ordinal(121), '121st');
  assert.equal(ordinal(122), '122nd');
  assert.equal(ordinal(123), '123rd');
});

test('bill ids and origin chambers follow the type', () => {
  assert.equal(getBillId('H.Res.', 34), 'hres34');
  assert.equal(getBillId('S', '24'), 's24');
  assert.equal(billOriginChamber('sjres'), 'Senate');
  assert.equal(billOriginChamber('hconres'), 'House');
});

test('legislative citations keep resolution types distinct from bills', () => {
  assert.deepEqual(parseLegislativeCitation('S. Res. 817'), { billType: 'sres', billNumber: 817, billId: 'sres817' });
  assert.deepEqual(parseLegislativeCitation('S. 900'), { billType: 's', billNumber: 900, billId: 's900' });
  assert.deepEqual(parseLegislativeCitation('H.R. 1'), { billType: 'hr', billNumber: 1, billId: 'hr1' });
  assert.deepEqual(parseLegislativeCitation('H. Res. 34'), { billType: 'hres', billNumber: 34, billId: 'hres34' });
  assert.equal(parseLegislativeCitation('On the nomination'), null);
});

test('committee slugs match the congress.gov profile URLs', () => {
  assert.equal(committeeSlug('House', 'Ways and Means Committee'), 'house-ways-and-means');
  assert.equal(committeeSlug('House', 'Energy and Commerce Committee'), 'house-energy-and-commerce');
  assert.equal(
    committeeSlug('House', 'Transportation and Infrastructure Committee'),
    'house-transportation-and-infrastructure'
  );
  assert.equal(committeeSlug('Senate', 'Judiciary Committee'), 'senate-judiciary');
  assert.equal(
    committeeSlug('Senate', 'Health, Education, Labor, and Pensions Committee'),
    'senate-health-education-labor-and-pensions'
  );
  assert.equal(committeeSlug('Senate', "Veterans' Affairs Committee"), 'senate-veterans-affairs');
});

test('committee slugs do not repeat a chamber already in the name', () => {
  assert.equal(committeeSlug('House', 'Committee on House Administration'), 'house-administration');
  assert.equal(committeeSlug('Joint', 'Joint Economic Committee'), 'joint-economic');
  assert.equal(committeeSlug('Joint', 'Joint Committee on Taxation'), 'joint-taxation');
});

test('parenthetical qualifiers are dropped from committee slugs', () => {
  assert.equal(committeeSlug('Senate', 'Intelligence (Select) Committee'), 'senate-intelligence');
  assert.equal(committeeSlug('House', 'Intelligence (Permanent Select) Committee'), 'house-intelligence');
  assert.equal(committeeSlug('Senate', 'Aging (Special) Committee'), 'senate-aging');
});

test('names with no derivable slug produce no congress.gov URL', () => {
  assert.equal(committeeSlug('House', 'Tom Lantos Human Rights Commission'), null);
  assert.equal(committeeSlug('Joint', 'Congressional-Executive Commission on China'), null);
  assert.equal(
    committeeSlug('House', 'Select Committee on the Strategic Competition Between the United States and the Chinese Communist Party'),
    null
  );
  assert.equal(committeeSlug('Senate', 'United States Senate Caucus on International Narcotics Control'), null);
  assert.equal(committeeSlug('Nowhere', 'Judiciary Committee'), null);
});

test('subcommittees are identified by systemCode, not by name', () => {
  assert.equal(isSubcommitteeCode('hswm00'), false);
  assert.equal(isSubcommitteeCode('hswm04'), true);
  // Labelled "Standing" by the API even though the code says subcommittee.
  assert.equal(isSubcommitteeCode('hsgo16'), true);
  assert.equal(parentCommitteeCode('hswm04'), 'hswm00');
  assert.equal(parentCommitteeCode('hswm00'), 'hswm00');
});

test('only full committees get a congress.gov profile URL', () => {
  assert.equal(
    getCommitteeWebUrl('House', 'hswm00', 'Ways and Means Committee'),
    'https://www.congress.gov/committee/house-ways-and-means/hswm00'
  );
  // congress.gov lists subcommittees on their parent's page instead.
  assert.equal(getCommitteeWebUrl('House', 'hswm04', 'Trade Subcommittee'), null);
});

test('api.congress.gov referrers are recognized so they are never shown to visitors', () => {
  assert.equal(isApiUrl('https://api.congress.gov/v3/committee/house/hswm00?format=json'), true);
  assert.equal(isApiUrl('https://waysandmeans.house.gov/'), false);
  assert.equal(isApiUrl(undefined), false);
});
