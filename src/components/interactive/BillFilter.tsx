import { useState, useMemo } from 'react';
import type { BillSummary } from '../../lib/types';
import { getBillStage, BILL_STAGES, STAGE_COLORS, referral, type BillStage } from '../../lib/utils';

interface Props {
  bills: BillSummary[];
  baseUrl: string;
}

/**
 * The track a bill travels. Vetoed is a branch off it, not a step on it — a
 * vetoed bill reached the end of the chamber stages and then stopped, so it
 * renders at the passed-both-chambers position in accent rather than being
 * given a sixth dot that implies it went further than a signed bill.
 */
const TRACK: BillStage[] = [
  'Introduced',
  'In Committee',
  'Passed One Chamber',
  'Passed Both Chambers',
  'Signed into Law',
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-08-20` -> `20 Aug 2026`. */
function formatDate(iso?: string) {
  if (!iso) return 'Undated';
  const [y, m, d] = iso.slice(0, 10).split('-');
  const month = MONTHS[Number(m) - 1];
  if (!month || !y) return iso.slice(0, 10);
  return `${d} ${month} ${y}`;
}

const PARTY_TEXT: Record<string, string> = { D: 'text-dem', R: 'text-rep', I: 'text-ind' };
const PARTY_BORDER: Record<string, string> = {
  D: 'border-l-dem',
  R: 'border-l-rep',
  I: 'border-l-ind',
};

/** One step of the dot track: a dot, then the connector that follows it. */
function TrackStep({ index, reached, vetoed }: { index: number; reached: number; vetoed: boolean }) {
  const isCurrent = index === reached;
  const isPast = index < reached;

  const fill = isPast ? 'bg-ink-3' : isCurrent ? (vetoed ? 'bg-accent' : 'bg-ink') : 'bg-transparent';
  const ring = isCurrent
    ? vetoed
      ? 'border-accent'
      : 'border-ink'
    : isPast
      ? 'border-ink-3'
      : 'border-rule';
  // The trailing connector goes nowhere, so it is not drawn.
  const line = index === TRACK.length - 1 ? 'bg-transparent' : isPast ? 'bg-ink-3' : 'bg-rule';

  return (
    <>
      <span className={`w-[7px] h-[7px] rounded-full flex-none box-border border ${fill} ${ring}`} />
      <span className={`h-px flex-1 ${line}`} />
    </>
  );
}

export default function BillFilter({ bills, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState('all');
  const [policyArea, setPolicyArea] = useState('all');
  const [stage, setStage] = useState('all');
  const [groupByStage, setGroupByStage] = useState(false);

  const policyAreas = useMemo(
    () => [...new Set(bills.map(b => b.policyArea).filter(Boolean))].sort() as string[],
    [bills],
  );

  const withStage = useMemo(
    () => bills.map(b => ({ ...b, stage: getBillStage(b.latestAction) })),
    [bills],
  );

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of withStage) counts[b.stage] = (counts[b.stage] || 0) + 1;
    return counts;
  }, [withStage]);

  const ledger = useMemo(
    () => [
      { label: 'Loaded', value: bills.length, dot: '' },
      { label: 'In committee', value: stageCounts['In Committee'] || 0, dot: 'bg-pending' },
      {
        label: 'Passed a chamber',
        value: (stageCounts['Passed One Chamber'] || 0) + (stageCounts['Passed Both Chambers'] || 0),
        dot: 'bg-yea',
      },
      { label: 'Enacted', value: stageCounts['Signed into Law'] || 0, dot: 'bg-ink' },
    ],
    [bills.length, stageCounts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withStage.filter(b => {
      if (chamber !== 'all' && b.originChamber !== chamber) return false;
      if (policyArea !== 'all' && b.policyArea !== policyArea) return false;
      if (stage !== 'all' && b.stage !== stage) return false;
      if (q) {
        // latestAction has to be in the haystack: the referral column shows a
        // committee name drawn from it, and without it typing a committee name
        // visible on screen returns nothing.
        const hay = [b.type, String(b.number), b.title, b.sponsor?.name, b.policyArea, b.latestAction]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [withStage, search, chamber, policyArea, stage]);

  /**
   * Grouped by stage when asked; otherwise sectioned by introduced date.
   *
   * Ungrouped, the date was printed on every row and read the same twenty times
   * over — a freshly fetched slice is mostly one day's introductions. Printed
   * once as a rule over its bills, it becomes a heading instead of noise.
   */
  const groups = useMemo(() => {
    if (groupByStage) {
      return BILL_STAGES.map(name => ({
        key: name,
        name,
        bills: filtered.filter(b => b.stage === name),
      })).filter(g => g.bills.length > 0);
    }

    const order: string[] = [];
    const byDate = new Map<string, typeof filtered>();
    for (const b of filtered) {
      const key = b.introducedDate || '';
      if (!byDate.has(key)) {
        byDate.set(key, []);
        order.push(key);
      }
      byDate.get(key)!.push(b);
    }
    return order.map(key => ({
      key: key || 'undated',
      name: formatDate(key),
      bills: byDate.get(key)!,
    }));
  }, [filtered, groupByStage]);

  const clearFilters = () => {
    setSearch('');
    setChamber('all');
    setPolicyArea('all');
    setStage('all');
  };

  return (
    <div>
      {/* Header ledger */}
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

      {/* Stage band */}
      <div className="py-5 border-b border-rule">
        <div className="flex items-center justify-between gap-6 mb-[14px]">
          <h2 className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-3 m-0">Bills by stage</h2>
          <button
            type="button"
            onClick={() => setGroupByStage(g => !g)}
            className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] tracking-[0.06em] uppercase text-accent cursor-pointer underline underline-offset-[3px]"
          >
            {groupByStage ? 'Grouped by stage' : 'Grouped by date'}
          </button>
        </div>
        <div className="flex flex-wrap gap-[10px]">
          {BILL_STAGES.filter(s => stageCounts[s]).map(s => {
            const active = stage === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => setStage(active ? 'all' : s)}
                className={`inline-flex items-center gap-2 border rounded px-3 py-[6px] text-[12.5px] font-medium cursor-pointer ${
                  active ? 'border-ink bg-rule-2 text-ink' : 'border-rule bg-transparent text-ink-2'
                }`}
              >
                <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${STAGE_COLORS[s].dot}`} />
                <span>{s}</span>
                <span className="font-mono text-[11.5px] opacity-70 tabular">{stageCounts[s]}</span>
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
            placeholder="Title, bill number, sponsor or committee…"
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
          <span className="field-label block mb-[6px]">Policy area</span>
          <select
            value={policyArea}
            onChange={e => setPolicyArea(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All policy areas</option>
            {policyAreas.map(area => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Count line, carrying the track legend so the dots are taught once
          rather than labelled on all 500 rows. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3 pb-[22px] border-b border-rule">
        <span className="font-mono text-[12px] text-ink-2 tabular">
          Showing {filtered.length} of {bills.length}
        </span>
        <div className="flex items-center gap-4">
          <span className="hidden md:flex items-center gap-2 w-[210px]">
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 whitespace-nowrap">
              Introduced
            </span>
            <span className="flex items-center flex-1">
              <span className="w-[7px] h-[7px] rounded-full flex-none box-border border border-ink bg-ink" />
              <span className="h-px flex-1 bg-rule" />
              <span className="w-[7px] h-[7px] rounded-full flex-none box-border border border-rule bg-transparent" />
              <span className="h-px flex-1 bg-rule" />
              <span className="w-[7px] h-[7px] rounded-full flex-none box-border border border-rule bg-transparent" />
            </span>
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 whitespace-nowrap">
              Signed into law
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

      {filtered.length === 0 ? (
        <div className="py-[72px] text-center border-b border-rule">
          <p className="font-serif text-2xl font-medium mb-[6px]">No bills match these filters.</p>
          <p className="text-[14px] text-ink-3 mb-[18px]">
            Try a committee name, a sponsor, or a bill number.
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
          <div key={group.key}>
            <div className="flex items-baseline gap-[14px] pt-7 pb-[9px]">
              <span className="font-mono text-[11px] font-semibold tracking-[0.1em] uppercase text-ink">
                {group.name}
              </span>
              <span className="flex-1 h-px bg-ink" />
              <span className="font-mono text-[11px] text-ink-3 tabular">
                {group.bills.length} {groupByStage ? 'bills' : 'introduced'}
              </span>
            </div>
            {group.bills.map(b => {
              const ref = referral(b.latestAction);
              const party = b.sponsor?.party || '';
              const vetoed = b.stage === 'Vetoed';
              const reached = vetoed ? 2 : Math.max(0, TRACK.indexOf(b.stage as BillStage));
              // The dots already say "in committee" on four rows in five; the
              // word is spelled out only where the track alone would undersell
              // what happened, and never in grouped mode where the heading says it.
              const stageIsNotable =
                !groupByStage && b.stage !== 'In Committee' && b.stage !== 'Introduced';
              return (
                <a
                  key={b.billId}
                  href={`${baseUrl}bills/${b.billId}/`}
                  className={`grid grid-cols-1 md:grid-cols-[92px_minmax(0,1fr)_190px_104px] gap-[22px] items-start py-[14px] pl-[13px] border-b border-rule border-l-[3px] hover:bg-rule-2 hover:border-b-ink-3 focus-visible:bg-rule-2 ${
                    PARTY_BORDER[party] || 'border-l-rule'
                  }`}
                >
                  <div>
                    <div className="font-mono text-[12.5px] font-medium text-accent tabular">
                      {b.type} {b.number}
                    </div>
                    <div className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3 mt-[5px]">
                      {b.originChamber}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-serif text-[18.5px] leading-[1.3] font-medium line-clamp-2 text-pretty m-0">
                      {b.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 mt-[7px]">
                      {b.sponsor?.name && (
                        <span
                          className={`text-[12.5px] font-semibold whitespace-nowrap ${PARTY_TEXT[party] || 'text-ink-3'}`}
                        >
                          {b.sponsor.name}
                        </span>
                      )}
                      {b.policyArea && (
                        <span className="text-[11.5px] text-ink-2 border border-rule rounded px-[7px] py-[2px]">
                          {b.policyArea}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3">
                      {ref.verb}
                    </div>
                    <div className="text-[13px] leading-[1.4] text-ink-2 mt-[5px] text-pretty">
                      {ref.object}
                    </div>
                    {ref.extra && (
                      <div className="font-mono text-[10.5px] text-ink-3 mt-[4px]">{ref.extra}</div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center pt-[3px]">
                      {TRACK.map((_, i) => (
                        <TrackStep key={i} index={i} reached={reached} vetoed={vetoed} />
                      ))}
                    </div>
                    {(stageIsNotable || vetoed) && (
                      <div
                        className={`font-mono text-[10px] tracking-[0.06em] uppercase mt-2 ${STAGE_COLORS[b.stage as BillStage]?.text || 'text-ink-2'}`}
                      >
                        {b.stage}
                      </div>
                    )}
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
