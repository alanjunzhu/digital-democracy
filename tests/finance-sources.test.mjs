import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dedupeNameTokens,
  transactionFamily,
  mapKadoaTrade,
  mergeFinanceTrades,
  normalizeMemberName,
  tradeDedupeKey,
} from '../shared/finance-sources.mjs';
import {
  buildNameLookup,
  matchTradeBioguide,
  parseHouseFdXml,
  partitionFinanceTrades,
} from '../scripts/fetch-finances.mjs';

test('annual House Clerk filings parse with financial-pdfs URLs', () => {
  const xml = `<Member>
    <Last>Example</Last><First>Ann</First>
    <FilingType>A</FilingType><StateDst>FL27</StateDst>
    <Year>2026</Year><FilingDate>5/25/2026</FilingDate><DocID>10079846</DocID>
  </Member>`;
  const filings = parseHouseFdXml(xml, { filingTypes: ['A'] });
  assert.equal(filings.length, 1);
  assert.equal(filings[0].type, 'Annual disclosure');
  assert.match(filings[0].url, /financial-pdfs\/2026\/10079846\.pdf/);
});

test('mergeFinanceTrades deduplicates overlapping records', () => {
  const merged = mergeFinanceTrades(
    [{ member: 'Smith, John', chamber: 'House', ticker: 'AAPL', type: 'Purchase', amount: '$1,001 - $15,000', transactionDate: '2026-01-01' }],
    [{ member: 'Smith, John', chamber: 'House', ticker: 'AAPL', type: 'Purchase', amount: '$1,001 - $15,000', transactionDate: '2026-01-01', source: 'kadoa' }],
  );
  assert.equal(merged.length, 1);
});

test('normalizeMemberName strips trailing state abbreviations', () => {
  assert.equal(normalizeMemberName('Jerry Moran, KS'), 'jerry moran');
});

test('Kadoa trades map to the shared finance record shape', () => {
  const trade = mapKadoaTrade({
    transaction_date: '2025-04-22',
    filing_date: '2026-08-20',
    ticker: 'MSFT',
    asset_name: 'Microsoft Corp',
    transaction_type: 'Purchase',
    amount_range_label: '$1,001 - $15,000',
    doc_url: 'https://efdsearch.senate.gov/search/view/ptr/example/',
  }, {
    full_name: 'John Boozman',
    chamber: 'senate',
    party: 'R',
    state: 'AR',
  });
  assert.equal(trade.chamber, 'Senate');
  assert.equal(trade.ticker, 'MSFT');
  assert.equal(trade.source, 'kadoa');
});

test('annual disclosures partition into filing list', () => {
  const { filings, tickerTrades } = partitionFinanceTrades([
    { type: 'Annual disclosure', assetDescription: 'Annual Financial Disclosure Report', url: 'https://example.test/annual.pdf' },
    { type: 'Purchase', ticker: 'MSFT', assetDescription: 'Microsoft Corp' },
  ]);
  assert.equal(filings.length, 1);
  assert.equal(tickerTrades.length, 1);
});

test('trade dedupe keys treat PTR and ticker records differently', () => {
  const ptr = tradeDedupeKey({ member: 'Jane Doe', type: 'PTR filing', transactionDate: '2026-01-01', url: 'https://example.test/ptr.pdf' });
  const ticker = tradeDedupeKey({ member: 'Jane Doe', type: 'Purchase', transactionDate: '2026-01-01', ticker: 'MSFT', amount: '$1,001 - $15,000', chamber: 'Senate' });
  assert.notEqual(ptr, ticker);
});

test('members match when source names include a trailing state abbreviation', () => {
  const lookup = buildNameLookup([
    { bioguideId: 'M000934', name: 'Moran, Jerry', lastName: 'Moran', firstName: 'Jerry', state: 'Kansas' },
  ]);
  assert.equal(matchTradeBioguide({ member: 'Jerry Moran, KS', state: 'KS' }, lookup), 'M000934');
});

test('trade and ticker link helpers prefer disclosure url and yahoo quote', async () => {
  const { tradeDisclosureUrl, tickerQuoteUrl } = await import('../shared/finance-sources.mjs');
  assert.equal(
    tradeDisclosureUrl({ url: 'https://efdsearch.senate.gov/search/view/ptr/example/' }),
    'https://efdsearch.senate.gov/search/view/ptr/example/'
  );
  assert.equal(tickerQuoteUrl('msft'), 'https://finance.yahoo.com/quote/MSFT');
  assert.equal(tickerQuoteUrl('--'), null);
});

test('adjacent repeated name tokens collapse', () => {
  // Rep. Franklin arrives from the PTR sources as "Scott Scott Franklin".
  assert.equal(dedupeNameTokens('Scott Scott Franklin'), 'Scott Franklin');
  assert.equal(dedupeNameTokens('  Hon.  Carol   Devine  Miller '), 'Hon. Carol Devine Miller');
  // Only adjacent repeats collapse — a real repeated surname survives.
  assert.equal(dedupeNameTokens('John Smith John'), 'John Smith John');
  assert.equal(dedupeNameTokens(''), '');
});

test('one filing parsed by two sources dedupes despite different wording', () => {
  // CongressWatch and Kadoa describe the same BAC sale from the same PDF.
  const congresswatch = {
    member: 'James A. Himes',
    ticker: 'BAC',
    type: 'Sale',
    owner: 'Joint',
    amount: '$1,001 - $15,000',
    transactionDate: '2026-07-20',
    url: 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035047.pdf',
  };
  const kadoa = { ...congresswatch, type: 'Sale (Full)', owner: 'JT', source: 'kadoa' };

  assert.equal(tradeDedupeKey(congresswatch), tradeDedupeKey(kadoa));
  assert.equal(mergeFinanceTrades([congresswatch], [kadoa]).length, 1);
});

test('genuinely different line items in one filing stay separate', () => {
  const base = {
    member: 'Scott Franklin',
    ticker: 'CMCSA',
    type: 'Sale (Full)',
    transactionDate: '2025-08-04',
    url: 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2025/20030918.pdf',
  };
  // Same filing, but a spouse account and the member's own, at different sizes.
  const spouse = { ...base, owner: 'SP', amount: '$1,001 - $15,000' };
  const self = { ...base, owner: '', amount: '$15,001 - $50,000' };

  assert.notEqual(tradeDedupeKey(spouse), tradeDedupeKey(self));
  assert.equal(mergeFinanceTrades([spouse], [self]).length, 2);
});

test('trades with no filing url keep the member-scoped key', () => {
  const a = { member: 'A', ticker: 'X', type: 'Purchase', amount: '$1', transactionDate: '2025-01-01' };
  const b = { member: 'B', ticker: 'X', type: 'Purchase', amount: '$1', transactionDate: '2025-01-01' };
  assert.notEqual(tradeDedupeKey(a), tradeDedupeKey(b));
});

test('transaction wording collapses to a family', () => {
  assert.equal(transactionFamily('Sale (Full)'), 'sale');
  assert.equal(transactionFamily('Sale (Partial)'), 'sale');
  assert.equal(transactionFamily('Purchase'), 'purchase');
  assert.equal(transactionFamily('Exchange'), 'exchange');
});
