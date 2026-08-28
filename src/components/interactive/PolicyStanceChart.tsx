import { useMemo, useState } from 'react';
import type {
  ChamberScope,
  PolicyArea,
  PolicyIndex,
  PolicyMember,
  PolicyScore,
  StanceMetric,
} from '../../lib/policy-areas';

interface Props {
  index: PolicyIndex;
  baseUrl?: string;
}

const PARTY_COLOR: Record<string, string> = {
  democratic: 'var(--dem)',
  republican: 'var(--rep)',
  independent: 'var(--ind)',
  other: 'var(--ink-3)',
};

const PARTY_LABEL: Record<string, string> = {
  democratic: 'Democrats',
  republican: 'Republicans',
  independent: 'Independents',
  other: 'Other',
};

const BAND = 44;

const METRIC_AXIS: Record<StanceMetric, { min: number; max: number; ticks: number[]; left: string; right: string; title: string }> = {
  support: {
    min: 0,
    max: 100,
    ticks: [0, 25, 50, 75, 100],
    left: 'voted against every measure',
    right: 'voted for every measure',
    title: 'Share of the area’s contested measures a member voted for',
  },
  lean: {
    min: -100,
    max: 100,
    ticks: [-100, -50, 0, 50, 100],
    left: 'always with the Democratic majority',
    right: 'always with the Republican majority',
    title: 'Which party’s majority a member voted with on the area’s contested measures',
  },
};

/** Deterministic vertical offset so overlapping members stay distinguishable. */
function jitter(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return (h / 1000 - 0.5) * BAND;
}

