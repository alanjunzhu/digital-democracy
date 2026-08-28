import { useMemo } from 'react';
import { slicePriceWindow, addDays } from '../../../shared/stock-prices.mjs';
import { DEFAULT_HORIZON_DAYS } from '../../../shared/trade-timing.mjs';
import type { PrecomputedTiming, PricePoint } from '../../lib/types';
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

// Gains never turn green, losses never turn red: kind marks the series
// (what actually happened vs. an alternative vs. doing nothing), not the sign.
function barColor(kind: 'actual' | 'inaction' | 'alt') {
  if (kind === 'actual') return 'var(--ink)';
  if (kind === 'inaction') return 'var(--ink-3)';
  return 'var(--navy)';
}

export default function TradeTimingInsight({
  trade,
  context,
  baseUrl = '/',
  precomputed = null,
}: Props) {
  // Everything is precomputed at build time. The site is a static build and
  // Yahoo's chart endpoint sends no CORS headers, so fetching price history
  // from the browser fails for every visitor — scripts/fetch-stock-prices.mjs
  // caches the series and scripts/enrich-trade-timing.mjs derives the
  // counterfactuals ahead of the build instead.
  const prices = precomputed?.prices || [];
  const counterfactuals = precomputed?.counterfactuals || null;

  const chartWindow = useMemo(() => {
    if (!trade.transactionDate || !prices.length) return [];
    const start = addDays(trade.transactionDate, -30);
    const end = addDays(trade.transactionDate, DEFAULT_HORIZON_DAYS + 15);
    if (!start || !end) return prices;
    return slicePriceWindow(prices, start, end);
  }, [prices, trade.transactionDate]);

  const scenarioEntries = useMemo(() => {
    if (!counterfactuals?.ok || !counterfactuals.scenarios) return [];
    const scenarios = counterfactuals.scenarios;
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

  const sparkline = useMemo(() => {
    if (chartWindow.length < 2) return null;
    const closes = chartWindow.map((p: PricePoint) => p.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    const points = chartWindow.map((p: PricePoint, i: number) => {
      const x = (i / (chartWindow.length - 1)) * 300 + 10;
      const y = 70 - ((p.close - min) / span) * 60;
      return `${x},${y}`;
    }).join(' ');
    const tradeIdx = chartWindow.findIndex((p: PricePoint) => p.date >= (trade.transactionDate || ''));
    const txX = tradeIdx >= 0 ? (tradeIdx / (chartWindow.length - 1)) * 300 + 10 : 160;
    return { points, txX };
  }, [chartWindow, trade.transactionDate]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {quoteUrl ? (
              <a href={quoteUrl} target="_blank" rel="noopener" className="font-mono text-[13px] font-medium text-accent hover:underline">
                {trade.ticker}
              </a>
            ) : (
              <span className="font-mono text-[13px] font-medium">{trade.ticker}</span>
            )}
            <span className="font-mono text-[11px] text-ink-3">{trade.type} &middot; {trade.transactionDate}</span>
            {trade.amount && <span className="font-mono text-[11px] text-ink-2 tabular">{trade.amount}</span>}
          </div>
          {context.memberName && context.bioguideId && (
            <a href={`${baseUrl}members/${context.bioguideId}/`} className="text-[12px] text-accent hover:underline">
              {context.memberName}
            </a>
          )}
        </div>
        {counterfactuals?.summary && (
          <p className="text-[11.5px] text-ink-2 max-w-md">{counterfactuals.summary}</p>
        )}
      </div>

      {/* Context panel */}
      <div className="border-l-2 border-rule pl-3 mb-4 text-[12px] leading-[1.6] text-ink-2 space-y-[6px]">
        <div className="field-label">Context</div>
        {context.sector && (
          <div>
            <span className="text-ink-3">Sector:</span> {context.sector}
            {context.committeeOverlap && (
              <span className="ml-2 text-accent font-medium">Committee overlap</span>
            )}
          </div>
        )}
        {context.relatedCommittees && context.relatedCommittees.length > 0 && (
          <div>
            <span className="text-ink-3">Related committees:</span>{' '}
            {context.relatedCommittees.join(', ')}
          </div>
        )}
        {context.disclosureLagDays != null && (
          <div>
            <span className="text-ink-3">Disclosure lag:</span>{' '}
            {context.disclosureLagDays} days
            {context.disclosureLagDays > 30 && (
              <span className="ml-1 text-ink-3">(public learned late)</span>
            )}
          </div>
        )}
        {context.nearbyBills && context.nearbyBills.length > 0 && (
          <div>
            <span className="text-ink-3">Legislation within 30 days:</span>
            <ul className="mt-1 list-disc list-inside">
              {context.nearbyBills.slice(0, 3).map((b) => (
                <li key={b.billId}>
                  {baseUrl ? (
                    <a href={`${baseUrl}bills/${b.billId}/`} className="text-accent hover:underline">
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
            <a href={filingUrl} target="_blank" rel="noopener" className="text-accent hover:underline">View official filing</a>
          </div>
        )}
        <p className="font-mono text-[10.5px] text-ink-3 pt-1">
          Unusual timing or committee overlap raises questions — it is not proof of insider trading or wrongdoing.
        </p>
      </div>

      {!counterfactuals?.ok && (
        <p className="font-mono text-[11px] text-ink-3 border-l-2 border-rule pl-3">
          No cached price history for {trade.ticker || 'this ticker'} yet, so the timing
          comparison is unavailable. The context above still applies.
        </p>
      )}

      {counterfactuals?.ok && counterfactuals.horizonComplete === false && (
        <p className="font-mono text-[10.5px] text-ink-3 border-l-2 border-rule pl-3 mb-3">
          This trade is still inside its {DEFAULT_HORIZON_DAYS}-day window
          {counterfactuals.lastPriceDate ? ` (prices through ${counterfactuals.lastPriceDate})` : ''},
          so the outcome comparison is incomplete.
        </p>
      )}

      {counterfactuals?.ok && (
        <>
          {/* Price sparkline */}
          {sparkline && (
            <div className="mb-4">
              <div className="field-label mb-1">Stock price around trade ({DEFAULT_HORIZON_DAYS}d window)</div>
              <div className="relative">
                <svg viewBox="0 0 320 80" preserveAspectRatio="none" className="w-full h-20 bg-rule-2">
                  <polyline fill="none" stroke="var(--ink)" strokeWidth="2" points={sparkline.points} vectorEffect="non-scaling-stroke" />
                  <line x1={sparkline.txX} y1="5" x2={sparkline.txX} y2="75" stroke="var(--accent)" strokeDasharray="4 2" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                </svg>
                <span
                  className="absolute top-[2px] font-mono text-[9px] text-accent -translate-x-1/2"
                  style={{ left: `${(sparkline.txX / 320) * 100}%` }}
                >
                  trade
                </span>
              </div>
            </div>
          )}

          {/* Counterfactual bars */}
          <div>
            <div className="field-label mb-2">
              {DEFAULT_HORIZON_DAYS}-day outcome comparison (actual vs alternative timing vs do nothing)
            </div>
            {scenarioEntries.map((s) => (
              <div key={s.key} className="flex items-center gap-3 py-[3px]">
                <span className="font-mono text-[10.5px] text-ink-3 w-28 shrink-0 truncate" title={s.label}>{s.label}</span>
                <div className="flex-1 h-1 bg-rule relative">
                  <div
                    className="h-full"
                    style={{ width: `${Math.min(100, (Math.abs(s.value ?? 0) / maxAbs) * 100)}%`, background: barColor(s.kind) }}
                  />
                </div>
                <span className="font-mono text-[11px] font-semibold text-ink w-12 text-right tabular">
                  {fmtPct(s.value)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10.5px] text-ink-2">
            {counterfactuals.actionAdvantage != null && (
              <span>Action vs inaction: <span className="tabular font-medium text-ink">{fmtPct(counterfactuals.actionAdvantage)}</span></span>
            )}
            {counterfactuals.timingAdvantage != null && (
              <span>Timing vs alternatives: <span className="tabular font-medium text-ink">{fmtPct(counterfactuals.timingAdvantage)}</span></span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
