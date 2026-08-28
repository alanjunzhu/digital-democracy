import { useState, useMemo } from 'react';
import type { VoteSummary } from '../../lib/types';

interface Props {
  votes: VoteSummary[];
  baseUrl: string;
}

const AGREED_RESULTS = new Set(['Passed', 'Agreed to', 'Confirmed']);
const REJECTED_RESULTS = new Set(['Failed', 'Rejected', 'Not Sustained']);

export default function VoteFilter({ votes, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<string>('all');
  const [chamber, setChamber] = useState<string>('all');
  const [topic, setTopic] = useState<string>('all');

  // Extract unique topics with counts
  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of votes) {
      const t = (v as any).topic || 'Uncategorized';
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .filter(([name]) => name !== 'Uncategorized' && name !== 'Procedural');
  }, [votes]);

  const filtered = useMemo(() => {
    return votes.filter(v => {
      if (chamber !== 'all' && v.chamber !== chamber) return false;
      if (result === 'agreed' && !AGREED_RESULTS.has(v.result)) return false;
      if (result === 'rejected' && !REJECTED_RESULTS.has(v.result)) return false;
      if (topic !== 'all') {
        const vTopic = (v as any).topic || 'Uncategorized';
        if (vTopic !== topic) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const questionMatch = v.question.toLowerCase().includes(q);
        const billMatch = v.billId?.toLowerCase().includes(q);
        if (!questionMatch && !billMatch) return false;
      }
      return true;
    });
  }, [votes, search, result, chamber, topic]);

  const houseCount = votes.filter(v => v.chamber === 'House').length;
  const senateCount = votes.filter(v => v.chamber === 'Senate').length;

  const barWidth = (yea: number, nay: number) => {
    const total = yea + nay;
    if (total === 0) return 50;
    return Math.round((yea / total) * 100);
  };

  const clearFilters = () => {
    setSearch('');
    setResult('all');
    setChamber('all');
    setTopic('all');
  };

  return (
    <div>
      {/* Filter bar: borderless cells split by vertical rules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] border-b border-rule">
        <label className="block py-[14px] pr-5 lg:border-r border-rule">
          <span className="field-label block mb-[6px]">Search</span>
          <input
            type="text"
            placeholder="Vote question or bill number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full box-border appearance-none bg-transparent border-none p-0 text-[15px] focus:outline-none placeholder:text-ink-3"
          />
        </label>
        <label className="block py-[14px] px-5 lg:border-r border-rule">
          <span className="field-label block mb-[6px]">Chamber</span>
          <select
            value={chamber}
            onChange={e => setChamber(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All chambers</option>
            {houseCount > 0 && <option value="House">House</option>}
            {senateCount > 0 && <option value="Senate">Senate</option>}
          </select>
        </label>
        <label className="block py-[14px] px-5 lg:border-r border-rule">
          <span className="field-label block mb-[6px]">Topic</span>
          <select
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All topics</option>
            {topicCounts.map(([t, count]) => (
              <option key={t} value={t}>{t} ({count})</option>
            ))}
          </select>
        </label>
        <label className="block py-[14px] pl-5">
          <span className="field-label block mb-[6px]">Outcome</span>
          <select
            value={result}
            onChange={e => setResult(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All outcomes</option>
            <option value="agreed">Agreed / passed / confirmed</option>
            <option value="rejected">Rejected / failed</option>
          </select>
        </label>
      </div>

      {/* Count line + legend + Clear */}
      <div className="flex flex-wrap items-center justify-between gap-6 py-3 pb-2 border-b border-rule">
        <span className="font-mono text-[12px] text-ink-2 tabular">
          Showing {filtered.length} of {votes.length}
        </span>
        <div className="flex items-center gap-[18px]">
          <span className="flex items-center gap-[14px] font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3">
            <span className="flex items-center gap-[5px]">
              <span className="w-[14px] h-1 bg-yea inline-block" />Yea
            </span>
            <span className="flex items-center gap-[5px]">
              <span className="w-[14px] h-1 bg-accent inline-block" />Nay
            </span>
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] tracking-[0.06em] uppercase text-accent cursor-pointer underline underline-offset-[3px]"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-[72px] text-center border-b border-rule">
          <p className="font-serif text-2xl font-medium mb-[6px]">No votes match these filters.</p>
          <p className="text-[14px] text-ink-3 mb-[18px]">
            Most roll calls are procedural and carry no topic.
          </p>
          <button
            onClick={clearFilters}
            className="appearance-none bg-ink text-paper border-none rounded px-[18px] py-[9px] text-[13px] font-semibold cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div>
          {filtered.map(v => {
            const agreed = AGREED_RESULTS.has(v.result);
            const rejected = REJECTED_RESULTS.has(v.result);
            const yeaPct = barWidth(v.totalYea, v.totalNay);
            return (
              <a
                key={v.voteId}
                href={`${baseUrl}votes/${v.voteId}/`}
                className="grid grid-cols-1 md:grid-cols-[92px_minmax(0,1fr)_200px] gap-6 items-start py-4 border-b border-rule hover:border-ink-3"
              >
                <div>
                  <div className="font-mono text-[12.5px] font-medium text-ink-2 tabular">
                    #{v.rollCallNumber}
                  </div>
                  <div className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3 mt-[5px]">
                    {v.chamber || 'House'}
                  </div>
                </div>
                <div className="min-w-0">
                  <h3 className="font-serif text-[19px] leading-[1.3] font-medium line-clamp-2 text-pretty">
                    {v.question}
                  </h3>
                  <div className="flex flex-wrap items-center gap-[14px] mt-2">
                    {v.billId && (
                      <span className="font-mono text-[11.5px] font-medium text-accent">
                        {v.billId.toUpperCase()}
                      </span>
                    )}
                    {(v as any).topic && (
                      <span className="text-[11.5px] text-ink-2 border border-rule rounded px-[7px] py-[2px]">
                        {(v as any).topic}
                      </span>
                    )}
                    <span className="font-mono text-[11.5px] text-ink-3">{v.date}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-[9px] font-mono text-[11.5px] text-ink-3 tabular">
                    <span><span className="text-dem font-semibold">D</span> {v.partyBreakdown.democratic.yea}&ndash;{v.partyBreakdown.democratic.nay}</span>
                    <span><span className="text-rep font-semibold">R</span> {v.partyBreakdown.republican.yea}&ndash;{v.partyBreakdown.republican.nay}</span>
                    {(v.partyBreakdown.independent.yea + v.partyBreakdown.independent.nay) > 0 && (
                      <span><span className="text-ind font-semibold">I</span> {v.partyBreakdown.independent.yea}&ndash;{v.partyBreakdown.independent.nay}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={`font-mono text-[11px] font-semibold tracking-[0.05em] uppercase ${
                        agreed ? 'text-yea' : rejected ? 'text-accent' : 'text-ink-3'
                      }`}
                    >
                      {agreed ? 'Agreed' : rejected ? 'Rejected' : v.result}
                    </span>
                    <span className="font-serif text-[20px] font-medium tabular">
                      {v.totalYea}&ndash;{v.totalNay}
                    </span>
                  </div>
                  <div className="flex h-1 bg-rule mt-2">
                    <div className="h-full bg-yea" style={{ width: `${yeaPct}%` }} />
                    <div className="h-full bg-accent" style={{ width: `${100 - yeaPct}%` }} />
                  </div>
                  <p className="font-mono text-[10.5px] leading-[1.4] text-ink-3 mt-[7px]">{v.result}</p>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
