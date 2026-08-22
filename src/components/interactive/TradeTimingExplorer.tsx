import { useState } from 'react';
import TradeTimingInsight from './TradeTimingInsight';

interface Candidate {
  bioguideId: string;
  memberName: string;
  ticker?: string;
  type?: string;
  transactionDate?: string;
  disclosureDate?: string;
  amount?: string;
  assetDescription?: string;
  sector?: string;
  url?: string;
  context: Record<string, unknown>;
  priorityScore?: number;
  precomputed?: { prices?: { date: string; close: number }[]; counterfactuals?: unknown } | null;
}

interface Props {
  candidates: Candidate[];
  baseUrl: string;
}

export default function TradeTimingExplorer({ candidates, baseUrl }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (!candidates.length) {
    return (
      <p className="text-sm text-gray-500">No committee-overlap trades available for timing analysis.</p>
    );
  }

  return (
    <div className="space-y-3">
      {candidates.map((c) => {
        const key = `${c.bioguideId}|${c.ticker}|${c.transactionDate}|${c.type}`;
        const isOpen = openKey === key;
        return (
          <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : key)}
              className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center gap-3"
            >
              <span className="font-mono text-sm font-semibold text-blue-700">{c.ticker}</span>
              <span className="text-xs text-gray-600">{c.type}</span>
              <span className="text-xs text-gray-500">{c.transactionDate}</span>
              <span className="text-xs text-gray-700 flex-1 truncate">{c.memberName}</span>
              {c.sector && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">{c.sector}</span>
              )}
              <span className="text-[10px] text-blue-600">{isOpen ? 'Hide' : 'Analyze timing'}</span>
            </button>
            {isOpen && (
              <div className="p-3 border-t border-gray-200">
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
