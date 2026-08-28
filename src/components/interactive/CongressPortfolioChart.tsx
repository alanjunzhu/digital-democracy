import { useId, useMemo, useState } from 'react';
import type { CongressMemberLine, CongressPortfolio } from '../../lib/types';
import { defaultHighlightIds } from '../../../shared/portfolio-series.mjs';
import {
  ZOOM_DEFAULT,
  ZOOM_LABELS,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  isReturnClipped,
  yDomainForZoom,
} from '../../../shared/congress-chart-scale.mjs';

interface Props {
  portfolio: CongressPortfolio;
  benchmarkLabel?: string;
  baseUrl?: string;
}

// Chart theme: ink is the subject (all trades), navy dashed is the benchmark,
// red is the flagged committee-overlap cut, ink-3 is the do-nothing baseline,
// rule-grey is the cohort of individual members behind the aggregate.
const SERIES = {
  cash: 'var(--ink-3)',
  all: 'var(--ink)',
  benchmark: 'var(--navy)',
  committee: 'var(--red)',
  member: 'var(--rule)',
  highlight: 'var(--ink)',
} as const;

const PAD = { top: 16, right: 8, bottom: 8, left: 8 };
const W = 720;
const H = 320;

type SeriesKey = 'cash' | 'all' | 'benchmark' | 'committee';
type ChamberFilter = 'all' | 'House' | 'Senate';

function money(value: number | null | undefined, compact = false) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard',
  });
}

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function niceTicks(min: number, max: number, count = 4) {
  const span = Math.max(max - min, 1);
  const rough = span / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step * 0.001; v += step) {
    ticks.push(Math.abs(v) < step * 0.001 ? 0 : v);
  }
  return ticks;
}

function spreadLabels(entries: { key: string; pct: number }[], minGap = 5) {
  const sorted = [...entries].sort((a, b) => a.pct - b.pct);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].pct - sorted[i - 1].pct;
    if (gap < minGap) sorted[i].pct = sorted[i - 1].pct + minGap;
  }
  return Object.fromEntries(sorted.map((e) => [e.key, e.pct]));
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function shortName(name: string, max = 16) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function sameIds(a: Set<string>, b: string[]) {
  if (a.size !== b.length) return false;
  return b.every((id) => a.has(id));
}

