import { useMemo, useState } from 'react';
import { tickerQuoteUrl, tradeDisclosureUrl } from '../../../shared/finance-sources.mjs';

interface TradeRow {
  bioguideId: string;
  memberName: string;
  ticker?: string;
  assetDescription?: string;
  type?: string;
  amount?: string;
  sector?: string;
  chamber?: string;
  party?: string;
  state?: string;
  transactionDate?: string;
  disclosureDate?: string;
  url?: string;
  committeeOverlap?: boolean;
  relatedCommittees?: string[];
}

interface FlaggedMember {
  bioguideId: string;
  name: string;
  party: string;
  chamber: string;
  state: string;
  totalTrades: number;
  highSeverityFlags: number;
  overlapSectors: string[];
  overlapTradeCount: number;
}

interface SectorRow {
  sector: string;
  totalTrades: number;
  purchases: number;
  sales: number;
  memberCount: number;
  overlapTrades: number;
  overlapMembers: number;
}

interface TickerRow {
  ticker: string;
  sector?: string | null;
  totalTrades: number;
  purchases: number;
  sales: number;
  memberCount: number;
  overlapTrades: number;
}

interface Overview {
  totalMembers: number;
  membersWithTrades: number;
  totalTrades: number;
  highSeverityFlags: number;
  mediumSeverityFlags: number;
  overlapTrades: number;
  lastUpdated?: string | null;
  source?: string | null;
}

interface Props {
  overview: Overview;
  flaggedMembers: FlaggedMember[];
  sectors: SectorRow[];
  tickers: TickerRow[];
  trades: TradeRow[];
  baseUrl: string;
}

const PAGE_SIZE = 25;

function partyTextColor(party: string) {
  const lower = (party || '').toLowerCase();
  if (lower.startsWith('d')) return 'text-dem';
  if (lower.startsWith('r')) return 'text-rep';
  return 'text-ind';
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="flex-1 min-w-[140px] px-5 py-4 border-r border-rule last:border-r-0">
      <div className="field-label">{label}</div>
      <div className="font-serif text-2xl font-medium tabular mt-2">{value.toLocaleString()}</div>
      {sub && <div className="text-[11px] text-ink-3 mt-1">{sub}</div>}
    </div>
  );
}

