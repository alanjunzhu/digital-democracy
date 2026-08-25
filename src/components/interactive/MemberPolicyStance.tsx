import { useState } from 'react';
import type { MemberAreaStance, MemberPolicyProfile, StanceMetric } from '../../lib/policy-areas';

interface Props {
  profiles: Record<StanceMetric, MemberPolicyProfile>;
  baseUrl?: string;
}

const PARTY_COLOR: Record<string, string> = {
  democratic: '#2563eb',
  republican: '#dc2626',
  independent: '#7c3aed',
  other: '#6b7280',
};

/** Own-party rows are the caucus, so independents sit with the Democrats. */
const PARTY_SHORT: Record<string, string> = {
  democratic: 'the Democratic caucus',
  republican: 'the Republican caucus',
  independent: 'the Democratic caucus',
  other: 'their colleagues',
};

const W = 820;
const PAD = { top: 44, right: 92, bottom: 26, left: 250 };
const ROW_H = 54;

const AXIS: Record<StanceMetric, { min: number; max: number; ticks: number[]; left: string; right: string }> = {
  support: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], left: 'against', right: 'for' },
  lean: { min: -100, max: 100, ticks: [-100, -50, 0, 50, 100], left: 'with Democrats', right: 'with Republicans' },
};

function fmt(value: number | null | undefined, metric: StanceMetric) {
  if (value == null || !Number.isFinite(value)) return '—';
  return metric === 'support' ? `${Math.round(value)}%` : `${value > 0 ? '+' : ''}${Math.round(value)}`;
}

function gapLabel(gap: number | null) {
  if (gap == null) return '—';
  if (Math.abs(gap) < 0.5) return 'on par';
  return `${gap > 0 ? '+' : '−'}${Math.abs(Math.round(gap))}`;
}

/** What a screen reader hears in place of one row's markers. */
function rowSummary(area: MemberAreaStance, metric: StanceMetric, name: string) {
  const parts = [
    `${area.label}: ${name} ${fmt(area.score, metric)}, ${PARTY_SHORT[area.ownParty.party]} average ${fmt(area.ownParty.avg, metric)}`,
  ];
  if (area.gap != null) parts.push(`a gap of ${gapLabel(area.gap)} points`);
  if (area.otherParty.avg != null) parts.push(`${PARTY_SHORT[area.otherParty.party]} average ${fmt(area.otherParty.avg, metric)}`);
  parts.push(`${area.n} of ${area.votes} contested votes cast`);
  return `${parts.join('. ')}.`;
}

export default function MemberPolicyStance({ profiles, baseUrl = '/' }: Props) {
  const [metric, setMetric] = useState<StanceMetric>('support');
  const profile = profiles[metric];
  const axis = AXIS[metric];
  const areas = profile.areas;

  const plotW = W - PAD.left - PAD.right;
  const scale = (value: number) => PAD.left + ((value - axis.min) / (axis.max - axis.min)) * plotW;
  const H = PAD.top + areas.length * ROW_H + PAD.bottom;

  const own = PARTY_COLOR[profile.party] || PARTY_COLOR.other;
  const other = PARTY_COLOR[areas[0]?.otherParty.party || 'other'] || PARTY_COLOR.other;
  const shortName = profile.member.name.split(',')[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {metric === 'support'
            ? 'Share of each area’s contested measures voted for'
            : 'Which party’s majority they voted with, −100 to +100'}
          , against {PARTY_SHORT[profile.party]} in the {profile.chamber}. Widest gap first.
        </p>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {(['support', 'lean'] as StanceMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 text-sm font-medium ${metric === m ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {m === 'support' ? 'Support' : 'Party-line lean'}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl bg-white p-2 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px]" role="img" aria-label={`${shortName}'s stance by policy area against their party`}>
          <text x={PAD.left - 14} y={PAD.top - 22} textAnchor="end" fontSize="10" className="fill-gray-400">
            {axis.left} → {axis.right}
          </text>
          <text x={W - 8} y={PAD.top - 22} textAnchor="end" fontSize="10" className="fill-gray-400">vs caucus</text>

          {axis.ticks.map((t) => (
            <g key={t}>
              <line x1={scale(t)} y1={PAD.top - 16} x2={scale(t)} y2={H - PAD.bottom} stroke={t === 0 && metric === 'lean' ? '#9ca3af' : '#f1f5f9'} strokeWidth={1} />
              <text x={scale(t)} y={PAD.top - 22} textAnchor="middle" fontSize="10" className="fill-gray-400">{fmt(t, metric)}</text>
            </g>
          ))}

          {areas.map((area, i) => {
            const y = PAD.top + i * ROW_H + ROW_H / 2;
            const memberX = scale(area.score);
            const ownX = area.ownParty.avg != null ? scale(area.ownParty.avg) : null;
            const otherX = area.otherParty.avg != null ? scale(area.otherParty.avg) : null;
            return (
              <g key={area.id} role="img" aria-label={rowSummary(area, metric, shortName)}>
                <rect x={0} y={y - ROW_H / 2} width={W} height={ROW_H} fill={i % 2 === 0 ? '#fafafa' : '#ffffff'} />
                <a href={`${baseUrl}policy/`}>
                  <text x={PAD.left - 14} y={y - 3} textAnchor="end" fontSize="12" className="fill-gray-900 font-medium">{area.label}</text>
                </a>
                <text x={PAD.left - 14} y={y + 12} textAnchor="end" fontSize="10" className="fill-gray-500">
                  {area.n} of {area.votes} votes
                  {area.percentile != null && ` · ahead of ${area.percentile}% of caucus`}
                </text>

                <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke="#e5e7eb" strokeWidth={1} />

                {/* The gap itself: the stretch between the member and their party's average. */}
                {ownX != null && Math.abs(memberX - ownX) > 1 && (
                  <line x1={ownX} y1={y} x2={memberX} y2={y} stroke={own} strokeWidth={3} strokeOpacity={0.35} />
                )}

                {ownX != null && (
                  <rect x={ownX - 4.5} y={y - 4.5} width={9} height={9} transform={`rotate(45 ${ownX} ${y})`} fill={own} />
                )}

                <circle cx={memberX} cy={y} r={6.5} fill={own} stroke="#111827" strokeWidth={1.5} />

                {/* Drawn last, and wide enough to ring the member's dot when the
                    other party's average lands on the same spot. */}
                {otherX != null && (
                  <circle cx={otherX} cy={y} r={9} fill="none" stroke={other} strokeWidth={1.5} strokeOpacity={0.75} />
                )}
                <text
                  x={memberX}
                  y={y - 12}
                  textAnchor="middle"
                  fontSize="11"
                  className="fill-gray-900 font-semibold"
                >
                  {fmt(area.score, metric)}
                </text>

                <text x={W - PAD.right + 12} y={y + 4} fontSize="12" className={area.gap != null && Math.abs(area.gap) >= 10 ? 'fill-gray-900 font-semibold' : 'fill-gray-500'}>
                  {gapLabel(area.gap)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-gray-900" style={{ background: own }} />
          {shortName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rotate-45" style={{ background: own }} />
          {PARTY_SHORT[profile.party]} average
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: other }} />
          {PARTY_SHORT[areas[0]?.otherParty.party || 'other']} average
        </span>
        <a href={`${baseUrl}policy/`} className="text-blue-600 hover:underline">How these scores are built →</a>
      </div>
    </div>
  );
}
