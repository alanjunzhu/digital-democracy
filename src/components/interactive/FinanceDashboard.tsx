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

function partyColor(party: string) {
  const lower = (party || '').toLowerCase();
  if (lower.startsWith('d')) return 'text-blue-700';
  if (lower.startsWith('r')) return 'text-red-700';
  return 'text-purple-700';
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
    <div className="space-y-8">
      {/* Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Members trading" value={overview.membersWithTrades} sub={`of ${overview.totalMembers}`} />
        <StatCard label="Total trades" value={overview.totalTrades} />
        <StatCard label="Committee overlap flags" value={overview.highSeverityFlags} accent="red" />
        <StatCard label="Overlap trades" value={overview.overlapTrades} accent="amber" />
      </div>

      <p className="text-xs text-gray-500">
        Last updated {overview.lastUpdated ? new Date(overview.lastUpdated).toLocaleDateString() : '—'}
        {overview.source ? ` · Sources: ${overview.source}` : ''}.
        Overlap flags mark trades in sectors related to a member&apos;s committee assignments — not proof of wrongdoing.
      </p>

      {/* Flagged members */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Potential insider-information conflicts</h2>
        <p className="text-xs text-gray-500 mb-4">
          Members with stock trades in sectors tied to their committee work ({flaggedMembers.length} flagged).
        </p>
        {flaggedMembers.length === 0 ? (
          <p className="text-sm text-gray-500">No committee overlap flags in the current dataset.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 text-xs">
                  <th className="text-left py-2 font-medium">Member</th>
                  <th className="text-left py-2 font-medium">Chamber</th>
                  <th className="text-left py-2 font-medium">Overlap sectors</th>
                  <th className="text-right py-2 font-medium">Overlap trades</th>
                  <th className="text-right py-2 font-medium">Total trades</th>
                </tr>
              </thead>
              <tbody>
                {flaggedMembers.slice(0, 30).map(row => (
                  <tr key={row.bioguideId} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2">
                      <a href={`${baseUrl}members/${row.bioguideId}/`} className={`font-medium hover:underline ${partyColor(row.party)}`}>
                        {row.name}
                      </a>
                      <div className="text-[10px] text-gray-400">{row.state}</div>
                    </td>
                    <td className="py-2 text-gray-600">{row.chamber}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {row.overlapSectors.map(s => (
                          <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-right font-semibold text-red-600">{row.overlapTradeCount}</td>
                    <td className="py-2 text-right text-gray-600">{row.totalTrades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Aggregate sectors */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Aggregate trading by sector</h2>
        <div className="space-y-2">
          {sectors.slice(0, 15).map(row => (
            <div key={row.sector} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-sm font-medium text-gray-800 w-28 shrink-0">{row.sector}</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${sectors[0]?.totalTrades ? (row.totalTrades / sectors[0].totalTrades) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-gray-600 w-16 text-right">{row.totalTrades} trades</span>
              <span className="text-xs text-gray-400 w-20 text-right">{row.memberCount} members</span>
              {row.overlapTrades > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 shrink-0">{row.overlapTrades} overlap</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Aggregate tickers */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Most traded stocks (aggregate)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left py-2 font-medium">Ticker</th>
                <th className="text-left py-2 font-medium">Sector</th>
                <th className="text-right py-2 font-medium">Trades</th>
                <th className="text-right py-2 font-medium">Members</th>
                <th className="text-right py-2 font-medium">Overlap</th>
                <th className="text-right py-2 font-medium">Quote</th>
              </tr>
            </thead>
            <tbody>
              {tickers.slice(0, 25).map(row => {
                const quoteUrl = tickerQuoteUrl(row.ticker);
                return (
                  <tr key={row.ticker} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1.5 font-mono font-semibold text-blue-700">{row.ticker}</td>
                    <td className="py-1.5 text-gray-600">{row.sector || '—'}</td>
                    <td className="py-1.5 text-right">{row.totalTrades}</td>
                    <td className="py-1.5 text-right">{row.memberCount}</td>
                    <td className="py-1.5 text-right">
                      {row.overlapTrades > 0 ? (
                        <span className="text-red-600 font-medium">{row.overlapTrades}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {quoteUrl ? (
                        <a href={quoteUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">Yahoo</a>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Individual trades */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Individual stock trades</h2>
        <p className="text-xs text-gray-500 mb-4">{filteredTrades.length.toLocaleString()} trades matching filters</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <input
            type="text"
            placeholder="Search member, ticker, sector..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 text-sm px-3 py-2"
          />
          <select value={chamber} onChange={e => { setChamber(e.target.value); setPage(1); }} className="rounded-md border border-gray-300 text-sm px-3 py-2">
            <option value="all">All chambers</option>
            <option value="House">House</option>
            <option value="Senate">Senate</option>
          </select>
          <select value={party} onChange={e => { setParty(e.target.value); setPage(1); }} className="rounded-md border border-gray-300 text-sm px-3 py-2">
            <option value="all">All parties</option>
            <option value="Democratic">Democratic</option>
            <option value="Republican">Republican</option>
            <option value="Independent">Independent</option>
          </select>
          <select value={sector} onChange={e => { setSector(e.target.value); setPage(1); }} className="rounded-md border border-gray-300 text-sm px-3 py-2">
            <option value="all">All sectors</option>
            {sectorOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 px-1">
            <input
              type="checkbox"
              checked={overlapOnly}
              onChange={e => { setOverlapOnly(e.target.checked); setPage(1); }}
            />
            Committee overlap only
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left py-2 font-medium">Date</th>
                <th className="text-left py-2 font-medium">Member</th>
                <th className="text-left py-2 font-medium">Ticker</th>
                <th className="text-left py-2 font-medium">Sector</th>
                <th className="text-left py-2 font-medium">Type</th>
                <th className="text-right py-2 font-medium">Amount</th>
                <th className="text-right py-2 font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {pageTrades.map((t, i) => {
                const quoteUrl = tickerQuoteUrl(t.ticker);
                const filingUrl = tradeDisclosureUrl(t);
                return (
                  <tr key={`${t.bioguideId}-${t.ticker}-${t.transactionDate}-${i}`} className={`border-b border-gray-50 hover:bg-gray-50 ${t.committeeOverlap ? 'bg-red-50/40' : ''}`}>
                    <td className="py-1.5 text-gray-500 whitespace-nowrap">{t.transactionDate || t.disclosureDate || '—'}</td>
                    <td className="py-1.5">
                      <a href={`${baseUrl}members/${t.bioguideId}/`} className={`hover:underline ${partyColor(t.party || '')}`}>{t.memberName}</a>
                      {t.committeeOverlap && (
                        <div className="text-[10px] text-red-600">Committee overlap</div>
                      )}
                    </td>
                    <td className="py-1.5 font-mono font-semibold">
                      {quoteUrl ? (
                        <a href={quoteUrl} target="_blank" rel="noopener" className="text-blue-700 hover:underline">{t.ticker}</a>
                      ) : (t.ticker || '—')}
                    </td>
                    <td className="py-1.5 text-gray-600">{t.sector || '—'}</td>
                    <td className="py-1.5">{t.type || '—'}</td>
                    <td className="py-1.5 text-right text-gray-600 whitespace-nowrap">{t.amount || '—'}</td>
                    <td className="py-1.5 text-right whitespace-nowrap space-x-2">
                      {filingUrl && (
                        <a href={filingUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">Filing</a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-gray-500">Page {currentPage} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40"
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

function StatCard({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: 'red' | 'amber' }) {
  const color = accent === 'red' ? 'text-red-600' : accent === 'amber' ? 'text-amber-600' : 'text-gray-900';
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-[10px] text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}
