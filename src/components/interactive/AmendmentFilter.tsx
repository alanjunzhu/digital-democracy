import { useState, useMemo } from 'react';
import type { AmendmentSummary } from '../../lib/types';
import { getAmendmentDisposition, getAmendmentVerdict } from '../../lib/utils';

interface Props {
  amendments: AmendmentSummary[];
  baseUrl: string;
}

const DISPOSITION_TEXT: Record<string, string> = {
  agreed: 'text-yea',
  rejected: 'text-accent',
  withdrawn: 'text-ink-3',
  pending: 'text-ink-2',
};

export default function AmendmentFilter({ amendments, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState('all');
  const [disposition, setDisposition] = useState('all');
  const [linkage, setLinkage] = useState('all');

  const filtered = useMemo(() => {
    return amendments.filter(a => {
      if (chamber !== 'all' && a.chamber !== chamber) return false;
      if (disposition !== 'all' && getAmendmentDisposition(a.latestAction) !== disposition) return false;
      if (linkage === 'voted' && !(a.recordedVotes || []).some(v => v.voteId)) return false;
      if (linkage === 'bill' && !a.amendedBillId) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          a.purpose,
          a.description,
          a.amendedBillId,
          a.amendedBillTitle,
          a.sponsor?.fullName,
          `${a.type} ${a.number}`,
        ];
        if (!haystack.some(field => field?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [amendments, search, chamber, disposition, linkage]);

  const houseCount = amendments.filter(a => a.chamber === 'House').length;
  const senateCount = amendments.filter(a => a.chamber === 'Senate').length;

  const clearFilters = () => {
    setSearch('');
    setChamber('all');
    setDisposition('all');
    setLinkage('all');
  };

  return (
    <div>
      {/* Filter bar: borderless cells split by vertical rules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] border-b border-rule">
        <label className="block py-[14px] pr-5 lg:border-r border-rule">
          <span className="field-label block mb-[6px]">Search</span>
          <input
            type="text"
            placeholder="Purpose, bill number or sponsor…"
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
            {houseCount > 0 && <option value="House">House ({houseCount})</option>}
            {senateCount > 0 && <option value="Senate">Senate ({senateCount})</option>}
          </select>
        </label>
        <label className="block py-[14px] px-5 lg:border-r border-rule">
          <span className="field-label block mb-[6px]">Disposition</span>
          <select
            value={disposition}
            onChange={e => setDisposition(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All dispositions</option>
            <option value="agreed">Agreed to</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="pending">Pending</option>
          </select>
        </label>
        <label className="block py-[14px] pl-5">
          <span className="field-label block mb-[6px]">Record</span>
          <select
            value={linkage}
            onChange={e => setLinkage(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">Everything</option>
            <option value="voted">Put to a roll call</option>
            <option value="bill">Attached to a bill</option>
          </select>
        </label>
      </div>

      {/* Count line + Clear */}
      <div className="flex flex-wrap items-center justify-between gap-6 py-3 pb-2 border-b border-rule">
        <span className="font-mono text-[12px] text-ink-2 tabular">
          Showing {filtered.length} of {amendments.length}
        </span>
        <button
          type="button"
          onClick={clearFilters}
          className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] tracking-[0.06em] uppercase text-accent cursor-pointer underline underline-offset-[3px]"
        >
          Clear
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="py-[72px] text-center border-b border-rule">
          <p className="font-serif text-2xl font-medium mb-[6px]">No amendments match these filters.</p>
          <p className="text-[14px] text-ink-3 mb-[18px]">
            Most amendments are never called up, so they stay pending with no vote attached.
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
          {filtered.map(a => {
            const outcome = getAmendmentDisposition(a.latestAction);
            // A House amendment describes itself; a Senate one states a purpose.
            // Neither is guaranteed, so the number is the last resort.
            const headline = a.purpose || a.description || `${a.type} ${a.number}`;
            const votes = (a.recordedVotes || []).filter(v => v.voteId);
            return (
              <a
                key={a.amendmentId}
                href={`${baseUrl}amendments/${a.amendmentId}/`}
                className="grid grid-cols-1 md:grid-cols-[128px_minmax(0,1fr)_168px] gap-6 items-start py-4 border-b border-rule hover:border-ink-3"
              >
                <div>
                  <div className="font-mono text-[12.5px] font-medium text-ink-2 tabular">
                    {a.type} {a.number}
                  </div>
                  <div className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3 mt-[5px]">
                    {a.chamber}
                  </div>
                </div>
                <div className="min-w-0">
                  <h3 className="font-serif text-[18px] leading-[1.35] font-medium line-clamp-2 text-pretty">
                    {headline}
                  </h3>
                  <div className="flex flex-wrap items-center gap-[14px] mt-2">
                    {a.amendedBillId && (
                      <span className="font-mono text-[11.5px] font-medium text-accent">
                        {a.amendedBillId.toUpperCase()}
                      </span>
                    )}
                    {a.sponsor?.fullName && (
                      <span className="text-[12px] text-ink-2">{a.sponsor.fullName}</span>
                    )}
                    {a.latestActionDate && (
                      <span className="font-mono text-[11.5px] text-ink-3">{a.latestActionDate}</span>
                    )}
                    {votes.length > 0 && (
                      <span className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3">
                        Roll call
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span
                    className={`font-mono text-[11px] font-semibold tracking-[0.05em] uppercase ${DISPOSITION_TEXT[outcome]}`}
                  >
                    {getAmendmentVerdict(a.latestAction)}
                  </span>
                  {a.latestAction && (
                    <p className="font-mono text-[10.5px] leading-[1.4] text-ink-3 mt-2 line-clamp-3">
                      {a.latestAction}
                    </p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
