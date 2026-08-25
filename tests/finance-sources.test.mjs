import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dedupeNameTokens,
  transactionFamily,
  mapKadoaTrade,
  mergeFinanceTrades,
  normalizeMemberName,
  reconcileFinanceTrades,
  reconcileTransactionDate,
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

const PTR = 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20033889.pdf';

function line(source, extra = {}) {
  return {
    chamber: 'House',
    member: 'Steve Cohen',
    ticker: 'SONY',
    assetDescription: 'Sony Group Corporation American Depositary Shares (SONY)',
    type: 'Purchase',
    amount: '$1,001 - $15,000',
    transactionDate: '2025-12-26',
    disclosureDate: '2026-02-09',
    url: PTR,
    source,
    ...extra,
  };
}

const FILING = {
  chamber: 'House',
  member: 'Hon. Steve Cohen',
  ticker: '',
  type: 'PTR filing',
  amount: '',
  transactionDate: '2026-02-09',
  disclosureDate: '2026-02-09',
  url: PTR,
  source: 'house-clerk',
};

test('a transaction dated after its own filing is a filer typo in the year', () => {
  // The PTR Steve Cohen filed on 2026-02-09 lists the purchase as 12/26/2026.
  assert.deepEqual(
    reconcileTransactionDate('2026-12-26', '2026-02-09'),
    { date: '2025-12-26', repaired: true }
  );
  // A date already before the filing is left alone.
  assert.deepEqual(
    reconcileTransactionDate('2025-12-26', '2026-02-09'),
    { date: '2025-12-26', repaired: false }
  );
  // Nothing to check a date against.
  assert.deepEqual(reconcileTransactionDate('2026-12-26', ''), { date: '2026-12-26', repaired: false });
  // No year within three lands before the filing, so the date stands as filed.
  assert.deepEqual(
    reconcileTransactionDate('2026-12-26', '2019-01-01'),
    { date: '2026-12-26', repaired: false }
  );
});

test('the year is repaired against the date the filing reached the clerk', () => {
  const { trades, stats } = reconcileFinanceTrades(
    [line('congresswatch', { transactionDate: '2026-12-26', disclosureDate: '2026-12-26' }), FILING],
    { today: '2026-08-25' }
  );

  const trade = trades.find(t => t.ticker === 'SONY');
  assert.equal(trade.transactionDate, '2025-12-26');
  assert.equal(trade.disclosureDate, '2026-02-09');
  assert.equal(trade.dateRepaired, true);
  assert.equal(stats.dateRepaired, 1);
  assert.equal(stats.futureDropped, 0);
});

test('one parse of a filing wins, so a shared line item is not counted twice', () => {
  // Both read the same report; Kadoa reaches three lines, CongressWatch one.
  const kadoa = [
    line('kadoa', { owner: 'SP' }),
    line('kadoa', { ticker: 'JPM', transactionDate: '2025-12-27', owner: 'SP' }),
    line('kadoa', { ticker: 'AAPL', transactionDate: '2025-12-28', owner: 'SP' }),
  ];
  const congressWatch = [line('congresswatch', { type: 'Purchase (Partial)', owner: 'Spouse' })];

  const { trades, stats } = reconcileFinanceTrades([...kadoa, ...congressWatch, FILING], { today: '2026-08-25' });

  assert.equal(trades.filter(t => t.source === 'congresswatch').length, 0);
  assert.equal(trades.filter(t => t.source === 'kadoa').length, 3);
  assert.equal(stats.duplicateDropped, 1);
  // The filing record itself survives alongside the line items.
  assert.equal(trades.filter(t => t.type === 'PTR filing').length, 1);
});

test('the fuller parse wins even when a lower-priority source made it', () => {
  const { trades } = reconcileFinanceTrades(
    [
      line('kadoa'),
      line('congresswatch'),
      line('congresswatch', { ticker: 'JPM', transactionDate: '2025-12-27' }),
      FILING,
    ],
    { today: '2026-08-25' }
  );
  assert.deepEqual(trades.filter(t => t.ticker).map(t => t.source), ['congresswatch', 'congresswatch']);
});

test('an equal parse goes to the source that carries the filing dates', () => {
  const { trades } = reconcileFinanceTrades(
    [line('congresswatch', { disclosureDate: '2025-12-26' }), line('kadoa'), FILING],
    { today: '2026-08-25' }
  );
  assert.deepEqual(trades.filter(t => t.ticker).map(t => t.source), ['kadoa']);
});

test('a disclosure date that only repeats the transaction date is refilled', () => {
  const { trades, stats } = reconcileFinanceTrades(
    [line('congresswatch', { disclosureDate: '2025-12-26' }), FILING],
    { today: '2026-08-25' }
  );
  assert.equal(trades.find(t => t.ticker === 'SONY').disclosureDate, '2026-02-09');
  assert.equal(stats.disclosureFilled, 1);
});

test('a trade still dated in the future after reconciling is dropped', () => {
  const { trades, stats } = reconcileFinanceTrades(
    [line('congresswatch', { transactionDate: '2027-03-01', disclosureDate: '2027-03-01', url: '' })],
    { today: '2026-08-25' }
  );
  assert.deepEqual(trades, []);
  assert.equal(stats.futureDropped, 1);
});

test('line items without a filing link keep their own dates', () => {
  const { trades, stats } = reconcileFinanceTrades(
    [line('congresswatch', { url: '', disclosureDate: '' })],
    { today: '2026-08-25' }
  );
  assert.equal(trades.length, 1);
  assert.equal(trades[0].transactionDate, '2025-12-26');
  assert.equal(trades[0].disclosureDate, '2025-12-26');
  assert.equal(stats.disclosureFilled, 0);
});
