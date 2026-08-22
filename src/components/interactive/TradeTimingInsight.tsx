import { useEffect, useMemo, useState } from 'react';
import {
  buildYahooChartUrl,
  parseYahooChartPayload,
  slicePriceWindow,
  addDays,
} from '../../../shared/stock-prices.mjs';
import {
  computeCounterfactuals,
  DEFAULT_HORIZON_DAYS,
} from '../../../shared/trade-timing.mjs';
import { tradeDisclosureUrl, tickerQuoteUrl } from '../../../shared/finance-sources.mjs';

type TradeContext = {
  memberName?: string;
  bioguideId?: string;
  ticker?: string;
  type?: string;
  amount?: string;
  sector?: string | null;
  transactionDate?: string | null;
  disclosureDate?: string | null;
  disclosureLagDays?: number | null;
  committeeOverlap?: boolean;
  relatedCommittees?: string[];
  allCommittees?: string[];
  committeeSectors?: string[];
  nearbyBills?: { billId: string; title?: string; introducedDate?: string; type?: string; number?: number }[];
  filingUrl?: string | null;
};

interface PrecomputedTiming {
  prices?: { date: string; close: number }[];
  counterfactuals?: ReturnType<typeof computeCounterfactuals>;
}

interface Props {
  trade: {
    ticker?: string;
    type?: string;
    transactionDate?: string;
    disclosureDate?: string;
    amount?: string;
    assetDescription?: string;
    bioguideId?: string;
  };
  context: TradeContext;
  baseUrl?: string;
  precomputed?: PrecomputedTiming | null;
  compact?: boolean;
}

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function barColor(value: number | null, kind: 'actual' | 'inaction' | 'alt') {
  if (value == null) return 'bg-gray-300';
  if (kind === 'actual') return value >= 0 ? 'bg-blue-600' : 'bg-blue-400';
  if (kind === 'inaction') return value >= 0 ? 'bg-gray-500' : 'bg-gray-400';
  return value >= 0 ? 'bg-amber-500' : 'bg-amber-400';
}