function fmt(value: number | null, metric: StanceMetric) {
  if (value == null || !Number.isFinite(value)) return '—';
  return metric === 'support' ? `${value.toFixed(0)}%` : `${value > 0 ? '+' : ''}${value.toFixed(0)}`;
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function displayName(name: string) {
  const [last, rest] = String(name).split(',');
  return rest ? `${rest.trim()} ${last.trim()}` : String(name);
}

interface Row {
  area: PolicyArea;
  points: { score: PolicyScore; member: PolicyMember }[];
  averages: Record<string, { avg: number; members: number }>;
  contested: number;
}

/** What a screen reader hears in place of the row's dots. */
function rowSummary(row: Row, metric: StanceMetric) {
  const parts = [
    `${row.area.label}: ${plural(row.contested, 'contested vote', 'contested votes')}, ${plural(row.points.length, 'member', 'members')} scored.`,
  ];
  for (const party of ['democratic', 'republican'] as const) {
    const avg = row.averages[party];
    if (avg) parts.push(`${PARTY_LABEL[party]} average ${fmt(avg.avg, metric)}.`);
  }
  parts.push('Activate to list the roll calls behind this area.');
  return parts.join(' ');
}

export default function PolicyStanceChart({ index, baseUrl = '/' }: Props) {
  const [metric, setMetric] = useState<StanceMetric>('support');
  const [chamber, setChamber] = useState<ChamberScope>('all');
  const [search, setSearch] = useState('');
  const [hover, setHover] = useState<{ left: string; top: string; lines: string[] } | null>(null);
  const [openArea, setOpenArea] = useState<string | null>(null);

  const membersById = useMemo(() => {
    const map: Record<string, PolicyMember> = {};
    for (const m of index.members) map[m.id] = m;
    return map;
  }, [index.members]);

  const axis = METRIC_AXIS[metric];
  const pct = (value: number) => `${((value - axis.min) / (axis.max - axis.min)) * 100}%`;

  const query = search.trim().toLowerCase();

  /** Rows keep an area only while the chamber scope actually voted on it. */
  const rows: Row[] = useMemo(() => {
    return index.areas
      .map((area) => {
        const points: { score: PolicyScore; member: PolicyMember }[] = [];
        const sums: Record<string, { sum: number; n: number }> = {};
        for (const score of area.scores) {
          const member = membersById[score.id];
          if (!member) continue;
          if (chamber !== 'all' && member.chamber !== chamber) continue;
          points.push({ score, member });
          const bucket = sums[member.party] || (sums[member.party] = { sum: 0, n: 0 });
          bucket.sum += score[metric];
          bucket.n++;
        }
        const averages: Record<string, { avg: number; members: number }> = {};
        for (const [party, { sum, n }] of Object.entries(sums)) {
          averages[party] = { avg: sum / n, members: n };
        }
        const contested = chamber === 'all'
          ? area.votes.contested
          : chamber === 'House' ? area.votes.house : area.votes.senate;
        return { area, points, averages, contested };
      })
      .filter((row) => row.contested > 0 && row.points.length > 0);
  }, [index.areas, membersById, chamber, metric]);

  const matches = useMemo(() => {
    if (!query) return new Set<string>();
    const hits = new Set<string>();
    for (const m of index.members) {
      if (m.name.toLowerCase().includes(query) || m.state.toLowerCase().includes(query)) hits.add(m.id);
    }
    return hits;
  }, [index.members, query]);

  const detail = openArea ? index.areas.find((a) => a.id === openArea) : null;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-6 pb-4 border-b border-rule">
        <div>
          <span className="field-label block mb-2">Measure</span>
          <div className="flex gap-2">
            {(['support', 'lean'] as StanceMetric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`appearance-none cursor-pointer rounded px-3 py-[6px] text-[12.5px] font-medium border ${
                  metric === m ? 'border-ink bg-rule-2 text-ink' : 'border-rule text-ink-2 hover:border-ink-3'
                }`}
              >
                {m === 'support' ? 'Support for measures' : 'Party-line lean'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="field-label block mb-2">Chamber</span>
          <div className="flex gap-2">
            {(['all', 'House', 'Senate'] as ChamberScope[]).map((c) => (
              <button
                key={c}
                onClick={() => setChamber(c)}
                className={`appearance-none cursor-pointer rounded px-3 py-[6px] text-[12.5px] font-medium border ${
                  chamber === c ? 'border-ink bg-rule-2 text-ink' : 'border-rule text-ink-2 hover:border-ink-3'
                }`}
              >
                {c === 'all' ? 'Both' : c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <span className="field-label block mb-2">Find a member</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or state…"
            className="w-full box-border appearance-none bg-transparent border-b border-rule pb-[6px] text-[14px] focus:outline-none focus:border-ink placeholder:text-ink-3"
          />
        </div>
        <div className="flex flex-wrap gap-5 font-mono text-[10.5px] tracking-[0.05em] uppercase text-ink-3 ml-auto">
          {(['democratic', 'republican'] as const).map((party) => (
            <span key={party} className="inline-flex items-center gap-[7px]">
              <span className="w-[9px] h-[9px] inline-block" style={{ background: PARTY_COLOR[party] }} />
              {PARTY_LABEL[party]} average
            </span>
          ))}
          <span className="inline-flex items-center gap-[7px]">
            <span className="w-4 h-px border-t border-dashed border-ink-3 inline-block" />
            Party gap
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <span className="w-[9px] h-[9px] rounded-full border border-ink-3 inline-block" />
            Individual member
          </span>
        </div>
      </div>

      <p className="text-[13px] text-ink-3 my-3">{axis.title}. Each dot is one member; the squares are the party averages.</p>

      <div className="relative border border-rule bg-card px-[22px] pt-[18px] pb-3 overflow-x-auto">
        <div className="grid grid-cols-[minmax(140px,250px)_minmax(0,1fr)_62px] gap-[14px] mb-2 min-w-[600px]">
          <span />
          <span className="relative h-3">
            {axis.ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 font-mono text-[10px] text-ink-3" style={{ left: pct(t) }}>
                {fmt(t, metric)}
              </span>
            ))}
          </span>
          <span />
        </div>

        {rows.map((row) => {
          const dem = row.averages.democratic;
          const rep = row.averages.republican;
          const active = openArea === row.area.id;
          const demX = dem ? pct(dem.avg) : null;
          const repX = rep ? pct(rep.avg) : null;
          return (
            <div
              key={row.area.id}
              className={`grid grid-cols-[minmax(140px,250px)_minmax(0,1fr)_62px] gap-[14px] items-center min-w-[600px] cursor-pointer border-b border-rule ${active ? 'bg-rule-2' : ''}`}
              style={{ height: BAND + 10 }}
              role="button"
              tabIndex={0}
              aria-expanded={active}
              aria-label={rowSummary(row, metric)}
              onClick={() => setOpenArea(active ? null : row.area.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                  e.preventDefault();
                  setOpenArea(active ? null : row.area.id);
                }
              }}
            >
              <div className="min-w-0">
                <div className="text-[12.5px] leading-[1.25] text-ink text-pretty truncate">{row.area.label}</div>
                <div className="font-mono text-[10px] text-ink-3 mt-[2px]">
                  {plural(row.contested, 'contested vote', 'contested votes')} &middot; {plural(row.points.length, 'member', 'members')}
                </div>
              </div>
              <span className="relative" style={{ height: BAND + 10 }}>
                {axis.ticks.map((t) => (
                  <span
                    key={t}
                    className="absolute top-0 bottom-0 w-px"
                    style={{ left: pct(t), background: t === 0 && metric === 'lean' ? 'var(--ink-3)' : 'var(--rule)' }}
                  />
                ))}
                {demX != null && repX != null && (
                  <span
                    className="absolute top-1/2 h-0 border-t border-dashed border-ink-3"
                    style={{ left: `min(${demX}, ${repX})`, width: `calc(max(${demX}, ${repX}) - min(${demX}, ${repX}))` }}
                  />
                )}
                {row.points.map(({ score, member }) => {
                  const left = pct(score[metric]);
                  const top = `calc(50% + ${jitter(member.id)}px)`;
                  const hit = matches.has(member.id);
                  return (
                    <span
                      key={member.id}
                      className="absolute rounded-full -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left,
                        top,
                        width: hit ? 10 : 6.5,
                        height: hit ? 10 : 6.5,
                        border: `1px solid ${PARTY_COLOR[member.party] || PARTY_COLOR.other}`,
                        opacity: query && !hit ? 0.2 : 0.85,
                        boxShadow: hit ? '0 0 0 1.5px var(--ink)' : 'none',
                      }}
                      onMouseEnter={() =>
                        setHover({
                          left,
                          top,
                          lines: [
                            `${displayName(member.name)} (${member.party[0].toUpperCase()}-${member.state}, ${member.chamber})`,
                            `${row.area.label}: ${fmt(score[metric], metric)}`,
                            `${plural(score.n, 'contested vote', 'contested votes')} in this area`,
                          ],
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
                {(['democratic', 'republican'] as const).map((party) => {
                  const avg = row.averages[party];
                  if (!avg) return null;
                  const left = pct(avg.avg);
                  return (
                    <span
                      key={party}
                      className="absolute w-[9px] h-[9px] -translate-x-1/2 -translate-y-1/2 top-1/2"
                      style={{ left, background: PARTY_COLOR[party] }}
                      onMouseEnter={() =>
                        setHover({
                          left,
                          top: '50%',
                          lines: [
                            `${PARTY_LABEL[party]} · ${row.area.label}`,
                            `Average: ${fmt(avg.avg, metric)}`,
                            `${plural(avg.members, 'member', 'members')} scored`,
                          ],
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
              </span>
              <span />
            </div>
          );
        })}

        <p className="font-mono text-[10.5px] text-ink-3 text-center mt-3">
          {metric === 'support' ? 'Share of the area’s contested measures voted for' : 'Democratic majority ← party-line lean → Republican majority'}
        </p>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded bg-ink text-paper text-[11px] px-2 py-[6px]"
            style={{ left: hover.left, top: hover.top, transform: 'translate(-50%, -130%)' }}
          >
            {hover.lines.map((line, i) => (
              <div key={i} className={i === 0 ? 'font-semibold' : 'opacity-70'}>{line}</div>
            ))}
          </div>
        )}
      </div>

      <p className="font-mono text-[10.5px] leading-[1.6] text-ink-3 border-l-2 border-rule pl-3 mt-3">
        Only votes where the two party majorities split are counted, so areas with broad agreement do not appear.
      </p>

      {detail && (
        <div className="border-t border-ink pt-4 mt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-serif text-xl font-medium">{detail.label}</h3>
              <p className="text-[13px] text-ink-3 mt-1">{detail.description}</p>
            </div>
            <button
              onClick={() => setOpenArea(null)}
              className="appearance-none bg-transparent border-none p-0 font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3 hover:text-accent cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <div>
              <div className="field-label">Contested votes</div>
              <div className="font-serif text-xl font-medium tabular mt-1">{detail.votes.contested}</div>
            </div>
            <div>
              <div className="field-label">House / Senate</div>
              <div className="font-serif text-xl font-medium tabular mt-1">{detail.votes.house} / {detail.votes.senate}</div>
            </div>
            <div>
              <div className="field-label">Democratic majority backed</div>
              <div className="font-serif text-xl font-medium tabular mt-1 text-dem">{fmt(detail.partyStand.democratic, 'support')}</div>
            </div>
            <div>
              <div className="field-label">Republican majority backed</div>
              <div className="font-serif text-xl font-medium tabular mt-1 text-rep">{fmt(detail.partyStand.republican, 'support')}</div>
            </div>
          </div>
          <div className="mt-4">
            {detail.examples.map((ex) => (
              <div key={ex.voteId} className="text-[13px] py-[10px] border-b border-rule last:border-0">
                <a href={`${baseUrl}votes/${ex.voteId}/`} className="text-ink hover:text-accent font-medium">
                  {ex.question}
                </a>
                <span className="text-ink-3">
                  {' '}&middot; {ex.chamber} &middot; {ex.date} &middot; D {ex.democratic === 'yea' ? 'for' : 'against'}, R {ex.republican === 'yea' ? 'for' : 'against'} &middot; {ex.result}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
