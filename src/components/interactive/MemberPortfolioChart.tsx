import { useMemo, useState } from 'react';
import type { MemberPortfolio, PortfolioMarker } from '../../lib/types';

interface Props {
  portfolio: MemberPortfolio;
  memberName: string;
  benchmarkLabel?: string;
}

/**
 * Party colors already mean something on this site (blue D, red R, violet I), so
 * the series use a party-neutral set. Validated for CVD separation and contrast
 * against a light surface; the cash line is a neutral reference, not a category.
 */
const SERIES = {
  member: '#0d9488',
  benchmark: '#d97706',
  follower: '#c026d3',
  cash: '#9ca3af',
} as const;

const PAD = { top: 16, right: 96, bottom: 28, left: 60 };
const W = 720;
const H = 300;

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

/** Rounded ticks bracketing a signed range, always including zero. */
function niceTicks(min: number, max: number, count = 4) {
  const span = Math.max(max - min, 1);
  const rough = span / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10;
  // Round the top tick up, not down, or any series above it clips out of frame.
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step * 0.001; v += step) {
    ticks.push(Math.abs(v) < step * 0.001 ? 0 : v);
  }
  return ticks;
}

/** Nudge overlapping end labels apart so none is unreadable. */
function spreadLabels(entries: { key: string; y: number }[], minGap = 12) {
  const sorted = [...entries].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y;
    if (gap < minGap) sorted[i].y = sorted[i - 1].y + minGap;
  }
  return Object.fromEntries(sorted.map((e) => [e.key, e.y]));
}

