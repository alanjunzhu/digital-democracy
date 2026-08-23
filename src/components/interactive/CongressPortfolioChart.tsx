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

/**
 * Party colors already mean something on this site (blue D, red R, violet I), so
 * the series use a party-neutral set. Committee overlap is the one exception:
 * it is already red everywhere else, so that line keeps the same meaning.
 */
const SERIES = {
  cash: '#9ca3af',
  all: '#0d9488',
  benchmark: '#d97706',
  committee: '#b91c1c',
  member: '#94a3b8',
  highlight: '#6d28d9',
} as const;

const PAD = { top: 16, right: 132, bottom: 28, left: 60 };
const W = 720;
const H = 340;

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

function spreadLabels(entries: { key: string; y: number }[], minGap = 12) {
  const sorted = [...entries].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y;
    if (gap < minGap) sorted[i].y = sorted[i - 1].y + minGap;
  }
  return Object.fromEntries(sorted.map((e) => [e.key, e.y]));
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function shortName(name: string, max = 18) {
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
        dash: '5 4',
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
    const path = (values: number[]) =>
      values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return { x, y, path, ticks, plotW, plotH, top, domain };
  }, [dates, highlighted, members, visible, zoom]);

  const clippedHighlights = highlighted.filter((m) => isReturnClipped(m.returnPct, geom.domain));

  const labelY = spreadLabels([
    ...visible.map((l) => ({ key: l.key, y: geom.y(l.plot[l.plot.length - 1]) + 3 })),
    ...highlighted.map((m) => ({
      key: m.bioguideId,
      y: Math.max(PAD.top + 8, Math.min(geom.y(m.plot[m.plot.length - 1]) + 3, H - PAD.bottom)),
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Cash vs trading vs the market</h2>
      <p className="text-xs text-gray-500 mt-1 max-w-3xl">
        If every disclosed purchase in Congress had been one portfolio, how would it have
        done against putting the same money into the {benchmarkLabel} on the same days, or
        leaving it in cash?{' '}
        {hasCommittee && (
          <>
            A fourth line keeps only the trades in a sector that member&apos;s committee
            oversees.{' '}
          </>
        )}
        Faint lines are each member; violet lines are the ones currently highlighted —
        top performers by default, or whoever you pick.
      </p>
      <p className="text-[11px] text-gray-400 mt-1">
        Pooled from {plural(counts.purchases, 'purchase', 'purchases')} by{' '}
        {plural(counts.members, 'member', 'members')}
        {hasCommittee
          ? ` · committee line uses ${plural(counts.overlapPurchases, 'purchase', 'purchases')} by ${plural(counts.overlapMembers, 'member', 'members')}`
          : ''}
        {summary.asOf ? ` · through ${summary.asOf}` : ''}.
      </p>

      {/* Ending-return bars — the readable illustration */}
      <div className="mt-5 space-y-2" role="list" aria-label="Ending return for each strategy">
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
              className={`w-full grid grid-cols-[9.5rem_1fr_4.5rem] sm:grid-cols-[11rem_1fr_5rem] items-center gap-3 text-left ${isHidden ? 'opacity-40' : ''}`}
            >
              <span className="flex items-center gap-2 text-[12px] text-gray-700 min-w-0">
                <svg width="16" height="8" aria-hidden="true" className="shrink-0">
                  <line x1="0" y1="4" x2="16" y2="4" stroke={l.color} strokeWidth="2.5" strokeDasharray={l.dash} />
                </svg>
                <span className="truncate">
                  {l.label}
                  {l.key === bestKey && !isHidden && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-gray-400">highest</span>
                  )}
                </span>
              </span>
              <span className="relative h-7 bg-slate-50 rounded-md overflow-hidden border border-slate-100">
                {barDiverging && (
                  <span className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300" aria-hidden="true" />
                )}
                <span
                  className="absolute top-1.5 bottom-1.5 rounded-sm"
                  style={{
                    background: l.color,
                    width,
                    ...(barDiverging
                      ? value >= 0
                        ? { left: '50%' }
                        : { right: '50%' }
                      : { left: 0 }),
                    opacity: l.key === 'cash' ? 0.45 : 0.9,
                  }}
                />
              </span>
              <span className="text-sm font-semibold tabular-nums text-gray-900 text-right">
                {pct(l.returnPct)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        Click a strategy to show or hide it on the chart. Height is percent gained per dollar
        invested, not dollars — committee trades are a smaller pot of money on different days.
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {members.length > 0 ? (
          <label className="flex items-center gap-2 text-[11px] text-gray-600">
            <input
              type="checkbox"
              checked={showMembers}
              onChange={(e) => setShowMembers(e.target.checked)}
            />
            <span className="flex items-center gap-1.5">
              <svg width="16" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="16" y2="4" stroke={SERIES.member} strokeWidth="1.5" />
              </svg>
              Individual members ({members.length})
            </span>
          </label>
        ) : <span />}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-1">Scale</span>
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z - 1))}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Zoom in"
            title="Zoom in — tighter axis, strategy lines clearer"
            className="w-7 h-7 rounded border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z + 1))}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom out"
            title="Zoom out — wider axis, show clipped members"
            className="w-7 h-7 rounded border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            −
          </button>
          <span className="text-[11px] text-gray-600 tabular-nums min-w-[5.5rem]">
            {ZOOM_LABELS[zoom as keyof typeof ZOOM_LABELS]}
          </span>
          {zoom !== ZOOM_DEFAULT && (
            <button
              type="button"
              onClick={() => setZoom(ZOOM_DEFAULT)}
              className="text-[11px] text-blue-600 hover:text-blue-800"
            >
              Reset scale
            </button>
          )}
        </div>
      </div>
      <p className="text-[10px] text-gray-400 mt-1">
        + tightens around the strategy lines. − widens the axis.
        {clippedHighlights.length > 0
          ? ` Use − if a highlighted line is clipped (${clippedHighlights.map((m) => m.name).join(', ')}).`
          : ''}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full mt-3"
        style={{ height: 'auto' }}
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
          <g key={t}>
            <line
              x1={PAD.left} y1={geom.y(t)} x2={W - PAD.right} y2={geom.y(t)}
              stroke={t === 0 ? '#e2e8f0' : '#f1f5f9'} strokeWidth="1"
            />
            <text x={PAD.left - 8} y={geom.y(t) + 3} fontSize="10" fill="#94a3b8" textAnchor="end">
              {`${t > 0 ? '+' : ''}${t.toFixed(t % 1 === 0 ? 0 : 1)}%`}
            </text>
          </g>
        ))}

        <text x={PAD.left} y={H - 8} fontSize="10" fill="#94a3b8">{dates[0]}</text>
        <text x={W - PAD.right} y={H - 8} fontSize="10" fill="#94a3b8" textAnchor="end">
          {dates[dates.length - 1]}
        </text>

        <g clipPath={`url(#plot-${clipId})`}>
          {showMembers && swarm.map((m) => (
            <path
              key={m.bioguideId}
              d={geom.path(m.plot)}
              fill="none"
              stroke={SERIES.member}
              strokeWidth="1"
              strokeOpacity="0.28"
              strokeLinejoin="round"
            />
          ))}
          {highlighted.map((m) => (
            <path
              key={m.bioguideId}
              d={geom.path(m.plot)}
              fill="none"
              stroke={SERIES.highlight}
              strokeWidth="2.25"
              strokeLinejoin="round"
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
            />
          ))}
        </g>

        {visible.map((l) => (
          <text key={l.key} x={W - PAD.right + 6} y={labelY[l.key]} fontSize="10" fill="#64748b">
            {l.label}
          </text>
        ))}
        {highlighted.map((m) => (
          <text
            key={m.bioguideId}
            x={W - PAD.right + 6}
            y={labelY[m.bioguideId]}
            fontSize="10"
            fill={SERIES.highlight}
          >
            {shortName(m.name)}
          </text>
        ))}

        {hoverIdx != null && (
          <line
            x1={geom.x(hoverIdx)} y1={PAD.top} x2={geom.x(hoverIdx)} y2={H - PAD.bottom}
            stroke="#cbd5e1" strokeWidth="1"
          />
        )}
        {hoverIdx != null && visible.map((l) => (
          <circle
            key={l.key}
            cx={geom.x(hoverIdx)}
            cy={geom.y(l.plot[hoverIdx])}
            r="4"
            fill={l.color}
            stroke="#ffffff"
            strokeWidth="2"
          />
        ))}
        {hoverIdx != null && nearestMember && (
          <circle
            cx={geom.x(hoverIdx)}
            cy={geom.y(nearestMember.plot[hoverIdx] ?? 0)}
            r="3.5"
            fill={highlightIds.has(nearestMember.bioguideId) ? SERIES.highlight : SERIES.member}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
        )}
      </svg>

      <div className="min-h-[2.5rem] mt-1">
        {hoverIdx != null ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-700">
            <span className="font-medium text-gray-900">{dates[hoverIdx]}</span>
            {visible.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5">
                <svg width="10" height="8" aria-hidden="true">
                  <line x1="0" y1="4" x2="10" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
                </svg>
                {pct(l.plot[hoverIdx])} <span className="text-gray-400">({money(l.values[hoverIdx], true)})</span>
              </span>
            ))}
            {nearestMember && (
              <span className="flex items-center gap-1.5">
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
          <p className="text-[11px] text-gray-400">Hover the chart for values on a given day.</p>
        )}
      </div>

      {members.length > 0 && (
        <div className="mt-4 rounded-md border border-violet-100 bg-violet-50/60 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-violet-950">
                Highlighted members ({highlighted.length})
              </h3>
              <p className="text-[11px] text-violet-900/70 mt-0.5">
                Default is the top {defaultIds.length} who beat the {benchmarkLabel}.
                Click a name to drop the highlight; pick anyone below to add one.
                A high return is not evidence of wrongdoing.
              </p>
            </div>
            {!atDefaultHighlights && (
              <button
                type="button"
                onClick={() => setHighlightIds(new Set(defaultIds))}
                className="text-[11px] text-violet-800 hover:text-violet-950 shrink-0"
              >
                Reset to top performers
              </button>
            )}
          </div>
          {highlighted.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {highlighted.map((m) => (
                <li key={m.bioguideId}>
                  <button
                    type="button"
                    onClick={() => setHighlightIds((prev) => toggleId(prev, m.bioguideId))}
                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[11px] text-violet-950 hover:border-violet-400"
                    title={`Remove ${m.name}`}
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="tabular-nums text-gray-600">{pct(m.returnPct)}</span>
                    <span className="text-violet-400" aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-3 space-y-1.5">
            {highlighted.map((m) => (
              <li key={m.bioguideId} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
                <button
                  type="button"
                  onClick={() => setHighlightIds((prev) => toggleId(prev, m.bioguideId))}
                  className="font-medium text-violet-900 hover:underline text-left"
                >
                  {m.name}
                </button>
                {m.chamber && <span className="text-[10px] uppercase tracking-wide text-gray-400">{m.chamber}</span>}
                {m.exceptional && (
                  <span className="text-[10px] uppercase tracking-wide text-violet-700">outlier</span>
                )}
                <span className="tabular-nums font-semibold text-gray-900">{pct(m.returnPct)}</span>
                <span className="text-gray-500">
                  {pct(m.vsBenchmarkPct)} vs {benchmarkLabel}
                </span>
                <span className="text-gray-400">
                  {plural(m.purchases, 'purchase', 'purchases')}
                  {m.thin ? ' · thin record' : ''}
                </span>
                <a
                  href={`${baseUrl}members/${m.bioguideId}/`}
                  className="text-[11px] text-blue-600 hover:text-blue-800"
                >
                  Profile
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-3 pt-3 border-t border-violet-100">
            <label className="text-[11px] font-medium text-violet-950" htmlFor="member-highlight-search">
              Choose a member to highlight
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <input
                id="member-highlight-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search House or Senate members…"
                className="min-w-[12rem] flex-1 rounded-md border border-violet-200 bg-white px-2 py-1.5 text-[12px] text-gray-800"
              />
              <select
                value={chamber}
                onChange={(e) => setChamber(e.target.value as ChamberFilter)}
                aria-label="Filter by chamber"
                className="rounded-md border border-violet-200 bg-white px-2 py-1.5 text-[12px] text-gray-800"
              >
                <option value="all">All chambers</option>
                <option value="House">House</option>
                <option value="Senate">Senate</option>
              </select>
            </div>
            <ul className="mt-2 max-h-40 overflow-y-auto divide-y divide-violet-50 rounded-md border border-violet-100 bg-white">
              {pickerMembers.length === 0 && (
                <li className="px-2 py-2 text-[11px] text-gray-400">No members match that search.</li>
              )}
              {pickerMembers.map((m) => {
                const on = highlightIds.has(m.bioguideId);
                return (
                  <li key={m.bioguideId}>
                    <button
                      type="button"
                      onClick={() => setHighlightIds((prev) => toggleId(prev, m.bioguideId))}
                      aria-pressed={on}
                      className={`w-full flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-2 py-1.5 text-left text-[12px] hover:bg-violet-50 ${on ? 'bg-violet-50/80' : ''}`}
                    >
                      <span className={`font-medium ${on ? 'text-violet-900' : 'text-gray-800'}`}>{m.name}</span>
                      {m.chamber && <span className="text-[10px] uppercase tracking-wide text-gray-400">{m.chamber}</span>}
                      {m.exceptional && <span className="text-[10px] uppercase tracking-wide text-violet-700">outlier</span>}
                      <span className="tabular-nums text-gray-600 ml-auto">{pct(m.returnPct)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-md bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-600 space-y-1.5">
        <p>
          <strong className="text-gray-700">Estimates, not a real fund.</strong> Disclosures
          report amounts as ranges, so each trade is modelled at the midpoint of its range.
          Actual positions may be several times larger or smaller. {money(contributed, true)}{' '}
          of disclosed purchases are in the all-trades book
          {hasCommittee ? `; ${money(committeeContributed, true)} in the committee book` : ''}.
        </p>
        <p>
          The {benchmarkLabel} line is the same money as Trading (all), invested in an index
          fund on the same days. Trading (committee) is growth per dollar of those trades
          only — not the same dollars.
          {hasCommittee && summary.committeeBenchmarkReturnPct != null && (
            <>
              {' '}On their own dates, those committee trades vs the {benchmarkLabel}:{' '}
              <strong className="text-gray-800">{pct(summary.committeeVsOwnBenchmarkPct)}</strong>.
            </>
          )}
        </p>
        {exclusions.length > 0 && <p>Excluded: {exclusions.join('; ')}.</p>}
        <p className="text-gray-400 pt-1 border-t border-gray-200">
          Past performance describes disclosed trades only. Beating or trailing the market is
          not evidence of insider trading or wrongdoing.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="text-[11px] text-blue-600 hover:text-blue-800"
          aria-expanded={showGuide}
        >
          {showGuide ? 'Hide guide' : 'How to read this chart'}
        </button>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-[11px] text-blue-600 hover:text-blue-800"
          aria-expanded={showTable}
        >
          {showTable ? 'Hide data table' : 'View as data table'}
        </button>
      </div>

      {showGuide && (
        <div className="mt-3 rounded-md border border-gray-200 p-4 text-xs text-gray-700 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">The flat line at 0% is cash</h3>
            <p>
              It represents leaving the money uninvested. Everything is measured against it:
              above the line made money, below it lost money.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">What each line is</h3>
            <ul className="space-y-1.5">
              {lines.map((l) => (
                <li key={l.key} className="flex items-start gap-2">
                  <svg width="14" height="10" className="mt-1 shrink-0" aria-hidden="true">
                    <line x1="0" y1="5" x2="14" y2="5" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
                  </svg>
                  <span>
                    <strong className="text-gray-900">{l.label}</strong>
                    {l.key === 'cash' && ' — money never invested. Always flat.'}
                    {l.key === 'all' && ' — every disclosed purchase, pooled as if it were one portfolio. One member\'s sale cannot close another member\'s shares.'}
                    {l.key === 'benchmark' && ` — the same money as Trading (all), on the same days, in an ${benchmarkLabel} index fund instead.`}
                    {l.key === 'committee' && ' — only purchases in a sector that member\'s committee oversees. A smaller pot of money, on different days.'}
                  </span>
                </li>
              ))}
              <li className="flex items-start gap-2">
                <svg width="14" height="10" className="mt-1 shrink-0" aria-hidden="true">
                  <line x1="0" y1="5" x2="14" y2="5" stroke={SERIES.member} strokeWidth="1.5" />
                </svg>
                <span>
                  <strong className="text-gray-900">Each member</strong>
                  {' — the faint lines. Same percent-return scale, each on their own disclosed purchases. Toggle them off to read the four strategy lines alone.'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <svg width="14" height="10" className="mt-1 shrink-0" aria-hidden="true">
                  <line x1="0" y1="5" x2="14" y2="5" stroke={SERIES.highlight} strokeWidth="2" />
                </svg>
                <span>
                  <strong className="text-gray-900">Highlighted members</strong>
                  {' — violet lines you choose. The default set is the top performers who also beat the '}
                  {benchmarkLabel}
                  {'. An "outlier" badge marks a statistical upper Tukey outlier. Use + / − to rescale; a line that shoots off the top is clipped until you zoom out.'}
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Height is percent gained, not dollars</h3>
            <p>
              Showing dollars would make Trading (all) dwarf the committee line simply because
              more money was involved. Percent per dollar invested is the comparison the bars
              and the chart are both making.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Reading the bars</h3>
            <ul className="space-y-1">
              <li>
                <strong className="text-gray-900">Trading (all) vs {benchmarkLabel}</strong>
                {' — '}
                {allBeatMarket
                  ? 'disclosed trading as a whole beat a plain index fund.'
                  : 'a plain index fund did better than disclosed trading as a whole.'}
              </li>
              {hasCommittee && (
                <li>
                  <strong className="text-gray-900">Trading (committee) vs Trading (all)</strong>
                  {' — '}
                  {committeeBeatAll
                    ? 'committee-overlap trades grew faster, per dollar, than the rest.'
                    : 'committee-overlap trades did not grow faster, per dollar, than all disclosed trading.'}
                  {' '}On their own dates versus the {benchmarkLabel},{' '}
                  {committeeBeatOwnMarket ? 'they beat it.' : 'the index fund did better.'}
                </li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">What this does not show</h3>
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
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[11px] text-left">
            <caption className="sr-only">
              Growth per dollar invested by date for each strategy
            </caption>
            <thead className="text-gray-500 border-b border-gray-200">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                {lines.map((l) => (
                  <th key={l.key} scope="col" className="py-1 pr-3 font-medium">{l.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {dates.map((d, i) => (
                <tr key={d} className="border-b border-gray-100">
                  <th scope="row" className="py-1 pr-3 font-normal">{d}</th>
                  {lines.map((l) => (
                    <td key={l.key} className="py-1 pr-3">{pct(l.plot[i])}</td>
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
