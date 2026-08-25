/**
 * Helpers for merging congressional finance records from multiple public sources.
 */

export const HOUSE_FILING_TYPES = {
  P: { label: 'PTR filing', assetDescription: 'Periodic Transaction Report', pdfDir: 'ptr-pdfs' },
  A: { label: 'Annual disclosure', assetDescription: 'Annual Financial Disclosure Report', pdfDir: 'financial-pdfs' },
};

export function normalizeFinanceDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  }
  return raw.slice(0, 10);
}

export function normalizeMemberName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^hon\.\s*/i, '')
    .replace(/,\s*[a-z]{2}$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filer names arrive from PTR sources with a middle name repeating the first
 * ("Scott Scott Franklin"). Collapse adjacent repeats, preserving the original
 * capitalisation of the token that is kept.
 */
export function dedupeNameTokens(value) {
  const tokens = String(value || '').trim().split(/\s+/).filter(Boolean);
  const kept = [];
  for (const token of tokens) {
    const previous = kept[kept.length - 1];
    if (previous && previous.toLowerCase() === token.toLowerCase()) continue;
    kept.push(token);
  }
  return kept.join(' ');
}

/** Owner codes arrive in long and short forms from different sources. */
const OWNER_LABELS = {
  SP: 'Spouse',
  SPOUSE: 'Spouse',
  JT: 'Joint',
  JOINT: 'Joint',
  DC: 'Dependent child',
  'DEPENDENT CHILD': 'Dependent child',
  CHILD: 'Dependent child',
  SELF: 'Self',
};

export function normalizeOwner(owner) {
  const key = String(owner || '').trim().toUpperCase();
  if (!key) return null;
  return OWNER_LABELS[key] || null;
}

/**
 * Sources word the same transaction differently: "Sale" against "Sale (Full)",
 * "Purchase" against "Purchase (Partial)". Collapse to the family so one filing
 * does not land twice.
 */
export function transactionFamily(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('purchase')) return 'purchase';
  if (value.includes('sale')) return 'sale';
  if (value.includes('exchange')) return 'exchange';
  return value.trim();
}

export function tradeDedupeKey(trade) {
  const member = normalizeMemberName(trade.member);
  const date = normalizeFinanceDate(trade.transactionDate || trade.disclosureDate);
  const type = String(trade.type || '').toLowerCase().trim();
  const ticker = String(trade.ticker || '').toUpperCase();
  const amount = String(trade.amount || '').trim();
  const url = String(trade.url || '').trim();

  if (type === 'ptr filing' || type === 'annual disclosure') {
    return `${member}|${type}|${date}|${url}`;
  }

  // Two sources parsing the same filing describe one line item in their own
  // words — CongressWatch says "Sale"/"Spouse" where Kadoa says
  // "Sale (Full)"/"SP". When both cite the same document, the document plus the
  // trade's own facts identify it; the wording must not split it in two.
  if (url) {
    const owner = normalizeOwner(trade.owner) || String(trade.owner || '').trim().toLowerCase();
    return `${url}|${date}|${ticker}|${transactionFamily(trade.type)}|${amount}|${owner}`;
  }

  return `${member}|${date}|${ticker}|${type}|${amount}|${trade.chamber || ''}`;
}

/** Merge trade lists in priority order; first source wins on duplicates. */
export function mergeFinanceTrades(...lists) {
  const seen = new Set();
  const merged = [];

  for (const list of lists) {
    for (const trade of list || []) {
      const key = tradeDedupeKey(trade);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(trade);
    }
  }

  return merged;
}

/**
 * Which parse of a filing to keep when two sources read the same PDF.
 *
 * Measured against the sources' own feeds over the filings both had read:
 * Kadoa transcribed more lines on 41 reports, CongressWatch on 5, and they
 * matched on 269. Kadoa also carries the notification and filing dates, so it
 * leads here. Completeness still decides first — this order only breaks ties,
 * and it must not override a source that simply read more of the report.
 */
export const TRADE_SOURCE_PRIORITY = ['kadoa', 'congresswatch', 'stock-watcher', 'house-clerk', 'senate-efd'];

const FILING_TYPES = new Set(['ptr filing', 'annual disclosure']);

export function isFilingRecord(trade) {
  return FILING_TYPES.has(String(trade?.type || '').toLowerCase().trim());
}

function shiftYear(date, years) {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y + years, m - 1, d));
  if (shifted.getUTCMonth() !== m - 1 || shifted.getUTCDate() !== d) return null;
  return shifted.toISOString().slice(0, 10);
}

/**
 * A transaction cannot postdate the report that discloses it, so one that does
 * carries a filer's typo — a PTR filed 2026-02-09 listing 12/26/2026 means
 * 12/26/2025. Roll the year back until the date lands before the filing, and
 * leave it alone when no year within three does.
 */
