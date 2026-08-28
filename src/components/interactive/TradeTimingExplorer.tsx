import { useState } from 'react';
import TradeTimingInsight from './TradeTimingInsight';
import type { PrecomputedTiming } from '../../lib/types';
import { normalizeOwner } from '../../../shared/portfolio-series.mjs';

interface Candidate {
  bioguideId: string;
  memberName: string;
  ticker?: string;
  type?: string;
  transactionDate?: string;
  disclosureDate?: string;
  amount?: string;
  assetDescription?: string;
  owner?: string;
  sector?: string;
  url?: string;
  context: Record<string, unknown>;
  priorityScore?: number;
  precomputed?: PrecomputedTiming | null;
}

interface Props {
  candidates: Candidate[];
  baseUrl: string;
}

function candidateKey(c: Candidate) {
  return `${c.bioguideId}|${c.ticker}|${c.transactionDate}|${c.type}`;
}

export default function TradeTimingExplorer({ candidates, baseUrl }: Props) {
  // Open the first chartable trade so the analysis is visible without a click —
  // a collapsed accordion reads as "there is no chart here".
  const [openKey, setOpenKey] = useState<string | null>(() => {
    const first = candidates.find((c) => c.precomputed?.counterfactuals);
    return first ? candidateKey(first) : null;
  });

  if (!candidates.length) {
    return (
      <p className="text-[13px] text-ink-3">No committee-overlap trades available for timing analysis.</p>
    );
  }

  return (
    <div>
      {candidates.map((c) => {
        const key = candidateKey(c);
        const isOpen = openKey === key;
        const chartable = Boolean(c.precomputed?.counterfactuals);
        return (
          <div key={key} className="border-b border-rule last:border-0">
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : key)}
              className="w-full appearance-none bg-transparent border-none text-left px-0 py-3 flex flex-wrap items-center gap-3 cursor-pointer"
            >
              <span className="font-mono text-[13px] font-medium text-accent">{c.ticker}</span>
              <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-ink-2">{c.type}</span>
              <span className="font-mono text-[11px] text-ink-3 tabular">{c.transactionDate}</span>
              {c.amount && <span className="font-mono text-[11px] text-ink-3 tabular hidden sm:inline">{c.amount}</span>}
              {normalizeOwner(c.owner) && (
                <span className="font-mono text-[10px] text-ink-3 border border-rule rounded px-[6px] py-[1px]">
                  {normalizeOwner(c.owner)}
                </span>
              )}
              <span className="text-[12.5px] text-ink-2 flex-1 truncate">{c.memberName}</span>
              {c.sector && (
                <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-accent border border-accent rounded px-[6px] py-[1px]">{c.sector}</span>
              )}
              <span className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-accent">
                {isOpen ? 'Hide' : chartable ? 'Analyze timing' : 'Details'}
              </span>
            </button>
            {isOpen && (
              <div className="pb-4">
                <TradeTimingInsight
                  trade={c}
                  context={c.context as any}
                  baseUrl={baseUrl}
                  precomputed={c.precomputed || null}
                  compact
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
