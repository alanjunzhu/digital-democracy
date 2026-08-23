import { useMemo, useState } from 'react';
import type { CongressComparison } from '../../lib/types';
import { SERIES_COLORS, axisPct, money, niceTicks, pct, spreadLabels } from '../../lib/chart-utils';

interface Props {
  comparison: CongressComparison;
  benchmarkLabel?: string;
}

const PAD = { top: 16, right: 128, bottom: 28, left: 56 };
const W = 760;
const H = 320;

export default function CongressStrategyChart({
  comparison,
  benchmarkLabel = 'S&P 500',
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const { dates, strategies, benchmark, benchmarkDeployed, skipped } = comparison;

  const allTrades = strategies.find((s) => s.key === 'all');
  const committee = strategies.find((s) => s.key === 'committee');

  // Every line is growth per dollar deployed. Plotting dollars instead would
  // just show that Congress as a whole invests far more than the committee
  // subset, which is not the comparison anyone is here for.
  const lines = useMemo(() => {
    const index = (values: number[], deployed: number[]) =>
      values.map((v, i) => (deployed[i] > 0 ? (v / deployed[i] - 1) * 100 : 0));

    return [
      allTrades && {
        key: 'all',
        label: 'All trades',
        color: SERIES_COLORS.primary,
        plot: index(allTrades.value, allTrades.deployed),
        values: allTrades.value,
        dash: undefined,
      },
      committee && {
        key: 'committee',
        label: 'Committee trades',
        color: SERIES_COLORS.variant,
        plot: index(committee.value, committee.deployed),
        values: committee.value,
        dash: undefined,
      },
      {
        key: 'benchmark',
        label: benchmarkLabel,
        color: SERIES_COLORS.benchmark,
        plot: index(benchmark, benchmarkDeployed),
        values: benchmark,
        dash: undefined,
      },
      {
        key: 'cash',
        label: 'Held cash',
        color: SERIES_COLORS.neutral,
        plot: dates.map(() => 0),
        values: benchmarkDeployed,
        dash: '5 4',
      },
    ].filter(Boolean) as {
      key: string;
      label: string;
      color: string;
      plot: number[];
      values: number[];
      dash: string | undefined;
    }[];
  }, [allTrades, committee, benchmark, benchmarkDeployed, dates, benchmarkLabel]);

  const geom = useMemo(() => {
    const all = lines.flatMap((l) => l.plot);
    const lo = Math.min(...all, 0);
    const hi = Math.max(...all, 0);
    // Six steps rather than four: with a ~40-point span the coarser choice
    // rounds out to 20-point ticks and leaves a third of the plot empty.
    const padding = Math.max((hi - lo) * 0.06, 1);
    const ticks = niceTicks(lo - padding, hi + padding, 6);
    const bottom = ticks[0];
    const top = ticks[ticks.length - 1];
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const x = (i: number) => PAD.left + (dates.length < 2 ? 0 : (i / (dates.length - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - ((v - bottom) / (top - bottom || 1)) * plotH;
    const path = (values: number[]) =>
      values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

    return { x, y, path, ticks, plotW, plotH };
  }, [lines, dates]);

  const labelY = spreadLabels(
    lines.map((l) => ({ key: l.key, y: geom.y(l.plot[l.plot.length - 1]) + 3 })),
  );

  const hoverIdx = hover != null ? Math.min(Math.max(hover, 0), dates.length - 1) : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.round(((rel - PAD.left) / geom.plotW) * (dates.length - 1)));
  }

  const tiles = [
    { key: 'all', label: 'All trades', value: allTrades?.returnPct, color: SERIES_COLORS.primary },
    { key: 'committee', label: 'Committee trades', value: committee?.returnPct, color: SERIES_COLORS.variant },
    { key: 'benchmark', label: benchmarkLabel, value: allTrades?.benchmarkReturnPct, color: SERIES_COLORS.benchmark },
    { key: 'cash', label: 'Held cash', value: 0, color: SERIES_COLORS.neutral },
  ];

  const totalSales = strategies.reduce((n, s) => n + s.sales, 0);

  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">
        Four ways to have invested the same money
      </h2>
      <p className="text-xs text-gray-500 mt-1 max-w-3xl">
        Congress disclosed roughly {money(allTrades?.contributed, true)} of stock purchases over
        this period.
        This tracks what that would be worth if you had mirrored every disclosed trade, mirrored
        only the trades made in a sector the member's own committee oversees, bought the{' '}
        {benchmarkLabel} on the same days instead, or simply held the cash.
      </p>

      {/* One tile per line, in legend order */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 mb-5">
        {tiles.map((t) => (
          <div key={t.key} className="p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: t.color }}
                aria-hidden="true"
              />
              <span className="text-xl font-bold text-gray-900">{pct(t.value)}</span>
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Legend — identity is never carried by color alone */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {lines.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <svg width="14" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="14" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
            </svg>
            {l.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Growth per dollar invested for all disclosed congressional trades, committee-overlap trades, the ${benchmarkLabel}, and held cash`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {geom.ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left} y1={geom.y(t)} x2={W - PAD.right} y2={geom.y(t)}
              stroke={t === 0 ? '#e2e8f0' : '#f1f5f9'} strokeWidth="1"
            />
            <text x={PAD.left - 8} y={geom.y(t) + 3} fontSize="10" fill="#94a3b8" textAnchor="end">
              {axisPct(t)}
            </text>
          </g>
        ))}

        <text x={PAD.left} y={H - 8} fontSize="10" fill="#94a3b8">{dates[0]}</text>
        <text x={W - PAD.right} y={H - 8} fontSize="10" fill="#94a3b8" textAnchor="end">
          {dates[dates.length - 1]}
        </text>

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

        {lines.map((l) => (
          <text key={l.key} x={W - PAD.right + 6} y={labelY[l.key]} fontSize="10" fill="#64748b">
            {l.label}
          </text>
        ))}

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

      <div className="min-h-[2.5rem] mt-1">
        {hoverIdx != null ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-700">
            <span className="font-medium text-gray-900">{dates[hoverIdx]}</span>
            {lines.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5">
                <svg width="10" height="8" aria-hidden="true">
                  <line x1="0" y1="4" x2="10" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
                </svg>
                {pct(l.plot[hoverIdx])}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">Hover the chart for values on a given day.</p>
        )}
      </div>

      <div className="mt-4 rounded-md bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-600 space-y-1.5">
        <p>
          <strong className="text-gray-700">Estimates, not holdings.</strong> Disclosures report
          amounts as ranges, so each trade is modelled at the midpoint of its range. These are the
          shapes of the strategies, not anyone's actual account balance.
        </p>
        <p>
          Each line is measured against its own deployed capital, so a strategy that invests less is
          not penalised for investing less. {money(committee?.contributed, true)} of the{' '}
          {money(allTrades?.contributed, true)} total went into committee-overlap trades.
        </p>
        {skipped.unmatchedSales > 0 && (
          <p>
            {skipped.unmatchedSales.toLocaleString()} of {(skipped.unmatchedSales + totalSales).toLocaleString()} disclosed
            sales are of positions bought before this window opened, so there is nothing to sell and
            they are not modelled.
          </p>
        )}
        {skipped.noPrice > 0 && (
          <p>{skipped.noPrice.toLocaleString()} trades are excluded because no price history is available for their ticker.</p>
        )}
        <p className="text-gray-400 pt-1 border-t border-gray-200">
          Returns describe disclosed trades only. They are not evidence of insider trading or
          wrongdoing.
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
            <h3 className="font-semibold text-gray-900 mb-1">The flat line at 0% is holding cash</h3>
            <p>
              Above it made money, below it lost money. Every line starts there on the day the first
              disclosed purchase was made.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">What each line is</h3>
            <ul className="space-y-1.5">
              <li><strong className="text-gray-900">All trades</strong> — mirroring every stock purchase Congress disclosed.</li>
              <li><strong className="text-gray-900">Committee trades</strong> — mirroring only the purchases made in a sector that member's own committee oversees. This is the subset worth the most scrutiny, so it is worth knowing whether it actually performed differently.</li>
              <li><strong className="text-gray-900">{benchmarkLabel}</strong> — the same money on the same days in an ordinary index fund.</li>
              <li><strong className="text-gray-900">Held cash</strong> — never invested.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Height is percent gained per dollar</h3>
            <p>
              Not total dollars. Congress as a whole deploys far more money than the committee
              subset does, so a dollar chart would show the size of the two groups rather than how
              well either did.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Comparing the two trading lines</h3>
            <p>
              Each is measured against its own capital, so they can be read side by side. But they
              buy on different days, which means each also faces a different index return over its
              own holding periods — that is why a line can sit higher than another while still
              trailing the market by more.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">What this does not show</h3>
            <p>
              Beating or trailing the market is not evidence of wrongdoing. Members file these
              disclosures because the law requires it, and most trades are ordinary investing, often
              made by a financial adviser rather than the member.
            </p>
          </div>
        </div>
      )}

      {showTable && (
        <div className="mt-2 overflow-x-auto max-h-96">
          <table className="w-full text-[11px] text-left">
            <caption className="sr-only">Growth per dollar invested by date for each strategy</caption>
            <thead className="text-gray-500 border-b border-gray-200 sticky top-0 bg-white">
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
    </section>
  );
}
