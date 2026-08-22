import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMemberProfiles,
  buildNameLookup,
  matchTradeBioguide,
  parseHouseFdXml,
  parseUsDate,
  partitionFinanceTrades,
} from '../scripts/fetch-finances.mjs';

test('Clerk filing dates are stored as ISO dates', () => {
  assert.equal(parseUsDate('3/31/2026'), '2026-03-31');
  assert.equal(parseUsDate('12/1/2025'), '2025-12-01');
  assert.equal(parseUsDate(''), '');
});

test('only periodic transaction reports are kept from the Clerk XML', () => {
  const xml = `<?xml version="1.0"?>
<FinancialDisclosure>
  <Member>
    <Prefix>Hon.</Prefix>
    <Last>Alford</Last>
    <First>Mark</First>
    <FilingType>P</FilingType>
    <StateDst>MO04</StateDst>
    <Year>2026</Year>
    <FilingDate>3/31/2026</FilingDate>
    <DocID>20034201</DocID>
  </Member>
  <Member>
    <Last>Aaron</Last>
    <First>Richard</First>
    <FilingType>W</FilingType>
    <StateDst>MI04</StateDst>
    <Year>2026</Year>
    <FilingDate>4/15/2026</FilingDate>
    <DocID>8068</DocID>
  </Member>
</FinancialDisclosure>`;

  const filings = parseHouseFdXml(xml);
  assert.equal(filings.length, 1);
  assert.equal(filings[0].member, 'Hon. Mark Alford');
  assert.equal(filings[0].type, 'PTR filing');
  assert.equal(filings[0].state, 'MO');
  assert.equal(filings[0].district, '04');
  assert.equal(filings[0].transactionDate, '2026-03-31');
  assert.equal(
    filings[0].url,
    'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20034201.pdf'
  );
});

test('PTR filers match members by given name or by last name plus state abbreviation', () => {
  const lookup = buildNameLookup([
    { bioguideId: 'A000379', name: 'Alford, Mark', lastName: 'Alford', state: 'Missouri' },
  ]);
  const filing = parseHouseFdXml(`<Member>
    <Prefix>Hon.</Prefix><Last>Alford</Last><First>Mark</First>
    <FilingType>P</FilingType><StateDst>MO04</StateDst>
    <Year>2026</Year><FilingDate>3/31/2026</FilingDate><DocID>1</DocID>
  </Member>`)[0];

  assert.equal(matchTradeBioguide(filing, lookup), 'A000379');
  assert.equal(matchTradeBioguide({ member: 'Hon. Mark Alford', state: '' }, lookup), 'A000379');
  assert.equal(matchTradeBioguide({ member: 'Alford', state: 'MO' }, lookup), 'A000379');
});

test('committee-only members still get a finance profile', () => {
  const profiles = buildMemberProfiles([], {
    S001195: ['Ways and Means Committee'],
  });
  assert.equal(profiles.S001195.committees[0], 'Ways and Means Committee');
  assert.equal(profiles.S001195.trades.length, 0);
});

test('PTR filings are split from ticker trades for the member page', () => {
  const { filings, tickerTrades } = partitionFinanceTrades([
    { type: 'PTR filing', assetDescription: 'Periodic Transaction Report', url: 'https://example.test/ptr.pdf' },
    { type: 'Purchase', ticker: 'AAPL', assetDescription: 'Apple Inc' },
  ]);
  assert.equal(filings.length, 1);
  assert.equal(tickerTrades.length, 1);
  assert.equal(tickerTrades[0].ticker, 'AAPL');
});

test('a CongressWatch trade with a bioguide id does not need a name match', () => {
  assert.equal(
    matchTradeBioguide({ bioguideId: 'C001068', member: 'Someone Else', state: '' }, {}),
    'C001068'
  );
});