export default function TradeTimingInsight({
  trade,
  context,
  baseUrl = '/',
  precomputed = null,
  compact = false,
}: Props) {
  const [loading, setLoading] = useState(!precomputed?.counterfactuals);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState(precomputed?.prices || []);
  const [counterfactuals, setCounterfactuals] = useState(precomputed?.counterfactuals || null);

  useEffect(() => {
    if (precomputed?.counterfactuals) {
      setCounterfactuals(precomputed.counterfactuals);
      setPrices(precomputed.prices || []);
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const tx = trade.transactionDate;
        if (!tx || !trade.ticker) throw new Error('Missing trade date or ticker');

        const end = addDays(tx, DEFAULT_HORIZON_DAYS + 45);
        const url = buildYahooChartUrl(trade.ticker, addDays(tx, -60) || tx, end || tx);
        if (!url) throw new Error('Could not build price URL');

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Price data unavailable (${res.status})`);
        const payload = await res.json();
        const series = parseYahooChartPayload(payload);
        if (!series.length) throw new Error('No price history returned');

        const result = computeCounterfactuals(trade, series, DEFAULT_HORIZON_DAYS);
        if (!result.ok) throw new Error(result.reason || 'Could not analyze timing');

        if (!cancelled) {
          setPrices(series);
          setCounterfactuals(result);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load timing data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [trade, precomputed]);

  const chartWindow = useMemo(() => {
    if (!trade.transactionDate || !prices.length) return [];
    const start = addDays(trade.transactionDate, -30);
    const end = addDays(trade.transactionDate, DEFAULT_HORIZON_DAYS + 15);
    if (!start || !end) return prices;
    return slicePriceWindow(prices, start, end);
  }, [prices, trade.transactionDate]);

  const scenarioEntries = useMemo(() => {
    if (!counterfactuals?.ok || !counterfactuals.scenarios) return [];
    const scenarios = counterfactuals.scenarios as {
      actual: number | null;
      earlier30: number | null;
      later30: number | null;
      inaction: number | null;
      labels: Record<string, string>;
    };
    const labels = scenarios.labels;
    return [
      { key: 'actual', label: labels.actual, value: scenarios.actual, kind: 'actual' as const },
      { key: 'earlier30', label: labels.earlier30, value: scenarios.earlier30, kind: 'alt' as const },
      { key: 'later30', label: labels.later30, value: scenarios.later30, kind: 'alt' as const },
      { key: 'inaction', label: labels.inaction, value: scenarios.inaction, kind: 'inaction' as const },
    ].filter((s) => s.value != null);
  }, [counterfactuals]);

  const maxAbs = useMemo(() => {
    const vals = scenarioEntries.map((s) => Math.abs(s.value ?? 0));
    return Math.max(10, ...vals, 1);
  }, [scenarioEntries]);

  const quoteUrl = tickerQuoteUrl(trade.ticker);
  const filingUrl = tradeDisclosureUrl(trade);

  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {quoteUrl ? (
              <a href={quoteUrl} target="_blank" rel="noopener" className="font-mono text-sm font-semibold text-blue-700 hover:underline">
                {trade.ticker}
              </a>
            ) : (
              <span className="font-mono text-sm font-semibold">{trade.ticker}</span>
            )}
            <span className="text-xs text-gray-500">{trade.type} · {trade.transactionDate}</span>
            {trade.amount && <span className="text-xs text-gray-600">{trade.amount}</span>}
          </div>
          {context.memberName && context.bioguideId && (
            <a href={`${baseUrl}members/${context.bioguideId}/`} className="text-xs text-blue-600 hover:underline">
              {context.memberName}
            </a>
          )}
        </div>
        {counterfactuals?.summary && (
          <p className="text-[11px] text-gray-600 max-w-md">{counterfactuals.summary}</p>
        )}
      </div>

      {/* Context panel */}
      <div className="mb-4 rounded-md bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-700 space-y-2">
        <div className="font-semibold text-gray-800">Context</div>
        {context.sector && (
          <div>
            <span className="text-gray-500">Sector:</span> {context.sector}
            {context.committeeOverlap && (
              <span className="ml-2 text-red-700 font-medium">Committee overlap</span>
            )}
          </div>
        )}
        {context.relatedCommittees && context.relatedCommittees.length > 0 && (
          <div>
            <span className="text-gray-500">Related committees:</span>{' '}
            {context.relatedCommittees.join(', ')}
          </div>
        )}
        {context.disclosureLagDays != null && (
          <div>
            <span className="text-gray-500">Disclosure lag:</span>{' '}
            {context.disclosureLagDays} days
            {context.disclosureLagDays > 30 && (
              <span className="ml-1 text-amber-700">(public learned late)</span>
            )}
          </div>
        )}
        {context.nearbyBills && context.nearbyBills.length > 0 && (
          <div>
            <span className="text-gray-500">Legislation within 30 days:</span>
            <ul className="mt-1 list-disc list-inside">
              {context.nearbyBills.slice(0, 3).map((b) => (
                <li key={b.billId}>
                  {baseUrl ? (
                    <a href={`${baseUrl}bills/${b.billId}/`} className="text-blue-600 hover:underline">
                      {b.type} {b.number}
                    </a>
                  ) : (
                    <span>{b.type} {b.number}</span>
                  )}
                  {' '}({b.introducedDate})
                </li>
              ))}
            </ul>
          </div>
        )}
        {filingUrl && (
          <div>
            <a href={filingUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">View official filing</a>
          </div>
        )}
        <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-200">
          Unusual timing or committee overlap raises questions — it is not proof of insider trading or wrongdoing.
        </p>
      </div>

      {loading && <p className="text-xs text-gray-500">Loading price history and counterfactuals…</p>}
      {error && (
        <p className="text-xs text-amber-700">
          Chart unavailable: {error}. Context above still applies.
        </p>
      )}

      {counterfactuals?.ok && (
        <>
          {/* Price sparkline */}
          {chartWindow.length > 1 && (
            <div className="mb-4">
              <div className="text-[10px] text-gray-500 mb-1">Stock price around trade ({DEFAULT_HORIZON_DAYS}d window)</div>
              <svg viewBox="0 0 320 80" className="w-full h-20 bg-gray-50 rounded border border-gray-100">
                {(() => {
                  const closes = chartWindow.map((p: { close: number }) => p.close);
                  const min = Math.min(...closes);
                  const max = Math.max(...closes);
                  const span = max - min || 1;
                  const points = chartWindow.map((p: { close: number }, i: number) => {
                    const x = (i / (chartWindow.length - 1)) * 300 + 10;
                    const y = 70 - ((p.close - min) / span) * 60;
                    return `${x},${y}`;
                  }).join(' ');
                  const tradeIdx = chartWindow.findIndex((p: { date: string }) => p.date >= (trade.transactionDate || ''));
                  const txX = tradeIdx >= 0 ? (tradeIdx / (chartWindow.length - 1)) * 300 + 10 : 160;
                  return (
                    <>
                      <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={points} />
                      <line x1={txX} y1="5" x2={txX} y2="75" stroke="#ef4444" strokeDasharray="4 2" strokeWidth="1.5" />
                      <text x={txX + 4} y="12" fontSize="8" fill="#ef4444">trade</text>
                    </>
                  );
                })()}
              </svg>
            </div>
          )}

          {/* Counterfactual bars */}
          <div className="space-y-2">
            <div className="text-[10px] text-gray-500">
              {DEFAULT_HORIZON_DAYS}-day outcome comparison (actual vs alternative timing vs do nothing)
            </div>
            {scenarioEntries.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600 w-28 shrink-0 truncate" title={s.label}>{s.label}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden relative">
                  <div
                    className={`h-full ${barColor(s.value, s.kind)}`}
                    style={{ width: `${Math.min(100, (Math.abs(s.value ?? 0) / maxAbs) * 100)}%` }}
                  />
                </div>
                <span className={`text-[10px] font-semibold w-12 text-right ${ (s.value ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {fmtPct(s.value)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-[10px]">
            {counterfactuals.actionAdvantage != null && (
              <span className={`px-2 py-1 rounded ${counterfactuals.actionAdvantage > 0 ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                Action vs inaction: {fmtPct(counterfactuals.actionAdvantage)}
              </span>
            )}
            {counterfactuals.timingAdvantage != null && (
              <span className={`px-2 py-1 rounded ${counterfactuals.timingAdvantage > 0 ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                Timing vs alternatives: {fmtPct(counterfactuals.timingAdvantage)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