function toggleId(prev: Set<string>, id: string) {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export default function CongressPortfolioChart({
  portfolio,
  benchmarkLabel = 'S&P 500',
  baseUrl = '/',
}: Props) {
  const clipId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(() => new Set());
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState<ChamberFilter>('all');

  const {
    dates, all, benchmark, cash, committee, committeeCash,
    summary, skipped, counts, contributed, committeeContributed,
    members = [],
  } = portfolio;

  const hasCommittee = committeeContributed > 0;
  const defaultIds = useMemo(
    () => defaultHighlightIds(members, { benchmarkReturnPct: summary.benchmarkReturnPct }),
    [members, summary.benchmarkReturnPct],
  );
  const [highlightIds, setHighlightIds] = useState<Set<string>>(() => new Set(defaultIds));

  const growth = useMemo(() => {
    const index = (values: number[], deployed: number[]) =>
      values.map((v, i) => (deployed[i] > 0 ? (v / deployed[i] - 1) * 100 : 0));
    return {
      cash: cash.map(() => 0),
      all: index(all, cash),
      benchmark: index(benchmark, cash),
      committee: index(committee, committeeCash),
    };
  }, [all, benchmark, cash, committee, committeeCash]);

  const lines = useMemo(() => {
    const rows: {
      key: SeriesKey;
      label: string;
      color: string;
      values: number[];
      plot: number[];
      dash?: string;
      returnPct: number | null;
    }[] = [
      {
        key: 'cash',
        label: 'Holding cash',
        color: SERIES.cash,
        values: cash,
        plot: growth.cash,
        dash: '2 3',
        returnPct: 0,
      },
      {
        key: 'all',
        label: 'Trading (all)',
        color: SERIES.all,
        values: all,
        plot: growth.all,
        returnPct: summary.allReturnPct,
      },
      {
        key: 'benchmark',
        label: benchmarkLabel,
        color: SERIES.benchmark,
        values: benchmark,
        plot: growth.benchmark,
        dash: '5 4',
        returnPct: summary.benchmarkReturnPct,
      },
    ];
    if (hasCommittee) {
      rows.push({
        key: 'committee',
        label: 'Trading (committee)',
        color: SERIES.committee,
        values: committee,
        plot: growth.committee,
        returnPct: summary.committeeReturnPct,
      });
    }
    return rows;
  }, [all, benchmark, benchmarkLabel, cash, committee, growth, hasCommittee, summary]);

  const visible = lines.filter((l) => !hidden.has(l.key));
  const highlighted = useMemo(
    () => members
      .filter((m) => highlightIds.has(m.bioguideId))
      .sort((a, b) => (b.returnPct ?? 0) - (a.returnPct ?? 0)),
    [highlightIds, members],
  );
  const swarm = useMemo(
    () => members.filter((m) => !highlightIds.has(m.bioguideId)),
    [highlightIds, members],
  );

  const geom = useMemo(() => {
    const domain = yDomainForZoom({
      zoom,
      strategyValues: visible.flatMap((l) => l.plot),
      memberReturns: members.map((m) => m.returnPct),
      highlightedReturns: highlighted.map((m) => m.returnPct),
    });
    const ticks = niceTicks(domain.min, domain.max);
    const bottom = ticks[0];
    const top = ticks[ticks.length - 1];
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (dates.length < 2 ? 0 : (i / (dates.length - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - ((v - bottom) / (top - bottom || 1)) * plotH;
    const yPct = (v: number) => ((y(v) - PAD.top) / plotH) * 100;
    const path = (values: number[]) =>
      values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return { x, y, yPct, path, ticks, plotW, plotH, top, domain };
  }, [dates, highlighted, members, visible, zoom]);

  const clippedHighlights = highlighted.filter((m) => isReturnClipped(m.returnPct, geom.domain));

  const labelTop = spreadLabels([
    ...visible.map((l) => ({ key: l.key, pct: geom.yPct(l.plot[l.plot.length - 1]) })),
    ...highlighted.map((m) => ({
      key: m.bioguideId,
      pct: Math.max(0, Math.min(geom.yPct(m.plot[m.plot.length - 1]), 100)),
    })),
  ]);

  const hoverIdx = hover != null ? Math.min(Math.max(hover, 0), dates.length - 1) : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const relY = ((e.clientY - rect.top) / rect.height) * H;
    const frac = (relX - PAD.left) / geom.plotW;
    setHover(Math.round(frac * (dates.length - 1)));
    setHoverY(relY);
  }

  const nearestMember = useMemo(() => {
    if (hoverIdx == null || hoverY == null) return null;
    const pool = showMembers ? members : highlighted;
    if (!pool.length) return null;
    let best: CongressMemberLine | null = null;
    let bestDist = 14;
    for (const m of pool) {
      const y = geom.y(m.plot[hoverIdx] ?? 0);
      const dist = Math.abs(y - hoverY);
      const prefer = highlightIds.has(m.bioguideId) ? dist - 2 : dist;
      if (prefer < bestDist) {
        bestDist = prefer;
        best = m;
      }
    }
    return best;
  }, [geom, highlightIds, highlighted, hoverIdx, hoverY, members, showMembers]);

  function toggle(key: SeriesKey) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const barMax = Math.max(
    1,
    ...lines.map((l) => Math.abs(l.returnPct ?? 0)),
  );
  const barDiverging = lines.some((l) => (l.returnPct ?? 0) < 0);
  const bestKey = lines
    .filter((l) => l.key !== 'cash' && l.returnPct != null)
    .sort((a, b) => (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity))[0]?.key;

  const allBeatMarket = (summary.allReturnPct ?? 0) > (summary.benchmarkReturnPct ?? 0);
  const committeeBeatAll =
    hasCommittee && (summary.committeeReturnPct ?? 0) > (summary.allReturnPct ?? 0);
  const committeeBeatOwnMarket =
    hasCommittee && (summary.committeeVsOwnBenchmarkPct ?? 0) > 0;
  const atDefaultHighlights = sameIds(highlightIds, defaultIds);
  const query = search.trim().toLowerCase();
  const pickerMembers = members
    .filter((m) => (chamber === 'all' ? true : m.chamber === chamber))
    .filter((m) => {
      if (!query) return true;
      return (
        m.name.toLowerCase().includes(query)
        || (m.chamber || '').toLowerCase().includes(query)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const exclusions = [
    skipped.noPrice > 0 && `${plural(skipped.noPrice, 'trade', 'trades')} with no price history available`,
    skipped.noAmount > 0 && `${plural(skipped.noAmount, 'trade', 'trades')} with no reported amount`,
    skipped.outsideBenchmark > 0 && `${plural(skipped.outsideBenchmark, 'trade', 'trades')} dated outside the period charted`,
    skipped.unmatchedSales > 0 && `${plural(skipped.unmatchedSales, 'sale', 'sales')} of positions bought before this window`,
  ].filter(Boolean) as string[];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-6 border-t border-ink pt-3 mb-1">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em]">Cash vs trading vs the market</h2>
        <span className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3 whitespace-nowrap">
          Cumulative % &middot; rebased at first disclosed buy
        </span>
      </div>
      <p className="text-[14px] leading-[1.6] text-ink-2 max-w-prose mb-1">
        If every disclosed purchase in Congress had been one portfolio, how would it have
        done against putting the same money into the {benchmarkLabel} on the same days, or
        leaving it in cash?{' '}
        {hasCommittee && (
          <>
            A fourth line keeps only the trades in a sector that member&apos;s committee
            oversees.{' '}
          </>
        )}
        Faint lines are each member; the ones currently highlighted stand out —
        top performers by default, or whoever you pick.
      </p>
      <p className="font-mono text-[11px] text-ink-3 mb-5">
        Pooled from {plural(counts.purchases, 'purchase', 'purchases')} by{' '}
        {plural(counts.members, 'member', 'members')}
        {hasCommittee
          ? ` · committee line uses ${plural(counts.overlapPurchases, 'purchase', 'purchases')} by ${plural(counts.overlapMembers, 'member', 'members')}`
          : ''}
        {summary.asOf ? ` · through ${summary.asOf}` : ''}.
      </p>

      <div className="border border-rule bg-card px-[22px] pt-5 pb-[14px]">
        {/* Ending-return bars */}
        <div role="list" aria-label="Ending return for each strategy">
          {lines.map((l) => {
            const value = l.returnPct ?? 0;
            const width = `${(Math.abs(value) / barMax) * (barDiverging ? 50 : 100)}%`;
            const isHidden = hidden.has(l.key);
            return (
              <button
                key={l.key}
                type="button"
                role="listitem"
                onClick={() => toggle(l.key)}
                aria-pressed={!isHidden}
                title={isHidden ? `Show ${l.label}` : `Hide ${l.label}`}
                className={`w-full appearance-none bg-transparent border-none cursor-pointer grid grid-cols-[9.5rem_1fr_4.5rem] sm:grid-cols-[11rem_1fr_5rem] items-center gap-3 py-[6px] text-left ${isHidden ? 'opacity-40' : ''}`}
              >
                <span className="flex items-center gap-2 text-[12.5px] text-ink-2 min-w-0">
                  <svg width="16" height="8" aria-hidden="true" className="shrink-0">
                    <line x1="0" y1="4" x2="16" y2="4" stroke={l.color} strokeWidth="2.5" strokeDasharray={l.dash} />
                  </svg>
                  <span className="truncate">
                    {l.label}
                    {l.key === bestKey && !isHidden && (
                      <span className="ml-[6px] font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">highest</span>
                    )}
                  </span>
                </span>
                <span className="relative h-1 bg-rule">
                  {barDiverging && (
                    <span className="absolute left-1/2 -top-1 -bottom-1 w-px bg-ink-3" aria-hidden="true" />
                  )}
                  <span
                    className="absolute top-0 bottom-0"
                    style={{
                      background: l.color,
                      width,
                      ...(barDiverging
                        ? value >= 0
                          ? { left: '50%' }
                          : { right: '50%' }
                        : { left: 0 }),
                    }}
                  />
                </span>
                <span className="font-mono text-[13px] font-semibold tabular text-ink text-right">
                  {pct(l.returnPct)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="font-mono text-[10px] text-ink-3 mt-2">
          Click a strategy to show or hide it on the chart. Height is percent gained per dollar
          invested, not dollars — committee trades are a smaller pot of money on different days.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {members.length > 0 ? (
            <label className="flex items-center gap-2 font-mono text-[11px] text-ink-2">
              <input
                type="checkbox"
                checked={showMembers}
                onChange={(e) => setShowMembers(e.target.checked)}
              />
              <span className="flex items-center gap-[6px]">
                <svg width="16" height="8" aria-hidden="true">
                  <line x1="0" y1="4" x2="16" y2="4" stroke={SERIES.member} strokeWidth="1.5" />
                </svg>
                Individual members ({members.length})
              </span>
            </label>
          ) : <span />}
          <div className="flex items-center gap-[6px]">
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3 mr-1">Scale</span>
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z - 1))}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Zoom in"
              title="Zoom in — tighter axis, strategy lines clearer"
              className="w-7 h-7 rounded border border-rule bg-transparent text-[13px] font-semibold text-ink-2 hover:border-ink-3 disabled:opacity-40"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z + 1))}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Zoom out"
              title="Zoom out — wider axis, show clipped members"
              className="w-7 h-7 rounded border border-rule bg-transparent text-[13px] font-semibold text-ink-2 hover:border-ink-3 disabled:opacity-40"
            >
              −
            </button>
            <span className="font-mono text-[11px] text-ink-2 tabular min-w-[5.5rem]">
              {ZOOM_LABELS[zoom as keyof typeof ZOOM_LABELS]}
            </span>
            {zoom !== ZOOM_DEFAULT && (
              <button
                type="button"
                onClick={() => setZoom(ZOOM_DEFAULT)}
                className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] text-accent hover:underline cursor-pointer"
              >
                Reset scale
              </button>
            )}
          </div>
        </div>
        <p className="font-mono text-[10px] text-ink-3 mt-1">
          + tightens around the strategy lines. − widens the axis.
          {clippedHighlights.length > 0
            ? ` Use − if a highlighted line is clipped (${clippedHighlights.map((m) => m.name).join(', ')}).`
            : ''}
        </p>

        <div className="grid grid-cols-[46px_minmax(0,1fr)_128px] gap-2 mt-4">
          <div className="relative" style={{ height: H }}>
            {geom.ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 -translate-y-1/2 font-mono text-[10px] text-ink-3 tabular whitespace-nowrap"
                style={{ top: `${geom.yPct(t)}%` }}
              >
                {`${t > 0 ? '+' : ''}${t.toFixed(t % 1 === 0 ? 0 : 1)}%`}
              </span>
            ))}
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: H, display: 'block' }}
            role="img"
            aria-label={`Growth per dollar invested: holding cash, trading all disclosed purchases, the ${benchmarkLabel}${hasCommittee ? ', committee-overlap trades' : ''}, and each member`}
            onMouseMove={onMove}
            onMouseLeave={() => { setHover(null); setHoverY(null); }}
          >
            <defs>
              <clipPath id={`plot-${clipId}`}>
                <rect x={PAD.left} y={PAD.top} width={geom.plotW} height={geom.plotH} />
              </clipPath>
            </defs>
            {geom.ticks.map((t) => (
              <line
                key={t}
                x1={PAD.left} y1={geom.y(t)} x2={W - PAD.right} y2={geom.y(t)}
                stroke={t === 0 ? 'var(--ink-3)' : 'var(--rule)'} strokeWidth="1" vectorEffect="non-scaling-stroke"
              />
            ))}

            <g clipPath={`url(#plot-${clipId})`}>
              {showMembers && swarm.map((m) => (
                <path
                  key={m.bioguideId}
                  d={geom.path(m.plot)}
                  fill="none"
                  stroke={SERIES.member}
                  strokeWidth="1"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {highlighted.map((m) => (
                <path
                  key={m.bioguideId}
                  d={geom.path(m.plot)}
                  fill="none"
                  stroke={SERIES.highlight}
                  strokeWidth="1.5"
                  strokeOpacity="0.7"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {visible.map((l) => (
                <path
                  key={l.key}
                  d={geom.path(l.plot)}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={l.key === 'cash' ? 1.5 : 2.25}
                  strokeDasharray={l.dash}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>

            {hoverIdx != null && (
              <line
                x1={geom.x(hoverIdx)} y1={PAD.top} x2={geom.x(hoverIdx)} y2={H - PAD.bottom}
                stroke="var(--ink-3)" strokeWidth="1" vectorEffect="non-scaling-stroke"
              />
            )}
            {hoverIdx != null && visible.map((l) => (
              <circle
                key={l.key}
                cx={geom.x(hoverIdx)}
                cy={geom.y(l.plot[hoverIdx])}
                r="4"
                fill={l.color}
                stroke="var(--card)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hoverIdx != null && nearestMember && (
              <circle
                cx={geom.x(hoverIdx)}
                cy={geom.y(nearestMember.plot[hoverIdx] ?? 0)}
                r="3.5"
                fill={highlightIds.has(nearestMember.bioguideId) ? SERIES.highlight : SERIES.member}
                stroke="var(--card)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <div className="relative" style={{ height: H }}>
            {visible.map((l) => (
              <span
                key={l.key}
                className="absolute left-0 -translate-y-1/2 font-mono text-[10px] whitespace-nowrap"
                style={{ top: `${labelTop[l.key]}%`, color: l.color }}
              >
                {l.label}
              </span>
            ))}
            {highlighted.map((m) => (
              <span
                key={m.bioguideId}
                className="absolute left-0 -translate-y-1/2 font-mono text-[10px] whitespace-nowrap text-ink"
                style={{ top: `${labelTop[m.bioguideId]}%` }}
              >
                {shortName(m.name)}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[46px_minmax(0,1fr)_128px] gap-2 mt-[6px]">
          <span />
          <span className="flex justify-between font-mono text-[10px] text-ink-3">
            <span>{dates[0]}</span>
            <span>{dates[dates.length - 1]}</span>
          </span>
          <span />
        </div>

        <div className="min-h-[2.5rem] mt-2">
          {hoverIdx != null ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-2">
              <span className="font-semibold text-ink">{dates[hoverIdx]}</span>
              {visible.map((l) => (
                <span key={l.key} className="flex items-center gap-[6px]">
                  <svg width="10" height="8" aria-hidden="true">
                    <line x1="0" y1="4" x2="10" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
                  </svg>
                  {pct(l.plot[hoverIdx])} <span className="text-ink-3">({money(l.values[hoverIdx], true)})</span>
                </span>
              ))}
              {nearestMember && (
                <span className="flex items-center gap-[6px]">
                  <svg width="10" height="8" aria-hidden="true">
                    <line
                      x1="0" y1="4" x2="10" y2="4"
                      stroke={highlightIds.has(nearestMember.bioguideId) ? SERIES.highlight : SERIES.member}
                      strokeWidth="2"
                    />
                  </svg>
                  {nearestMember.name} {pct(nearestMember.plot[hoverIdx])}
                </span>
              )}
            </div>
          ) : (
            <p className="font-mono text-[11px] text-ink-3">Hover the chart for values on a given day.</p>
          )}
        </div>
      </div>

      {members.length > 0 && (
        <div className="border-t border-rule pt-4 mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="field-label">Highlighted members &middot; {highlighted.length}</h3>
              <p className="text-[12.5px] text-ink-3 mt-1 max-w-prose">
                Default is the top {defaultIds.length} who beat the {benchmarkLabel}.
                Click a name to drop the highlight; pick anyone below to add one.
                A high return is not evidence of wrongdoing.
              </p>
            </div>
            {!atDefaultHighlights && (
              <button
                type="button"
                onClick={() => setHighlightIds(new Set(defaultIds))}
                className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] tracking-[0.06em] uppercase text-accent hover:underline cursor-pointer shrink-0"
              >
                Reset to top performers
              </button>
            )}
          </div>
          {highlighted.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {highlighted.map((m) => (
                <button
                  key={m.bioguideId}
                  type="button"
                  onClick={() => setHighlightIds((prev) => toggleId(prev, m.bioguideId))}
                  className="inline-flex items-center gap-[6px] border border-rule rounded px-[9px] py-[3px] text-[12px] hover:border-ink-3"
                  title={`Remove ${m.name}`}
                >
                  <span className="font-medium text-ink">{m.name}</span>
                  <span className="font-mono tabular text-ink-3">{pct(m.returnPct)}</span>
                  <span className="text-ink-3" aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-3">
            {highlighted.map((m) => (
              <div key={m.bioguideId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px] py-[6px] border-b border-rule last:border-0">
                <button
                  type="button"
                  onClick={() => setHighlightIds((prev) => toggleId(prev, m.bioguideId))}
                  className="appearance-none bg-transparent border-none p-0 font-medium text-ink hover:text-accent text-left cursor-pointer"
                >
                  {m.name}
                </button>
                {m.chamber && <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{m.chamber}</span>}
                {m.exceptional && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-accent">outlier</span>
                )}
                <span className="font-mono font-semibold text-ink tabular">{pct(m.returnPct)}</span>
                <span className="text-ink-3">
                  {pct(m.vsBenchmarkPct)} vs {benchmarkLabel}
                </span>
                <span className="text-ink-3">
                  {plural(m.purchases, 'purchase', 'purchases')}
                  {m.thin ? ' · thin record' : ''}
                </span>
                <a
                  href={`${baseUrl}members/${m.bioguideId}/`}
                  className="font-mono text-[11px] tracking-[0.06em] uppercase text-accent hover:underline"
                >
                  Profile
                </a>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-rule">
            <label className="field-label block mb-2" htmlFor="member-highlight-search">
              Choose a member to highlight
            </label>
            <div className="flex flex-wrap gap-3">
              <input
                id="member-highlight-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search House or Senate members…"
                className="min-w-[12rem] flex-1 box-border appearance-none bg-transparent border-b border-rule pb-[6px] text-[13px] focus:outline-none focus:border-ink placeholder:text-ink-3"
              />
              <select
                value={chamber}
                onChange={(e) => setChamber(e.target.value as ChamberFilter)}
                aria-label="Filter by chamber"
                className="appearance-none bg-transparent border-b border-rule pb-[6px] text-[13px] cursor-pointer focus:outline-none"
              >
                <option value="all">All chambers</option>
                <option value="House">House</option>
                <option value="Senate">Senate</option>
              </select>
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto border border-rule">
              {pickerMembers.length === 0 && (
                <div className="px-2 py-2 text-[11px] text-ink-3">No members match that search.</div>
              )}
              {pickerMembers.map((m) => {
                const on = highlightIds.has(m.bioguideId);
                return (
                  <button
                    key={m.bioguideId}
                    type="button"
                    onClick={() => setHighlightIds((prev) => toggleId(prev, m.bioguideId))}
                    aria-pressed={on}
                    className={`w-full flex flex-wrap items-baseline gap-x-2 gap-y-[2px] px-2 py-[6px] text-left text-[12.5px] border-b border-rule last:border-0 hover:bg-rule-2 ${on ? 'bg-rule-2' : ''}`}
                  >
                    <span className={on ? 'font-medium text-ink' : 'text-ink-2'}>{m.name}</span>
                    {m.chamber && <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{m.chamber}</span>}
                    {m.exceptional && <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-accent">outlier</span>}
                    <span className="font-mono text-ink-3 tabular ml-auto">{pct(m.returnPct)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <p className="font-mono text-[10.5px] leading-[1.6] text-ink-3 border-l-2 border-accent pl-3 mt-6">
        Estimates, not a real fund. Disclosures report amounts as ranges, so each trade is modelled at the
        midpoint of its range. Actual positions may be several times larger or smaller. {money(contributed, true)}{' '}
        of disclosed purchases are in the all-trades book
        {hasCommittee ? `; ${money(committeeContributed, true)} in the committee book` : ''}.
        {' '}The {benchmarkLabel} line is the same money as Trading (all), invested in an index
        fund on the same days. Trading (committee) is growth per dollar of those trades
        only — not the same dollars.
        {hasCommittee && summary.committeeBenchmarkReturnPct != null && (
          <> On their own dates, those committee trades vs the {benchmarkLabel}:{' '}
          <strong className="text-ink font-semibold">{pct(summary.committeeVsOwnBenchmarkPct)}</strong>.</>
        )}
        {exclusions.length > 0 && <> Excluded: {exclusions.join('; ')}.</>}
      </p>

      <div className="mt-3 flex flex-wrap gap-5">
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] tracking-[0.06em] uppercase text-accent hover:underline cursor-pointer"
          aria-expanded={showGuide}
        >
          {showGuide ? 'Hide guide' : 'How to read this chart'}
        </button>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] tracking-[0.06em] uppercase text-accent hover:underline cursor-pointer"
          aria-expanded={showTable}
        >
          {showTable ? 'Hide data table' : 'View as data table'}
        </button>
      </div>

      {showGuide && (
        <div className="border-t border-rule pt-4 mt-3 space-y-4 text-[13px] leading-[1.6] text-ink-2">
          <div>
            <h3 className="font-serif text-lg font-medium text-ink mb-1">The flat line at 0% is cash</h3>
            <p>
              It represents leaving the money uninvested. Everything is measured against it:
              above the line made money, below it lost money.
            </p>
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-ink mb-1">What each line is</h3>
            <div>
              {lines.map((l) => (
                <div key={l.key} className="flex items-start gap-[10px] py-1">
                  <svg width="14" height="10" className="mt-1 shrink-0" aria-hidden="true">
                    <line x1="0" y1="5" x2="14" y2="5" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
                  </svg>
                  <span>
                    <strong className="text-ink font-semibold">{l.label}</strong>
                    {l.key === 'cash' && ' — money never invested. Always flat.'}
                    {l.key === 'all' && ' — every disclosed purchase, pooled as if it were one portfolio. One member\'s sale cannot close another member\'s shares.'}
                    {l.key === 'benchmark' && ` — the same money as Trading (all), on the same days, in an ${benchmarkLabel} index fund instead.`}
                    {l.key === 'committee' && ' — only purchases in a sector that member\'s committee oversees. A smaller pot of money, on different days.'}
                  </span>
                </div>
              ))}
              <div className="flex items-start gap-[10px] py-1">
                <svg width="14" height="10" className="mt-1 shrink-0" aria-hidden="true">
                  <line x1="0" y1="5" x2="14" y2="5" stroke={SERIES.member} strokeWidth="1.5" />
                </svg>
                <span>
                  <strong className="text-ink font-semibold">Each member</strong>
                  {' — the faint lines. Same percent-return scale, each on their own disclosed purchases. Toggle them off to read the four strategy lines alone.'}
                </span>
              </div>
              <div className="flex items-start gap-[10px] py-1">
                <svg width="14" height="10" className="mt-1 shrink-0" aria-hidden="true">
                  <line x1="0" y1="5" x2="14" y2="5" stroke={SERIES.highlight} strokeWidth="2" />
                </svg>
                <span>
                  <strong className="text-ink font-semibold">Highlighted members</strong>
                  {' — the lines you choose, drawn bolder. The default set is the top performers who also beat the '}
                  {benchmarkLabel}
                  {'. An "outlier" mark is a statistical upper Tukey outlier. Use + / − to rescale; a line that shoots off the top is clipped until you zoom out.'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-ink mb-1">Height is percent gained, not dollars</h3>
            <p>
              Showing dollars would make Trading (all) dwarf the committee line simply because
              more money was involved. Percent per dollar invested is the comparison the bars
              and the chart are both making.
            </p>
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-ink mb-1">Reading the bars</h3>
            <div className="space-y-1">
              <p>
                <strong className="text-ink font-semibold">Trading (all) vs {benchmarkLabel}</strong>
                {' — '}
                {allBeatMarket
                  ? 'disclosed trading as a whole beat a plain index fund.'
                  : 'a plain index fund did better than disclosed trading as a whole.'}
              </p>
              {hasCommittee && (
                <p>
                  <strong className="text-ink font-semibold">Trading (committee) vs Trading (all)</strong>
                  {' — '}
                  {committeeBeatAll
                    ? 'committee-overlap trades grew faster, per dollar, than the rest.'
                    : 'committee-overlap trades did not grow faster, per dollar, than all disclosed trading.'}
                  {' '}On their own dates versus the {benchmarkLabel},{' '}
                  {committeeBeatOwnMarket ? 'they beat it.' : 'the index fund did better.'}
                </p>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-ink mb-1">What this does not show</h3>
            <p>
              Beating or trailing the market is not evidence of wrongdoing. Members file these
              disclosures because the law requires it, and most trades are ordinary investing —
              often made by a financial adviser rather than the member. A committee overlap is a
              reason to look closer, not a finding.
            </p>
          </div>
        </div>
      )}

      {showTable && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[11.5px] text-left">
            <caption className="sr-only">
              Growth per dollar invested by date for each strategy
            </caption>
            <thead>
              <tr className="border-b border-ink">
                <th scope="col" className="py-2 pr-4 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">Date</th>
                {lines.map((l) => (
                  <th key={l.key} scope="col" className="py-2 pr-4 font-mono text-[10px] tracking-[0.08em] uppercase text-ink-3 font-normal">{l.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d, i) => (
                <tr key={d} className="border-b border-rule">
                  <th scope="row" className="py-[6px] pr-4 font-mono font-normal text-ink-3 tabular">{d}</th>
                  {lines.map((l) => (
                    <td key={l.key} className="py-[6px] pr-4 font-mono tabular">{pct(l.plot[i])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