export default function MemberPortfolioChart({
  portfolio,
  memberName,
  benchmarkLabel = 'S&P 500',
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { dates, member, benchmark, cash, follower, followerCash, summary, skipped, markers } = portfolio;

  // Contributions arrive in a lump early on, so plotting raw dollars squeezes
  // every line into the top of the plot. Indexing each series to the capital
  // deployed on that day removes the ramp and leaves only the thing being
  // compared: growth per dollar invested. Cash becomes a flat 0% baseline.
  const growth = useMemo(() => {
    const index = (values: number[], deployed: number[]) =>
      values.map((v, i) => (deployed[i] > 0 ? (v / deployed[i] - 1) * 100 : 0));
    return {
      member: index(member, cash),
      benchmark: index(benchmark, cash),
      // The follower buys later, so it is measured against its own deployed
      // capital — otherwise it reads as a deep loss for simply not having bought.
      follower: index(follower, followerCash),
      cash: cash.map(() => 0),
    };
  }, [member, benchmark, cash, follower, followerCash]);

  const geom = useMemo(() => {
    const all = [...growth.member, ...growth.benchmark, ...growth.follower, 0];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const padding = Math.max((hi - lo) * 0.12, 1);
    const ticks = niceTicks(lo - padding, hi + padding);
    const bottom = ticks[0];
    const top = ticks[ticks.length - 1];
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const x = (i: number) => PAD.left + (dates.length < 2 ? 0 : (i / (dates.length - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - ((v - bottom) / (top - bottom || 1)) * plotH;
    const path = (values: number[]) =>
      values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

    return { x, y, path, ticks, plotW, plotH };
  }, [dates, growth]);

  // Markers land on trade dates, which may have been dropped by downsampling.
  const markerPoints = useMemo(() => {
    return markers
      .map((m: PortfolioMarker) => {
        let idx = dates.findIndex((d) => d >= m.date);
        if (idx < 0) idx = dates.length - 1;
        return { ...m, idx };
      })
      .filter((m) => m.idx >= 0);
  }, [markers, dates]);

  const lines = [
    { key: 'member', label: memberName, color: SERIES.member, values: member, plot: growth.member, dash: undefined },
    { key: 'benchmark', label: benchmarkLabel, color: SERIES.benchmark, values: benchmark, plot: growth.benchmark, dash: undefined },
    { key: 'follower', label: 'Filing reader', color: SERIES.follower, values: follower, plot: growth.follower, dash: undefined },
    { key: 'cash', label: 'Not invested', color: SERIES.cash, values: cash, plot: growth.cash, dash: '5 4' },
  ];

  const labelY = spreadLabels(
    lines.map((l) => ({ key: l.key, y: geom.y(l.plot[l.plot.length - 1]) + 3 })),
  );

  const hoverIdx = hover != null ? Math.min(Math.max(hover, 0), dates.length - 1) : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (rel - PAD.left) / geom.plotW;
    setHover(Math.round(frac * (dates.length - 1)));
  }

  const beatIndex = summary.vsBenchmarkPct != null && summary.vsBenchmarkPct > 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Disclosed trades vs the market</h2>
      <p className="text-xs text-gray-500 mt-1 max-w-2xl">
        What {money(summary.contributed)} of disclosed purchases would be worth today, against
        putting the same money into the {benchmarkLabel} on the same days, or not investing it.
        The chart shows growth per dollar invested, so the contribution schedule itself does not
        move the lines.
      </p>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 mb-5">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-xl font-bold text-gray-900">{money(summary.endMember, true)}</div>
          <div className="text-[10px] text-gray-500">Estimated value today</div>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className={`text-xl font-bold ${beatIndex ? 'text-gray-900' : 'text-gray-900'}`}>
            {pct(summary.vsBenchmarkPct)}
          </div>
          <div className="text-[10px] text-gray-500">vs {benchmarkLabel}</div>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-xl font-bold text-gray-900">{pct(summary.vsCashPct)}</div>
          <div className="text-[10px] text-gray-500">vs not investing</div>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-xl font-bold text-gray-900">{pct(summary.disclosureGapPct)}</div>
          <div className="text-[10px] text-gray-500">Edge lost to filing delay</div>
        </div>
      </div>

      {/* Legend — identity is never carried by color alone */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {lines.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <svg width="14" height="8" aria-hidden="true">
              <line
                x1="0" y1="4" x2="14" y2="4"
                stroke={l.color} strokeWidth="2" strokeDasharray={l.dash}
              />
            </svg>
            {l.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 'auto' }}
        role="img"
        aria-label={`Growth per dollar invested over time for ${memberName} against the ${benchmarkLabel}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid and y axis */}
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

        {/* x axis end labels */}
        <text x={PAD.left} y={H - 8} fontSize="10" fill="#94a3b8">{dates[0]}</text>
        <text x={W - PAD.right} y={H - 8} fontSize="10" fill="#94a3b8" textAnchor="end">
          {dates[dates.length - 1]}
        </text>

        {/* Series */}
        {lines.map((l) => (
          <path
            key={l.key}
            d={geom.path(l.plot)}
            fill="none"
            stroke={l.color}
            strokeWidth="2"
            strokeDasharray={l.dash}
            strokeLinejoin="round"
          />
        ))}

        {/* Direct labels at the line ends */}
        {lines.map((l) => (
          <text
            key={l.key}
            x={W - PAD.right + 6}
            y={labelY[l.key]}
            fontSize="10"
            fill="#64748b"
          >
            {l.label.length > 14 ? `${l.label.slice(0, 13)}…` : l.label}
          </text>
        ))}

        {/* Trade markers on the member line; overlap trades get a ring */}
        {markerPoints.map((m, i) => (
          <circle
            key={`${m.date}-${m.ticker}-${i}`}
            cx={geom.x(m.idx)}
            cy={geom.y(growth.member[m.idx])}
            r={m.committeeOverlap ? 4 : 2.5}
            fill={m.isPurchase ? SERIES.member : '#ffffff'}
            stroke={m.committeeOverlap ? '#b91c1c' : SERIES.member}
            strokeWidth={m.committeeOverlap ? 2 : 1.5}
          >
            <title>
              {`${m.isPurchase ? 'Bought' : 'Sold'} ${m.ticker} ${m.date} · ${m.amountLabel}`}
              {m.owner ? ` · ${m.owner}` : ''}
              {m.committeeOverlap ? ' · committee overlap' : ''}
            </title>
          </circle>
        ))}

        {/* Crosshair */}
        {hoverIdx != null && (
          <line
            x1={geom.x(hoverIdx)} y1={PAD.top} x2={geom.x(hoverIdx)} y2={H - PAD.bottom}
            stroke="#cbd5e1" strokeWidth="1"
          />
        )}
        {hoverIdx != null && lines.map((l) => (
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
      </svg>

      {/* Tooltip below the plot, so it never clips the SVG */}
      <div className="min-h-[2.5rem] mt-1">
        {hoverIdx != null ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-700">
            <span className="font-medium text-gray-900">{dates[hoverIdx]}</span>
            {lines.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5">
                <svg width="10" height="8" aria-hidden="true">
                  <line x1="0" y1="4" x2="10" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
                </svg>
                {pct(l.plot[hoverIdx])} <span className="text-gray-400">({money(l.values[hoverIdx], true)})</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">Hover the chart for values on a given day.</p>
        )}
      </div>

      {/* Caveats — these are estimates and must read as estimates */}
      <div className="mt-4 rounded-md bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-600 space-y-1.5">
        <p>
          <strong className="text-gray-700">Estimates, not holdings.</strong> Disclosures report
          amounts as ranges, so each trade is modelled at the midpoint of its range. Actual
          positions may be several times larger or smaller.
        </p>
        <p>
          The <em>filing reader</em> line repeats the same purchases on the date each one was
          publicly disclosed — the first day anyone outside Congress could have acted on it.
        </p>
        {skipped.unmatchedSales > 0 && (
          <p>
            {skipped.unmatchedSales} sale{skipped.unmatchedSales === 1 ? '' : 's'} of positions
            acquired before this window are not represented — only trades disclosed here can be
            modelled.
          </p>
        )}
        {(skipped.noPrice > 0 || skipped.noAmount > 0) && (
          <p>
            Excluded: {skipped.noPrice} trade{skipped.noPrice === 1 ? '' : 's'} with no cached price
            history, {skipped.noAmount} with no reported amount.
          </p>
        )}
        <p className="text-gray-400 pt-1 border-t border-gray-200">
          Past performance describes disclosed trades only. It is not evidence of insider trading or
          wrongdoing.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className="mt-3 text-[11px] text-blue-600 hover:text-blue-800"
      >
        {showTable ? 'Hide data table' : 'View as data table'}
      </button>

      {showTable && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[11px] text-left">
            <caption className="sr-only">
              Estimated portfolio value by date for {memberName}
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
                    <td key={l.key} className="py-1 pr-3">{money(l.values[i], true)}</td>
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
