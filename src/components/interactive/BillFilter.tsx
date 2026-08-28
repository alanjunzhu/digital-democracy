import { useState, useMemo } from 'react';
import type { BillSummary } from '../../lib/types';
import { getBillStage, BILL_STAGES, STAGE_COLORS, type BillStage } from '../../lib/utils';

interface Props {
  bills: BillSummary[];
  baseUrl: string;
}

export default function BillFilter({ bills, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState<string>('all');
  const [policyArea, setPolicyArea] = useState<string>('all');
  const [stage, setStage] = useState<string>('all');
  const [groupByStage, setGroupByStage] = useState(false);

  const policyAreas = useMemo(() => {
    const areas = [...new Set(bills.map(b => b.policyArea).filter(Boolean))].sort();
    return areas as string[];
  }, [bills]);

  // Compute stage for each bill once
  const billsWithStage = useMemo(() => {
    return bills.map(b => ({
      ...b,
      stage: getBillStage(b.latestAction),
    }));
  }, [bills]);

  // Stage counts for the summary
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of billsWithStage) {
      counts[b.stage] = (counts[b.stage] || 0) + 1;
    }
    return counts;
  }, [billsWithStage]);

  const filtered = useMemo(() => {
    return billsWithStage.filter(b => {
      if (chamber !== 'all' && b.originChamber !== chamber) return false;
      if (policyArea !== 'all' && b.policyArea !== policyArea) return false;
      if (stage !== 'all' && b.stage !== stage) return false;
      if (search) {
        const q = search.toLowerCase();
        const titleMatch = b.title.toLowerCase().includes(q);
        const idMatch = b.billId.toLowerCase().includes(q);
        const typeMatch = b.type.toLowerCase().includes(q);
        const sponsorMatch = b.sponsor?.name.toLowerCase().includes(q);
        if (!titleMatch && !idMatch && !typeMatch && !sponsorMatch) return false;
      }
      return true;
    });
  }, [billsWithStage, search, chamber, policyArea, stage]);

  // Group by stage if toggled
  const groupedBills = useMemo(() => {
    if (!groupByStage) return null;
    const groups: Record<string, typeof filtered> = {};
    for (const s of BILL_STAGES) {
      const matching = filtered.filter(b => b.stage === s);
      if (matching.length > 0) groups[s] = matching;
    }
    // Add "Other" if any
    const other = filtered.filter(b => b.stage === 'Other');
    if (other.length > 0) groups['Other'] = other;
    return groups;
  }, [filtered, groupByStage]);

  const partyColor = (p: string) => {
    if (p === 'D') return 'text-dem';
    if (p === 'R') return 'text-rep';
    return 'text-ind';
  };

  const clearFilters = () => {
    setSearch('');
    setChamber('all');
    setPolicyArea('all');
    setStage('all');
  };

  // Record row: identifier column, title and provenance, status right-aligned.
  const BillCard = ({ b }: { b: (typeof billsWithStage)[0] }) => {
    const sc = STAGE_COLORS[b.stage];
    return (
      <a
        href={`${baseUrl}bills/${b.billId}/`}
        className="grid grid-cols-1 md:grid-cols-[96px_minmax(0,1fr)_150px] gap-5 items-start py-4 border-b border-rule hover:border-ink-3"
      >
        <div>
          <div className="font-mono text-[12.5px] font-medium text-accent">
            {b.type} {b.number}
          </div>
          <div className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3 mt-[5px]">
            {b.originChamber}
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="font-serif text-[19px] leading-[1.3] font-medium line-clamp-2">
            {b.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-[14px] gap-y-2 mt-2">
            {b.sponsor && (
              <span className="text-[12.5px] text-ink-2">
                Sponsor{' '}
                <span className={`font-semibold ${partyColor(b.sponsor.party)}`}>
                  {b.sponsor.name}
                </span>
              </span>
            )}
            {b.introducedDate && (
              <span className="font-mono text-[11.5px] text-ink-3">
                Introduced {b.introducedDate}
              </span>
            )}
            {b.policyArea && (
              <span className="text-[11.5px] text-ink-2 border border-rule rounded px-[7px] py-[2px]">
                {b.policyArea}
              </span>
            )}
          </div>
          {b.latestAction && (
            <p className="text-[12.5px] leading-[1.5] text-ink-3 mt-2 truncate">
              Latest: {b.latestAction}
            </p>
          )}
        </div>
        <div className="md:text-right">
          <span className="inline-flex items-center gap-[7px] font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink border border-ink-3 rounded px-2 py-1">
            <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${sc.dot}`} />
            {b.stage}
          </span>
        </div>
      </a>
    );
  };

  return (
    <div>
      {/* Facet chips: stage */}
      <div className="flex flex-wrap items-center gap-[10px] py-[14px] border-b border-rule">
        {BILL_STAGES.map(s => {
          const count = stageCounts[s] || 0;
          if (count === 0) return null;
          const sc = STAGE_COLORS[s];
          const isActive = stage === s;
          return (
            <button
              key={s}
              onClick={() => setStage(isActive ? 'all' : s)}
              className={`inline-flex items-center gap-2 rounded px-3 py-[6px] text-[12.5px] font-medium border ${
                isActive ? 'border-ink bg-rule-2 text-ink' : 'border-rule text-ink-2 hover:border-ink-3'
              }`}
            >
              <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${sc.dot}`} />
              {s}
              <span className="font-mono text-[11.5px] opacity-70 tabular">{count}</span>
            </button>
          );
        })}
        <button
          onClick={() => setGroupByStage(!groupByStage)}
          className={`ml-auto font-mono text-[11px] tracking-[0.06em] uppercase ${
            groupByStage ? 'text-ink underline underline-offset-[3px]' : 'text-ink-3 hover:text-ink'
          }`}
        >
          {groupByStage ? 'Grouped by stage' : 'Group by stage'}
        </button>
      </div>

      {/* Filter bar: borderless cells split by vertical rules */}
      <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-rule">
        <label className="block py-[14px] pr-5 sm:border-r border-rule">
          <span className="field-label block mb-[6px]">Search</span>
          <input
            type="text"
            placeholder="Title, bill number, or sponsor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full box-border appearance-none bg-transparent border-none p-0 text-[15px] focus:outline-none placeholder:text-ink-3"
          />
        </label>
        <label className="block py-[14px] px-5 sm:border-r border-rule">
          <span className="field-label block mb-[6px]">Chamber</span>
          <select
            value={chamber}
            onChange={e => setChamber(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All chambers</option>
            <option value="Senate">Senate</option>
            <option value="House">House</option>
          </select>
        </label>
        <label className="block py-[14px] pl-5">
          <span className="field-label block mb-[6px]">Policy area</span>
          <select
            value={policyArea}
            onChange={e => setPolicyArea(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All policy areas</option>
            {policyAreas.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Count line + Clear */}
      <div className="flex items-center justify-between gap-6 py-3 border-b border-rule">
        <span className="font-mono text-[12px] text-ink-2 tabular">
          Showing {filtered.length} of {bills.length}
          {stage !== 'all' && ` · ${stage}`}
        </span>
        <button
          type="button"
          onClick={clearFilters}
          className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] tracking-[0.06em] uppercase text-accent cursor-pointer underline underline-offset-[3px]"
        >
          Clear
        </button>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-[72px] text-center border-b border-rule">
          <p className="font-serif text-2xl font-medium mb-[6px]">No bills match these filters.</p>
          <p className="text-[14px] text-ink-3 mb-[18px]">
            Try a broader policy area, or clear the stage facet.
          </p>
          <button
            onClick={clearFilters}
            className="appearance-none bg-ink text-paper border-none rounded px-[18px] py-[9px] text-[13px] font-semibold cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : groupedBills ? (
        <div className="flex flex-col gap-9">
          {Object.entries(groupedBills).map(([stageName, stageBills]) => {
            const sc = STAGE_COLORS[stageName as BillStage] || STAGE_COLORS['Other'];
            return (
              <div key={stageName}>
                <div className="flex items-baseline gap-3 border-t border-ink pt-3 mb-1">
                  <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${sc.dot}`} />
                  <h2 className="font-serif text-2xl font-medium tracking-[-0.01em]">{stageName}</h2>
                  <span className="font-mono text-[11px] text-ink-3 tabular">
                    {stageBills.length}
                  </span>
                </div>
                {stageBills.map(b => <BillCard key={b.billId} b={b} />)}
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          {filtered.map(b => <BillCard key={b.billId} b={b} />)}
        </div>
      )}
    </div>
  );
}
