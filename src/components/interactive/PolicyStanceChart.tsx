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
  democratic: '#2563eb',
  republican: '#dc2626',
  independent: '#7c3aed',
  other: '#6b7280',
};

const PARTY_LABEL: Record<string, string> = {
  democratic: 'Democrats',
  republican: 'Republicans',
  independent: 'Independents',
  other: 'Other',
};

const W = 900;
const PAD = { top: 54, right: 28, bottom: 44, left: 212 };
const ROW_H = 48;
const BAND = 30;

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

export default function PolicyStanceChart({ index, baseUrl = '/' }: Props) {
  const [metric, setMetric] = useState<StanceMetric>('support');
  const [chamber, setChamber] = useState<ChamberScope>('all');
  const [search, setSearch] = useState('');
  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const [openArea, setOpenArea] = useState<string | null>(null);

  const membersById = useMemo(() => {
    const map: Record<string, PolicyMember> = {};
    for (const m of index.members) map[m.id] = m;
    return map;
  }, [index.members]);

  const axis = METRIC_AXIS[metric];
  const plotW = W - PAD.left - PAD.right;
  const scale = (value: number) => PAD.left + ((value - axis.min) / (axis.max - axis.min)) * plotW;

  const query = search.trim().toLowerCase();

  /** Rows keep an area only while the chamber scope actually voted on it. */
  const rows = useMemo(() => {
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

  const H = PAD.top + rows.length * ROW_H + PAD.bottom;
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Measure</label>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            {(['support', 'lean'] as StanceMetric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 text-sm font-medium ${metric === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {m === 'support' ? 'Support for measures' : 'Party-line lean'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Chamber</label>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            {(['all', 'House', 'Senate'] as ChamberScope[]).map((c) => (
              <button
                key={c}
                onClick={() => setChamber(c)}
                className={`px-3 py-1.5 text-sm font-medium ${chamber === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {c === 'all' ? 'Both' : c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Find a member</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or state…"
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <p className="text-sm text-gray-500">{axis.title}. Each dot is one member; the diamonds are the party averages.</p>

      <div className="relative border border-gray-200 rounded-xl bg-white p-2 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[720px]" role="img" aria-label="Member stances by policy area">
          <text x={PAD.left} y={18} className="fill-gray-500" fontSize="11" textAnchor="start">← {axis.left}</text>
          <text x={W - PAD.right} y={18} className="fill-gray-500" fontSize="11" textAnchor="end">{axis.right} →</text>

          {axis.ticks.map((t) => (
            <g key={t}>
              <line x1={scale(t)} y1={PAD.top - 20} x2={scale(t)} y2={H - PAD.bottom} stroke={t === 0 && metric === 'lean' ? '#9ca3af' : '#e5e7eb'} strokeWidth={1} />
              <text x={scale(t)} y={PAD.top - 26} textAnchor="middle" fontSize="11" className="fill-gray-500">
                {fmt(t, metric)}
              </text>
            </g>
          ))}

          {rows.map((row, i) => {
            const y = PAD.top + i * ROW_H + ROW_H / 2;
            const dem = row.averages.democratic;
            const rep = row.averages.republican;
            const active = openArea === row.area.id;
            return (
              <g key={row.area.id}>
                <rect
                  x={0}
                  y={y - ROW_H / 2}
                  width={W}
                  height={ROW_H}
                  fill={active ? '#eff6ff' : i % 2 === 0 ? '#fafafa' : '#ffffff'}
                  className="cursor-pointer"
                  onClick={() => setOpenArea(active ? null : row.area.id)}
                />
                <text x={PAD.left - 14} y={y - 2} textAnchor="end" fontSize="12" className="fill-gray-900 font-medium">
                  {row.area.label}
                </text>
                <text x={PAD.left - 14} y={y + 13} textAnchor="end" fontSize="10" className="fill-gray-500">
                  {plural(row.contested, 'contested vote', 'contested votes')} · {plural(row.points.length, 'member', 'members')}
                </text>

                {dem && rep && (
                  <line x1={scale(dem.avg)} y1={y} x2={scale(rep.avg)} y2={y} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 3" />
                )}

                {row.points.map(({ score, member }) => {
                  const cx = scale(score[metric]);
                  const cy = y + jitter(member.id);
                  const hit = matches.has(member.id);
                  return (
                    <circle
                      key={member.id}
                      cx={cx}
                      cy={cy}
                      r={hit ? 5 : 3.2}
                      fill={PARTY_COLOR[member.party] || PARTY_COLOR.other}
                      fillOpacity={query && !hit ? 0.15 : 0.55}
                      stroke={hit ? '#111827' : 'none'}
                      strokeWidth={hit ? 1.5 : 0}
                      onMouseEnter={() =>
                        setHover({
                          x: cx,
                          y: cy,
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
                  const x = scale(avg.avg);
                  return (
                    <g
                      key={party}
                      transform={`translate(${x} ${y})`}
                      onMouseEnter={() =>
                        setHover({
                          x,
                          y,
                          lines: [
                            `${PARTY_LABEL[party]} · ${row.area.label}`,
                            `Average: ${fmt(avg.avg, metric)}`,
                            `${plural(avg.members, 'member', 'members')} scored`,
                          ],
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                    >
                      <rect x={-6} y={-6} width={12} height={12} transform="rotate(45)" fill={PARTY_COLOR[party]} stroke="#ffffff" strokeWidth={1.5} />
                    </g>
                  );
                })}
              </g>
            );
          })}

          <text x={PAD.left + plotW / 2} y={H - 12} textAnchor="middle" fontSize="11" className="fill-gray-500">
            {metric === 'support' ? 'Share of the area’s contested measures voted for' : 'Democratic majority ← party-line lean → Republican majority'}
          </text>
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg bg-gray-900 text-white text-xs px-2 py-1.5 shadow-lg"
            style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, transform: 'translate(-50%, -115%)' }}
          >
            {hover.lines.map((line, i) => (
              <div key={i} className={i === 0 ? 'font-semibold' : 'text-gray-300'}>{line}</div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
        {(['democratic', 'republican', 'independent'] as const).map((party) => (
          <span key={party} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PARTY_COLOR[party] }} />
            {PARTY_LABEL[party]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rotate-45 bg-gray-700" />
          Party average
        </span>
        <span>Click an area to see the roll calls behind it.</span>
      </div>

      {detail && (
        <div className="border border-gray-200 rounded-xl bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">{detail.label}</h3>
              <p className="text-sm text-gray-500">{detail.description}</p>
            </div>
            <button onClick={() => setOpenArea(null)} className="text-sm text-gray-400 hover:text-gray-600">Close</button>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-gray-500">Contested votes</div>
              <div className="font-semibold text-gray-900">{detail.votes.contested}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">House / Senate</div>
              <div className="font-semibold text-gray-900">{detail.votes.house} / {detail.votes.senate}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Democratic majority backed</div>
              <div className="font-semibold text-blue-700">{fmt(detail.partyStand.democratic, 'support')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Republican majority backed</div>
              <div className="font-semibold text-red-700">{fmt(detail.partyStand.republican, 'support')}</div>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {detail.examples.map((ex) => (
              <li key={ex.voteId} className="text-sm">
                <a href={`${baseUrl}votes/${ex.voteId}/`} className="text-blue-600 hover:underline font-medium">
                  {ex.question}
                </a>
                <span className="text-gray-500">
                  {' '}· {ex.chamber} · {ex.date} · D {ex.democratic === 'yea' ? 'for' : 'against'}, R {ex.republican === 'yea' ? 'for' : 'against'} · {ex.result}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
