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