export function reconcileTransactionDate(transactionDate, filingDate) {
  const date = normalizeFinanceDate(transactionDate);
  const filed = normalizeFinanceDate(filingDate);
  if (!date || !filed || date <= filed) return { date, repaired: false };

  for (let back = 1; back <= 3; back++) {
    const shifted = shiftYear(date, -back);
    if (shifted && shifted <= filed) return { date: shifted, repaired: true };
  }
  return { date, repaired: false };
}

/** The date a filing reached the clerk, per document, best source first. */
function filingDatesByUrl(trades) {
  const dates = new Map();

  // The clerk's own filing record is authoritative and wins outright.
  for (const trade of trades) {
    const url = String(trade?.url || '').trim();
    if (!url || !isFilingRecord(trade)) continue;
    const date = normalizeFinanceDate(trade.transactionDate || trade.disclosureDate);
    if (date) dates.set(url, date);
  }

  // Otherwise take a disclosure date a source reported separately from the
  // transaction date. CongressWatch repeats the transaction date instead of
  // supplying one, so those tell us nothing.
  for (const trade of trades) {
    const url = String(trade?.url || '').trim();
    if (!url || dates.has(url) || isFilingRecord(trade)) continue;
    const disclosed = normalizeFinanceDate(trade.disclosureDate);
    const transacted = normalizeFinanceDate(trade.transactionDate);
    if (disclosed && disclosed !== transacted) dates.set(url, disclosed);
  }

  return dates;
}

/**
 * Reconcile line items that several sources parsed out of the same filings.
 *
 * Sources overlap on documents but describe line items in their own words, so
 * merging them item by item leaves the same trade in the data twice. Instead one
 * parse of each document wins, its dates are checked against the filing date,
 * and anything still dated in the future is dropped rather than shown.
 *
 * Run this before any cross-source dedupe: electing a winner counts the lines
 * each source read, and a dedupe pass ahead of it deletes some of them,
 * handing the filing to whichever source happened to be merged first.
 */
export function reconcileFinanceTrades(trades, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const rows = (trades || []).filter(Boolean);
  const filingDates = filingDatesByUrl(rows);

  // Elect the parse to keep for each document.
  const counts = new Map();
  for (const trade of rows) {
    const url = String(trade?.url || '').trim();
    if (!url || isFilingRecord(trade)) continue;
    if (!counts.has(url)) counts.set(url, new Map());
    const bySource = counts.get(url);
    const source = trade.source || '';
    bySource.set(source, (bySource.get(source) || 0) + 1);
  }

  const winner = new Map();
  for (const [url, bySource] of counts) {
    let best = null;
    for (const [source, count] of bySource) {
      const rank = TRADE_SOURCE_PRIORITY.indexOf(source);
      const order = rank === -1 ? TRADE_SOURCE_PRIORITY.length : rank;
      if (!best || count > best.count || (count === best.count && order < best.order)) {
        best = { source, count, order };
      }
    }
    if (best) winner.set(url, best.source);
  }

  const stats = { dateRepaired: 0, futureDropped: 0, duplicateDropped: 0, disclosureFilled: 0 };
  const kept = [];

  for (const trade of rows) {
    const url = String(trade?.url || '').trim();

    if (url && !isFilingRecord(trade) && winner.get(url) !== (trade.source || '')) {
      stats.duplicateDropped++;
      continue;
    }

    const filed = url ? filingDates.get(url) : null;
    const { date, repaired } = reconcileTransactionDate(trade.transactionDate, filed);
    if (repaired) stats.dateRepaired++;

    if (date && date > today) {
      stats.futureDropped++;
      continue;
    }

    let disclosureDate = normalizeFinanceDate(trade.disclosureDate);
    if (filed && !isFilingRecord(trade) && (!disclosureDate || disclosureDate === normalizeFinanceDate(trade.transactionDate))) {
      disclosureDate = filed;
      stats.disclosureFilled++;
    }

    kept.push({
      ...trade,
      transactionDate: date || trade.transactionDate || '',
      disclosureDate: disclosureDate || date || '',
      ...(repaired ? { dateRepaired: true } : {}),
    });
  }

  return { trades: kept, stats };
}

export function tradeDisclosureUrl(trade) {
  return trade?.url || trade?.ptr_link || trade?.doc_url || null;
}

export function tickerQuoteUrl(ticker) {
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!symbol || symbol === '--') return null;
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
}

export function mapKadoaTrade(row, filer) {
  const chamber = filer?.chamber === 'senate' ? 'Senate' : 'House';
  return {
    chamber,
    member: filer?.full_name || row.filer_name || '',
    ticker: row.ticker || '',
    assetDescription: row.asset_name || '',
    type: row.transaction_type || '',
    amount: row.amount_range_label || '',
    transactionDate: normalizeFinanceDate(row.transaction_date),
    disclosureDate: normalizeFinanceDate(row.filing_date || row.notification_date),
    district: '',
    party: filer?.party || row.party || '',
    state: filer?.state || row.state || '',
    owner: row.owner || '',
    url: row.doc_url || '',
    source: 'kadoa',
  };
}