export default function FinanceDashboard({
  overview,
  flaggedMembers,
  sectors,
  tickers,
  trades,
  baseUrl,
}: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState('all');
  const [party, setParty] = useState('all');
  const [sector, setSector] = useState('all');
  const [overlapOnly, setOverlapOnly] = useState(false);
  const [page, setPage] = useState(1);

  const sectorOptions = useMemo(
    () => [...new Set(trades.map(t => t.sector).filter(Boolean))].sort() as string[],
    [trades],
  );

  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      if (overlapOnly && !t.committeeOverlap) return false;
      if (chamber !== 'all' && t.chamber !== chamber) return false;
      if (party !== 'all' && t.party !== party) return false;
      if (sector !== 'all' && t.sector !== sector) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [
          t.memberName,
          t.ticker,
          t.assetDescription,
          t.sector,
          t.state,
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [trades, search, chamber, party, sector, overlapOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageTrades = filteredTrades.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      {/* Overview */}
      <div id="trading-overview" data-page-section className="flex flex-wrap items-stretch border border-rule bg-card mt-6">
        <StatCard label="Members trading" value={overview.membersWithTrades} sub={`of ${overview.totalMembers}`} />
        <StatCard label="Total trades" value={overview.totalTrades} />
        <StatCard label="Committee overlap flags" value={overview.highSeverityFlags} />
        <StatCard label="Overlap trades" value={overview.overlapTrades} />
      </div>

      <p className="font-mono text-[10.5px] leading-[1.6] text-ink-3 border-l-2 border-rule pl-3 mt-4">
        Last updated {overview.lastUpdated ? new Date(overview.lastUpdated).toLocaleDateString() : '—'}
        {overview.source ? ` · Sources: ${overview.source}` : ''}.
        Overlap flags mark trades in sectors related to a member&apos;s committee assignments — not proof of wrongdoing.
      </p>

      {/* Flagged members */}
      <section id="flagged-members" data-page-section className="pt-8">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-1">Potential insider-information conflicts</h2>
        <p className="text-[12.5px] text-ink-3 mb-4">
          Members with stock trades in sectors tied to their committee work ({flaggedMembers.length} flagged).
        </p>
        {flaggedMembers.length === 0 ? (
          <p className="text-[13px] text-ink-3">No committee overlap flags in the current dataset.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-ink">
                  <th className="text-left py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Member</th>
                  <th className="text-left py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Chamber</th>
                  <th className="text-left py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Overlap sectors</th>
                  <th className="text-right py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Overlap trades</th>
                  <th className="text-right py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Total trades</th>
                </tr>
              </thead>
              <tbody>
                {flaggedMembers.slice(0, 30).map(row => (
                  <tr key={row.bioguideId} className="border-b border-rule">
                    <td className="py-[7px]">
                      <a href={`${baseUrl}members/${row.bioguideId}/`} className={`font-medium hover:underline ${partyTextColor(row.party)}`}>
                        {row.name}
                      </a>
                      <div className="font-mono text-[10px] text-ink-3">{row.state}</div>
                    </td>
                    <td className="py-[7px] font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3">{row.chamber}</td>
                    <td className="py-[7px]">
                      <div className="flex flex-wrap gap-[6px]">
                        {row.overlapSectors.map(s => (
                          <span key={s} className="font-mono text-[10px] tracking-[0.06em] uppercase text-accent border border-accent rounded px-[6px] py-[1px]">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-[7px] text-right font-mono font-semibold text-accent tabular">{row.overlapTradeCount}</td>
                    <td className="py-[7px] text-right font-mono text-ink-2 tabular">{row.totalTrades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Aggregate sectors */}
      <section id="trading-by-sector" data-page-section className="pt-8">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-5">Aggregate trading by sector</h2>
        <div>
          {sectors.slice(0, 15).map(row => (
            <div key={row.sector} className="flex items-center gap-3 py-[9px] border-b border-rule last:border-0">
              <span className="text-[13.5px] text-ink w-32 shrink-0 truncate">{row.sector}</span>
              <span className="flex-1 flex h-1 bg-rule">
                <span className="h-full bg-ink" style={{ width: `${row.totalTrades ? (row.purchases / row.totalTrades) * 100 : 0}%` }} />
                <span className="h-full bg-ink-3" style={{ width: `${row.totalTrades ? (row.sales / row.totalTrades) * 100 : 0}%` }} />
              </span>
              <span className="font-mono text-[11.5px] text-ink-3 w-16 text-right tabular">{row.purchases} / {row.sales}</span>
              {row.overlapTrades > 0 && (
                <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-accent shrink-0">Committee overlap</span>
              )}
            </div>
          ))}
        </div>
        <p className="font-mono text-[10.5px] text-ink-3 mt-3">
          Solid = purchases &middot; grey = sales. Bar length is trade count against the busiest sector, not dollar value.
        </p>
      </section>

      {/* Aggregate tickers */}
      <section id="most-traded-stocks" data-page-section className="pt-8">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-5">Most traded stocks (aggregate)</h2>
        <div>
          {tickers.slice(0, 25).map(row => {
            const quoteUrl = tickerQuoteUrl(row.ticker);
            return (
              <div key={row.ticker} className="grid grid-cols-[64px_minmax(0,1fr)_60px] gap-3 items-center py-[9px] border-b border-rule last:border-0">
                {quoteUrl ? (
                  <a href={quoteUrl} target="_blank" rel="noopener" className="font-mono text-[12px] font-medium text-accent hover:underline">{row.ticker}</a>
                ) : (
                  <span className="font-mono text-[12px] font-medium text-accent">{row.ticker}</span>
                )}
                <span className="flex items-center gap-2 min-w-0">
                  <span className="flex-1 h-1 bg-rule">
                    <span className="block h-full bg-ink" style={{ width: `${(row.totalTrades / (tickers[0]?.totalTrades || 1)) * 100}%` }} />
                  </span>
                  {row.overlapTrades > 0 && (
                    <span className="font-mono text-[9.5px] tracking-[0.06em] uppercase text-accent shrink-0">overlap</span>
                  )}
                </span>
                <span className="font-mono text-[11.5px] text-ink-2 text-right tabular">{row.totalTrades}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Individual trades */}
      <section id="individual-trades" data-page-section className="pt-8">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-1">Individual stock trades</h2>
        <p className="font-mono text-[11px] text-ink-3 mb-4">{filteredTrades.length.toLocaleString()} trades matching filters</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-rule">
          <label className="block py-[14px] pr-5 lg:border-r border-rule">
            <span className="field-label block mb-[6px]">Search</span>
            <input
              type="text"
              placeholder="Member, ticker, sector…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full box-border appearance-none bg-transparent border-none p-0 text-[15px] focus:outline-none placeholder:text-ink-3"
            />
          </label>
          <label className="block py-[14px] px-5 lg:border-r border-rule">
            <span className="field-label block mb-[6px]">Chamber</span>
            <select value={chamber} onChange={e => { setChamber(e.target.value); setPage(1); }} className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none">
              <option value="all">All chambers</option>
              <option value="House">House</option>
              <option value="Senate">Senate</option>
            </select>
          </label>
          <label className="block py-[14px] px-5 lg:border-r border-rule">
            <span className="field-label block mb-[6px]">Party</span>
            <select value={party} onChange={e => { setParty(e.target.value); setPage(1); }} className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none">
              <option value="all">All parties</option>
              <option value="Democratic">Democratic</option>
              <option value="Republican">Republican</option>
              <option value="Independent">Independent</option>
            </select>
          </label>
          <label className="block py-[14px] pl-5">
            <span className="field-label block mb-[6px]">Sector</span>
            <select value={sector} onChange={e => { setSector(e.target.value); setPage(1); }} className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none">
              <option value="all">All sectors</option>
              {sectorOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 font-mono text-[11px] text-ink-2 py-3">
          <input
            type="checkbox"
            checked={overlapOnly}
            onChange={e => { setOverlapOnly(e.target.checked); setPage(1); }}
          />
          Committee overlap only
        </label>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-ink">
                <th className="text-left py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Date</th>
                <th className="text-left py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Member</th>
                <th className="text-left py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Ticker</th>
                <th className="text-left py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Sector</th>
                <th className="text-left py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Type</th>
                <th className="text-right py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Amount</th>
                <th className="text-right py-2 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Links</th>
              </tr>
            </thead>
            <tbody>
              {pageTrades.map((t, i) => {
                const quoteUrl = tickerQuoteUrl(t.ticker);
                const filingUrl = tradeDisclosureUrl(t);
                return (
                  <tr
                    key={`${t.bioguideId}-${t.ticker}-${t.transactionDate}-${i}`}
                    className={`border-b border-rule ${t.committeeOverlap ? 'border-l-2 border-l-accent' : ''}`}
                  >
                    <td className="py-[6px] font-mono text-ink-3 whitespace-nowrap tabular">{t.transactionDate || t.disclosureDate || '—'}</td>
                    <td className="py-[6px]">
                      <a href={`${baseUrl}members/${t.bioguideId}/`} className={`hover:underline ${partyTextColor(t.party || '')}`}>{t.memberName}</a>
                      {t.committeeOverlap && (
                        <div className="font-mono text-[10px] text-accent">Committee overlap</div>
                      )}
                    </td>
                    <td className="py-[6px] font-mono font-medium">
                      {quoteUrl ? (
                        <a href={quoteUrl} target="_blank" rel="noopener" className="text-accent hover:underline">{t.ticker}</a>
                      ) : (t.ticker || '—')}
                    </td>
                    <td className="py-[6px] text-ink-2">{t.sector || '—'}</td>
                    <td className="py-[6px] text-ink-2">{t.type || '—'}</td>
                    <td className="py-[6px] text-right text-ink-2 whitespace-nowrap font-mono tabular">{t.amount || '—'}</td>
                    <td className="py-[6px] text-right whitespace-nowrap">
                      {filingUrl && (
                        <a href={filingUrl} target="_blank" rel="noopener" className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent hover:underline">Filing</a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="font-mono text-[11px] text-ink-3">Page {currentPage} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="appearance-none bg-transparent px-3 py-1 rounded border border-rule font-mono text-[11px] tracking-[0.06em] uppercase text-ink-2 hover:border-ink-3 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="appearance-none bg-transparent px-3 py-1 rounded border border-rule font-mono text-[11px] tracking-[0.06em] uppercase text-ink-2 hover:border-ink-3 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
