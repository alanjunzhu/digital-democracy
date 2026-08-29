import { useState, useMemo } from 'react';
import type { CommitteeSummary } from '../../lib/types';

interface Props {
  committees: CommitteeSummary[];
  baseUrl: string;
}

export default function CommitteeFilter({ committees, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState<string>('all');
  const [type, setType] = useState<string>('all');

  const typeOptions = useMemo(
    () => [...new Set(committees.map(c => c.committeeType).filter(Boolean))].sort() as string[],
    [committees],
  );

  const filtered = useMemo(() => {
    return committees.filter(c => {
      if (chamber !== 'all' && c.chamber !== chamber) return false;
      if (type !== 'all' && c.committeeType !== type) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [committees, search, chamber, type]);

  const clearFilters = () => {
    setSearch('');
    setChamber('all');
    setType('all');
  };

  return (
    <div>
      {/* Filter bar: borderless cells split by vertical rules */}
      <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-rule">
        <label className="block py-[14px] pr-5 sm:border-r border-rule">
          <span className="field-label block mb-[6px]">Search</span>
          <input
            type="text"
            placeholder="Committee name…"
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
            <option value="Joint">Joint</option>
          </select>
        </label>
        <label className="block py-[14px] pl-5">
          <span className="field-label block mb-[6px]">Type</span>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All types</option>
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {/* Count line + Clear */}
      <div className="flex items-center justify-between gap-6 py-3 border-b border-rule">
        <span className="font-mono text-[12px] text-ink-2 tabular">
          Showing {filtered.length} of {committees.length}
        </span>
        <button
          type="button"
          onClick={clearFilters}
          className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] tracking-[0.06em] uppercase text-accent cursor-pointer underline underline-offset-[3px]"
        >
          Clear
        </button>
      </div>

      {/* Results: entity tiles, 3-up */}
      {filtered.length === 0 ? (
        <div className="py-[72px] text-center border-b border-rule">
          <p className="font-serif text-2xl font-medium mb-[6px]">No committees match these filters.</p>
          <p className="text-[14px] text-ink-3 mb-[18px]">
            Subcommittees carry the name of their policy area, not their parent.
          </p>
          <button
            onClick={clearFilters}
            className="appearance-none bg-ink text-paper border-none rounded px-[18px] py-[9px] text-[13px] font-semibold cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="tile-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mt-6">
          {filtered.map(c => (
            <a
              key={c.systemCode}
              href={`${baseUrl}committees/${c.systemCode}/`}
              className="flex flex-col gap-2 bg-card px-4 py-[14px] hover:bg-rule-2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-ink-3">
                  {c.chamber}
                </span>
                <span className="font-mono text-[10px] text-ink-3">{c.systemCode}</span>
              </div>
              <h3 className="font-serif text-[17px] leading-[1.25] font-medium text-pretty">{c.name}</h3>
              <div className="mt-auto flex items-center gap-3 font-mono text-[10.5px] text-ink-3">
                {c.committeeType && <span>{c.committeeType}</span>}
                {c.subcommittees && c.subcommittees.length > 0 && (
                  <span className="text-ink-2">{c.subcommittees.length} subcommittee{c.subcommittees.length !== 1 ? 's' : ''}</span>
                )}
                {c.isSubcommittee && c.parent && (
                  <span className="truncate">under {c.parent.name}</span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
