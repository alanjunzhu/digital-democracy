import { useState, useMemo } from 'react';
import type { HearingSummary } from '../../lib/types';
import { isUpcoming, meetingLabel, meetingStatusDot, meetingStatusText } from '../../lib/utils';

interface Props {
  hearings: HearingSummary[];
  baseUrl: string;
  /** Frozen at build time so filtering and the page's caveat agree on "now". */
  builtAt: number;
}

export default function HearingFilter({ hearings, baseUrl, builtAt }: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState('all');
  const [status, setStatus] = useState('all');
  const [when, setWhen] = useState('all');

  const filtered = useMemo(() => {
    return hearings.filter(h => {
      if (chamber !== 'all' && h.chamber !== chamber) return false;
      // Compared against the label the row actually shows, not the raw status:
      // a past meeting reads "Held", and a Status filter offering "Scheduled"
      // for it would contradict the list it is filtering.
      if (status !== 'all' && meetingLabel(h, builtAt) !== status) return false;
      if (when === 'upcoming' && !isUpcoming(h, builtAt)) return false;
      if (when === 'past' && isUpcoming(h, builtAt)) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          h.title,
          h.type,
          ...(h.committees || []).map(c => c.name),
          ...(h.relatedBillIds || []),
        ];
        if (!haystack.some(field => field?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [hearings, search, chamber, status, when, builtAt]);

  const houseCount = hearings.filter(h => h.chamber === 'House').length;
  const senateCount = hearings.filter(h => h.chamber === 'Senate').length;
  const jointCount = hearings.filter(h => h.chamber === 'NoChamber').length;
  const statuses = useMemo(
    () => [...new Set(hearings.map(h => meetingLabel(h, builtAt)).filter(Boolean))] as string[],
    [hearings, builtAt],
  );

  const clearFilters = () => {
    setSearch('');
    setChamber('all');
    setStatus('all');
    setWhen('all');
  };

  const formatWhen = (iso?: string) => {
    if (!iso) return { day: 'Undated', time: '' };
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { day: iso.slice(0, 10), time: '' };
    return {
      day: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] border-b border-rule">
        <label className="block py-[14px] pr-5 lg:border-r border-rule">
          <span className="field-label block mb-[6px]">Search</span>
          <input
            type="text"
            placeholder="Subject, committee or bill number…"
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
            {jointCount > 0 && <option value="NoChamber">Joint ({jointCount})</option>}
          </select>
        </label>
        <label className="block py-[14px] px-5 lg:border-r border-rule">
          <span className="field-label block mb-[6px]">Status</span>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">Any status</option>
            {statuses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block py-[14px] pl-5">
          <span className="field-label block mb-[6px]">When</span>
          <select
            value={when}
            onChange={e => setWhen(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">Any date</option>
            <option value="upcoming">Ahead of the last build</option>
            <option value="past">Already held</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-6 py-3 pb-2 border-b border-rule">
        <span className="font-mono text-[12px] text-ink-2 tabular">
          Showing {filtered.length} of {hearings.length}
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
          <p className="font-serif text-2xl font-medium mb-[6px]">No meetings match these filters.</p>
          <p className="text-[14px] text-ink-3 mb-[18px]">
            Congress.gov's Senate meeting coverage is thinner than the House's, so a
            quiet chamber here may be a gap in the source rather than a quiet week.
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
          {filtered.map(h => {
            const { day, time } = formatWhen(h.date);
            const ahead = isUpcoming(h, builtAt);
            const label = meetingLabel(h, builtAt);
            return (
              <a
                key={h.eventId}
                href={`${baseUrl}hearings/${h.eventId}/`}
                // Past meetings settle back rather than disappearing: the record
                // of what a committee did is worth as much as its calendar.
                className={`grid grid-cols-1 md:grid-cols-[128px_minmax(0,1fr)_140px] gap-6 items-start py-4 border-b border-rule hover:border-ink-3 ${
                  ahead ? '' : 'opacity-70'
                }`}
              >
                <div>
                  <div className="font-mono text-[12.5px] font-medium text-ink-2 tabular">{day}</div>
                  {time && (
                    <div className="font-mono text-[11px] text-ink-3 tabular mt-[4px]">{time}</div>
                  )}
                  <div className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3 mt-[5px]">
                    {h.chamber === 'NoChamber' ? 'Joint' : h.chamber}
                  </div>
                </div>
                <div className="min-w-0">
                  <h3 className="font-serif text-[18px] leading-[1.35] font-medium line-clamp-2 text-pretty">
                    {h.title || h.type || 'Committee meeting'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-[14px] mt-2">
                    {(h.committees || []).slice(0, 2).map(c => (
                      <span key={c.systemCode} className="text-[12px] text-ink-2">{c.name}</span>
                    ))}
                    {h.type && h.title && (
                      <span className="text-[11.5px] text-ink-2 border border-rule rounded px-[7px] py-[2px]">
                        {h.type}
                      </span>
                    )}
                    {(h.relatedBillIds || []).slice(0, 3).map(id => (
                      <span key={id} className="font-mono text-[11.5px] font-medium text-accent">
                        {id.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  {h.location?.room && (
                    <p className="font-mono text-[11px] text-ink-3 mt-[7px]">
                      {[h.location.room, h.location.building].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div>
                  <span
                    className={`inline-flex items-center gap-[7px] font-mono text-[11px] font-semibold tracking-[0.05em] uppercase ${meetingStatusText(label)}`}
                  >
                    <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${meetingStatusDot(label)}`} />
                    {label}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
