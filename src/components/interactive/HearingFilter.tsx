import { useState, useMemo } from 'react';
import type { HearingSummary } from '../../lib/types';
import { isUpcoming, meetingLabel } from '../../lib/utils';

interface Props {
  hearings: HearingSummary[];
  baseUrl: string;
  /** Frozen at build time so filtering, the ledger and the caveat agree on "now". */
  builtAt: number;
}

const STATUS_STYLE: Record<string, { dot: string; text: string }> = {
  Scheduled: { dot: 'bg-yea', text: 'text-yea' },
  Rescheduled: { dot: 'bg-pending', text: 'text-ink-2' },
  Postponed: { dot: 'bg-pending', text: 'text-ink-2' },
  Canceled: { dot: 'bg-accent', text: 'text-accent' },
  Held: { dot: 'bg-ink-3', text: 'text-ink-3' },
};

const statusStyle = (label: string) => STATUS_STYLE[label] || { dot: 'bg-ink-3', text: 'text-ink-3' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Read in UTC rather than the viewer's zone. A committee room number is fixed
 * to the time Congress published, and a static page rendered once cannot be
 * localised per reader without the date silently disagreeing with the schedule
 * the build was made from.
 */
function formatWhen(iso?: string) {
  if (!iso) return { day: 'Undated', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: iso.slice(0, 10), time: '' };
  return {
    day: `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    time: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
  };
}

export default function HearingFilter({ hearings, baseUrl, builtAt }: Props) {
  const [search, setSearch] = useState('');
  const [committee, setCommittee] = useState('all');
  const [status, setStatus] = useState('all');
  const [when, setWhen] = useState('all');

  // Derived once and reused by the ledger, the filter and the rows, so no two
  // parts of the page can disagree about a meeting's status.
  const labelled = useMemo(
    () => hearings.map(h => ({ h, label: meetingLabel(h, builtAt), ahead: isUpcoming(h, builtAt) })),
    [hearings, builtAt],
  );

  const ledger = useMemo(() => {
    const count = (fn: (row: (typeof labelled)[number]) => boolean) => labelled.filter(fn).length;
    return [
      { label: 'Meetings loaded', value: hearings.length, dot: '' },
      { label: 'Ahead of last build', value: count(r => r.ahead), dot: 'bg-yea' },
      { label: 'Postponed', value: count(r => r.label === 'Postponed'), dot: 'bg-pending' },
      { label: 'Already held', value: count(r => r.label === 'Held'), dot: 'bg-ink-3' },
    ];
  }, [labelled, hearings.length]);

  // Committee, not chamber: Senate coverage in the source is thin enough that a
  // chamber filter sorts almost nothing, while committee sorts everything.
  const committeeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const h of hearings) for (const c of h.committees || []) if (c.name) names.add(c.name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [hearings]);

  const statusOptions = useMemo(
    () => [...new Set(labelled.map(r => r.label).filter(Boolean))].sort(),
    [labelled],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return labelled.filter(({ h, label, ahead }) => {
      if (committee !== 'all' && !(h.committees || []).some(c => c.name === committee)) return false;
      if (status !== 'all' && label !== status) return false;
      if (when === 'upcoming' && !ahead) return false;
      if (when === 'past' && ahead) return false;
      if (q) {
        const hay = [h.title, h.type, ...(h.committees || []).map(c => c.name), ...(h.relatedBillIds || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [labelled, search, committee, status, when]);

  const clearFilters = () => {
    setSearch('');
    setCommittee('all');
    setStatus('all');
    setWhen('all');
  };

  return (
    <div>
      {/* Status ledger */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-rule">
        {ledger.map(cell => (
          <div key={cell.label} className="py-4 pr-5 border-r border-rule last:border-r-0">
            <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3">{cell.label}</div>
            <div className="flex items-baseline gap-2 mt-2">
              {cell.dot && <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${cell.dot}`} />}
              <span className="font-serif text-[28px] leading-none font-medium tabular">{cell.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
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
          <span className="field-label block mb-[6px]">Committee</span>
          <select
            value={committee}
            onChange={e => setCommittee(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All committees</option>
            {committeeOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
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
            {statusOptions.map(s => (
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

      {/* Count line */}
      <div className="flex items-center justify-between gap-6 py-3 pb-[22px] border-b border-rule">
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
            Senate meeting coverage in the source is thinner than the House's, so a
            quiet chamber here may be a gap in the record rather than a quiet week.
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
          {filtered.map(({ h, label, ahead }) => {
            const { day, time } = formatWhen(h.date);
            const style = statusStyle(label);
            return (
              <a
                key={h.eventId}
                href={`${baseUrl}hearings/${h.eventId}/`}
                // Meetings already held settle back rather than disappearing:
                // the record of what a committee did is worth as much as its
                // calendar, just not as loud.
                className={`grid grid-cols-1 md:grid-cols-[128px_minmax(0,1fr)_140px] gap-6 items-start py-4 border-b border-rule hover:border-ink-3 focus-visible:border-ink-3 ${
                  ahead ? '' : 'opacity-[0.72]'
                }`}
              >
                <div>
                  <div className="font-mono text-[12.5px] font-medium text-ink-2 tabular">{day}</div>
                  {time && <div className="font-mono text-[11px] text-ink-3 tabular mt-[4px]">{time}</div>}
                  <div className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3 mt-[5px]">
                    {h.chamber === 'NoChamber' ? 'Joint' : h.chamber}
                  </div>
                </div>
                <div className="min-w-0">
                  <h3 className="font-serif text-[18px] leading-[1.35] font-medium line-clamp-2 text-pretty m-0">
                    {h.title || h.type || 'Committee meeting'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-[14px] mt-2">
                    {h.committees?.[0]?.name && (
                      <span className="text-[12px] text-ink-2">{h.committees[0].name}</span>
                    )}
                    {h.type && (
                      <span className="text-[11.5px] text-ink-2 border border-rule rounded px-[7px] py-[2px]">
                        {h.type}
                      </span>
                    )}
                    {(h.relatedBillIds || []).slice(0, 4).map(id => (
                      <span key={id} className="font-mono text-[11.5px] font-medium text-accent">
                        {id.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  {h.location?.room && (
                    <p className="font-mono text-[11px] text-ink-3 mt-[7px] m-0">
                      {[h.location.room, h.location.building].filter(Boolean).join(' ')}
                    </p>
                  )}
                </div>
                <div>
                  <span
                    className={`inline-flex items-center gap-[7px] font-mono text-[11px] font-semibold tracking-[0.05em] uppercase ${style.text}`}
                  >
                    <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${style.dot}`} />
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
