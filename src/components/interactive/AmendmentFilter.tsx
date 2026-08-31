import { useState, useMemo } from 'react';
import type { AmendmentSummary } from '../../lib/types';
import { getAmendmentDisposition, shortSponsorName } from '../../lib/utils';

interface Props {
  amendments: AmendmentSummary[];
  baseUrl: string;
}

type Disposition = 'agreed' | 'rejected' | 'withdrawn' | 'pending';

const DISPOSITIONS: Disposition[] = ['agreed', 'rejected', 'withdrawn', 'pending'];

/**
 * Pending is the one disposition whose text tone differs from its dot: the dot
 * is goldenrod so it reads as unresolved at a glance, but goldenrod text on
 * paper is hard to read at 11px, so the label stays ink-2.
 */
const DISPOSITION_STYLE: Record<Disposition, { label: string; dot: string; text: string }> = {
  agreed: { label: 'Agreed to', dot: 'bg-yea', text: 'text-yea' },
  rejected: { label: 'Rejected', dot: 'bg-accent', text: 'text-accent' },
  withdrawn: { label: 'Withdrawn', dot: 'bg-ink-3', text: 'text-ink-3' },
  pending: { label: 'Pending', dot: 'bg-pending', text: 'text-ink-2' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-08-08` -> `8 Aug 2026`. Never locale-formatted, never prose. */
function formatDate(iso?: string) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  const month = MONTHS[Number(m) - 1];
  if (!month || !y) return iso.slice(0, 10);
  return `${Number(d)} ${month} ${y}`;
}

const PARTY_TEXT: Record<string, string> = { D: 'text-dem', R: 'text-rep', I: 'text-ind' };

export default function AmendmentFilter({ amendments, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState('all');
  const [disposition, setDisposition] = useState<Disposition | 'all'>('all');
  const [linkage, setLinkage] = useState('all');
  const [grouped, setGrouped] = useState(false);

  // Disposition is derived once per amendment and reused by both the chip
  // counts and the row filter, so a row can never disagree with the chip that
  // claims to count it.
  const classified = useMemo(
    () => amendments.map(a => ({ a, disposition: getAmendmentDisposition(a.latestAction) as Disposition })),
    [amendments],
  );

  // Counts are over everything loaded, not the filtered set: a chip that
  // recounted itself as you filtered could never be used to compare.
  const counts = useMemo(() => {
    const out: Partial<Record<Disposition, number>> = {};
    for (const { disposition: d } of classified) out[d] = (out[d] || 0) + 1;
    return out;
  }, [classified]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classified.filter(({ a, disposition: d }) => {
      if (chamber !== 'all' && a.chamber !== chamber) return false;
      if (disposition !== 'all' && d !== disposition) return false;
      if (linkage === 'voted' && !(a.recordedVotes || []).some(v => v.voteId)) return false;
      if (linkage === 'bill' && !a.amendedBillId) return false;
      if (q) {
        const hay = [
          a.type,
          String(a.number),
          a.purpose,
          a.description,
          a.amendedBillId,
          a.amendedBillTitle,
          a.sponsor?.fullName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [classified, search, chamber, disposition, linkage]);

  // Grouped by the bill each amendment changes, in first-seen order — which is
  // the order the list already sorts by, so the busiest bill leads.
  const groups = useMemo(() => {
    if (!grouped) {
      return [{ key: 'all', billLabel: '', name: '', count: 0, showHeading: false, rows: filtered }];
    }
    const order: string[] = [];
    const byBill = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const key = row.a.amendedBillId || 'unattached';
      if (!byBill.has(key)) {
        byBill.set(key, []);
        order.push(key);
      }
      byBill.get(key)!.push(row);
    }
    return order.map(key => {
      const rows = byBill.get(key)!;
      return {
        key,
        billLabel: key === 'unattached' ? '—' : key.toUpperCase(),
        name: key === 'unattached' ? 'Not attached to a bill' : rows[0].a.amendedBillTitle || 'Untitled',
        count: rows.length,
        showHeading: true,
        rows,
      };
    });
  }, [filtered, grouped]);

  const clearFilters = () => {
    setSearch('');
    setChamber('all');
    setDisposition('all');
    setLinkage('all');
  };

  const countLine =
    disposition === 'all'
      ? `Showing ${filtered.length} of ${amendments.length}`
      : `Showing ${filtered.length} of ${amendments.length} · ${DISPOSITION_STYLE[disposition].label.toLowerCase()}`;

  return (
    <div>
      {/* Disposition band */}
      <div className="py-5 border-b border-rule">
        <div className="flex items-center justify-between gap-6 mb-[14px]">
          <h2 className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3 m-0">
            Amendments by disposition
          </h2>
          <button
            type="button"
            onClick={() => setGrouped(g => !g)}
            className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] tracking-[0.06em] uppercase text-accent cursor-pointer underline underline-offset-[3px]"
          >
            {grouped ? 'Grouped by bill' : 'Group by bill'}
          </button>
        </div>
        <div className="flex flex-wrap gap-[10px]">
          {DISPOSITIONS.filter(d => counts[d]).map(d => {
            const active = disposition === d;
            const style = DISPOSITION_STYLE[d];
            return (
              <button
                key={d}
                type="button"
                aria-pressed={active}
                // Clicking the active chip clears it, so the band is a toggle
                // rather than a one-way trap needing the Clear link.
                onClick={() => setDisposition(active ? 'all' : d)}
                className={`inline-flex items-center gap-2 border rounded px-3 py-[6px] text-[12.5px] font-medium cursor-pointer ${
                  active ? 'border-ink bg-rule-2 text-ink' : 'border-rule bg-transparent text-ink-2'
                }`}
              >
                <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${style.dot}`} />
                <span>{style.label}</span>
                <span className="font-mono text-[11.5px] opacity-70 tabular">{counts[d]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-rule">
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
            <option value="House">House</option>
            <option value="Senate">Senate</option>
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

      {/* Count line */}
      <div className="flex items-center justify-between gap-6 py-3 pb-[22px] border-b border-rule">
        <span className="font-mono text-[12px] text-ink-2 tabular">{countLine}</span>
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
        groups.map(group => (
          <div key={group.key} className="mt-[26px]">
            {group.showHeading && (
              <div className="flex items-baseline gap-3 pb-[10px] border-b border-ink">
                <span className="font-mono text-[12px] font-semibold text-accent">{group.billLabel}</span>
                <h2 className="font-serif text-[20px] font-medium text-pretty m-0">{group.name}</h2>
                <span className="ml-auto font-mono text-[11.5px] text-ink-3 tabular">{group.count}</span>
              </div>
            )}
            {group.rows.map(({ a, disposition: d }) => {
              const style = DISPOSITION_STYLE[d];
              const headline = a.purpose || a.description || `${a.type} ${a.number}`;
              const sponsor = shortSponsorName(a.sponsor?.fullName);
              const hasVote = (a.recordedVotes || []).some(v => v.voteId);
              return (
                <a
                  key={a.amendmentId}
                  href={`${baseUrl}amendments/${a.amendmentId}/`}
                  className="grid grid-cols-1 md:grid-cols-[128px_minmax(0,1fr)_168px] gap-6 items-start py-4 border-b border-rule hover:border-ink-3 focus-visible:border-ink-3"
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
                    <h3 className="font-serif text-[18px] leading-[1.35] font-medium line-clamp-2 text-pretty m-0">
                      {headline}
                    </h3>
                    <div className="flex flex-wrap items-center gap-[14px] mt-2">
                      {a.amendedBillId && (
                        <span className="font-mono text-[11.5px] font-medium text-accent">
                          {a.amendedBillId.toUpperCase()}
                        </span>
                      )}
                      {sponsor && (
                        <span className="text-[12px] text-ink-2 whitespace-nowrap">
                          Offered by{' '}
                          <span className={`font-semibold ${PARTY_TEXT[a.sponsor?.party || ''] || 'text-ink'}`}>
                            {sponsor}
                          </span>
                        </span>
                      )}
                      {a.latestActionDate && (
                        <span className="font-mono text-[11.5px] text-ink-3 tabular">
                          {formatDate(a.latestActionDate)}
                        </span>
                      )}
                      {hasVote && (
                        <span className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3 border border-rule rounded px-[7px] py-[2px]">
                          Roll call
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center gap-[7px] font-mono text-[11px] font-semibold tracking-[0.05em] uppercase ${style.text}`}
                    >
                      <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${style.dot}`} />
                      {style.label}
                    </span>
                    <p className="font-mono text-[10.5px] leading-[1.4] text-ink-3 mt-2 line-clamp-3 m-0">
                      {a.latestAction || 'No action recorded since it was submitted.'}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
