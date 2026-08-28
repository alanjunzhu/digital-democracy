import { useState } from 'react';
import type { MemberAreaStance, MemberPolicyProfile, StanceMetric } from '../../lib/policy-areas';

interface Props {
  profiles: Record<StanceMetric, MemberPolicyProfile>;
  baseUrl?: string;
}

const PARTY_COLOR: Record<string, string> = {
  democratic: 'var(--dem)',
  republican: 'var(--rep)',
  independent: 'var(--ind)',
  other: 'var(--ink-3)',
};

/** Own-party rows are the caucus, so independents sit with the Democrats. */
const PARTY_SHORT: Record<string, string> = {
  democratic: 'the Democratic caucus',
  republican: 'the Republican caucus',
  independent: 'the Democratic caucus',
  other: 'their colleagues',
};

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

  const pct = (value: number) => `${((value - axis.min) / (axis.max - axis.min)) * 100}%`;

  const own = PARTY_COLOR[profile.party] || PARTY_COLOR.other;
  const other = PARTY_COLOR[areas[0]?.otherParty.party || 'other'] || PARTY_COLOR.other;
  const shortName = profile.member.name.split(',')[0];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <p className="text-[13px] text-ink-2 max-w-prose">
          {metric === 'support'
            ? 'Share of each area’s contested measures voted for'
            : 'Which party’s majority they voted with, −100 to +100'}
          , against {PARTY_SHORT[profile.party]} in the {profile.chamber}. Widest gap first.
        </p>
        <div className="flex items-center gap-4 font-mono text-[11px] tracking-[0.06em] uppercase shrink-0">
          {(['support', 'lean'] as StanceMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`appearance-none bg-transparent border-none p-0 cursor-pointer ${metric === m ? 'text-ink underline underline-offset-[3px]' : 'text-ink-3 hover:text-ink'}`}
            >
              {m === 'support' ? 'Support' : 'Party-line lean'}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-rule bg-card px-[22px] pt-[18px] pb-3">
        <div className="flex flex-wrap gap-5 mb-[14px] font-mono text-[10.5px] tracking-[0.05em] uppercase text-ink-3">
          <span className="inline-flex items-center gap-[7px]">
            <span className="w-[11px] h-[11px] rounded-full border-[1.5px] border-ink inline-block" style={{ background: own }} />
            {shortName}
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <span className="w-[9px] h-[9px] rotate-45 inline-block" style={{ background: own }} />
            {PARTY_SHORT[profile.party]} average
          </span>
          <span className="inline-flex items-center gap-[7px]">
            <span className="w-[11px] h-[11px] rounded-full border-[1.5px] inline-block" style={{ borderColor: other }} />
            {PARTY_SHORT[areas[0]?.otherParty.party || 'other']} average
          </span>
        </div>

        <div className="grid grid-cols-[minmax(120px,270px)_minmax(0,1fr)_62px] gap-[14px] mb-2">
          <span />
          <span className="relative h-3">
            {axis.ticks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2 font-mono text-[10px] text-ink-3"
                style={{ left: pct(t) }}
              >
                {fmt(t, metric)}
              </span>
            ))}
          </span>
          <span />
        </div>

        {areas.map((area) => {
          const ownX = area.ownParty.avg != null ? pct(area.ownParty.avg) : null;
          const otherX = area.otherParty.avg != null ? pct(area.otherParty.avg) : null;
          const memberX = pct(area.score);
          const gapLeft = ownX != null ? `min(${ownX}, ${memberX})` : undefined;
          const gapWidth = ownX != null ? `calc(max(${ownX}, ${memberX}) - min(${ownX}, ${memberX}))` : undefined;
          return (
            <div
              key={area.id}
              className="grid grid-cols-[minmax(120px,270px)_minmax(0,1fr)_62px] gap-[14px] items-center h-9"
              role="img"
              aria-label={rowSummary(area, metric, shortName)}
            >
              <a href={`${baseUrl}policy/`} className="min-w-0">
                <div className="text-[12.5px] leading-[1.25] text-ink hover:text-accent text-pretty truncate">{area.label}</div>
                <div className="font-mono text-[10px] text-ink-3 mt-[2px]">
                  {area.n} of {area.votes} votes
                  {area.percentile != null && ` · ahead of ${area.percentile}% of caucus`}
                </div>
              </a>
              <span className="relative h-9">
                {axis.ticks.map((t) => (
                  <span key={t} className="absolute top-0 bottom-0 w-px bg-rule" style={{ left: pct(t) }} />
                ))}
                <span className="absolute top-1/2 left-1/2 -translate-y-1/2 w-full h-px bg-rule -translate-x-1/2" />
                {gapLeft != null && (
                  <span
                    className="absolute top-1/2 h-0 border-t border-dashed border-ink-3"
                    style={{ left: gapLeft, width: gapWidth }}
                  />
                )}
                {ownX != null && (
                  <span
                    className="absolute w-[9px] h-[9px] rotate-45 -translate-x-1/2 -translate-y-1/2 top-1/2"
                    style={{ left: ownX, background: own }}
                  />
                )}
                <span
                  className="absolute w-[11px] h-[11px] rounded-full border-[1.5px] border-ink -translate-x-1/2 -translate-y-1/2 top-1/2"
                  style={{ left: memberX, background: own }}
                />
                {otherX != null && (
                  <span
                    className="absolute w-[13px] h-[13px] rounded-full border-[1.5px] -translate-x-1/2 -translate-y-1/2 top-1/2 opacity-75"
                    style={{ left: otherX, borderColor: other }}
                  />
                )}
                <span
                  className="absolute -translate-x-1/2 -top-3 font-mono text-[11px] font-semibold text-ink"
                  style={{ left: memberX }}
                >
                  {fmt(area.score, metric)}
                </span>
              </span>
              <span
                className={`font-mono text-[11px] text-right tabular ${area.gap != null && Math.abs(area.gap) >= 10 ? 'text-ink font-semibold' : 'text-ink-3'}`}
              >
                {gapLabel(area.gap)}
              </span>
            </div>
          );
        })}
        <p className="font-mono text-[10.5px] text-ink-3 mt-2">
          Share of divisive votes in the area where they voted yes. Rows furthest right in the gap column sit furthest from their own party.
        </p>
      </div>

      <p className="mt-3">
        <a href={`${baseUrl}policy/`} className="font-mono text-[11px] tracking-[0.06em] uppercase text-accent hover:underline">
          How these scores are built &rarr;
        </a>
      </p>
    </div>
  );
}
