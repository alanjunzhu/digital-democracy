import { useMemo, useState } from 'react';
import type { MemberPortfolio, PortfolioMarker } from '../../lib/types';

interface Props {
  portfolio: MemberPortfolio;
  memberName: string;
  benchmarkLabel?: string;
}

// Chart theme: ink is the subject, navy dashed is the benchmark, red is the
// third comparison worth scrutiny, ink-3 dotted is the do-nothing baseline.
const SERIES = {
  member: 'var(--ink)',
  benchmark: 'var(--navy)',
  follower: 'var(--red)',
  cash: 'var(--ink-3)',
} as const;

const DASH = {
  member: undefined,
  benchmark: '5 4',
  follower: undefined,
  cash: '2 3',
} as const;

/** Below this many purchases, one trade dominates the line and the reader should know. */
const SMALL_SAMPLE = 5;

const PAD = { top: 16, right: 8, bottom: 8, left: 8 };
const W = 720;
const H = 260;

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

/** Nudge overlapping end labels apart so none is unreadable, as a % of plot height. */
function spreadLabels(entries: { key: string; pct: number }[], minGap = 6) {
  const sorted = [...entries].sort((a, b) => a.pct - b.pct);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].pct - sorted[i - 1].pct;
    if (gap < minGap) sorted[i].pct = sorted[i - 1].pct + minGap;
  }
  return Object.fromEntries(sorted.map((e) => [e.key, e.pct]));
}

export default function MemberPortfolioChart({
  portfolio,
  memberName,
  benchmarkLabel = 'S&P 500',
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

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
    const yPct = (v: number) => ((y(v) - PAD.top) / plotH) * 100;
    const path = (values: number[]) =>
      values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

    return { x, y, yPct, path, ticks, plotW, plotH };
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
    { key: 'member', label: memberName, color: SERIES.member, values: member, plot: growth.member, dash: DASH.member },
    { key: 'benchmark', label: benchmarkLabel, color: SERIES.benchmark, values: benchmark, plot: growth.benchmark, dash: DASH.benchmark },
    { key: 'follower', label: 'Filing reader', color: SERIES.follower, values: follower, plot: growth.follower, dash: DASH.follower },
    { key: 'cash', label: 'Not invested', color: SERIES.cash, values: cash, plot: growth.cash, dash: DASH.cash },
  ];

  const labelTop = spreadLabels(
    lines.map((l) => ({ key: l.key, pct: geom.yPct(l.plot[l.plot.length - 1]) })),
  );

  const hoverIdx = hover != null ? Math.min(Math.max(hover, 0), dates.length - 1) : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (rel - PAD.left) / geom.plotW;
    setHover(Math.round(frac * (dates.length - 1)));
  }

  const purchaseCount = markers.filter((m: PortfolioMarker) => m.isPurchase).length;
  const beatIndex = summary.vsBenchmarkPct != null && summary.vsBenchmarkPct > 0;
  const readerDidBetter = summary.disclosureGapPct != null && summary.disclosureGapPct < 0;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const exclusions = [
    skipped.noPrice > 0 && `${plural(skipped.noPrice, 'trade', 'trades')} with no price history available`,
    skipped.noAmount > 0 && `${plural(skipped.noAmount, 'trade', 'trades')} with no reported amount`,
    skipped.outsideBenchmark > 0 && `${plural(skipped.outsideBenchmark, 'trade', 'trades')} dated outside the period charted`,
  ].filter(Boolean) as string[];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-6 border-t border-ink pt-3 mb-1">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em]">Disclosed trades vs the market</h2>
        <span className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3 whitespace-nowrap">
          Cumulative % &middot; rebased at first disclosed buy
        </span>
      </div>
      <p className="text-[14px] leading-[1.6] text-ink-2 max-w-prose mb-4">
        {memberName} disclosed buying {money(summary.contributed)} of stock. This shows what that
        would be worth today, next to two things they could have done instead: put the same money
        into the {benchmarkLabel} on the same days, or not invest it at all.
      </p>

      <div className="border border-rule bg-card px-[22px] pt-5 pb-[14px]">
        <div className="flex flex-wrap items-stretch border border-rule mb-[18px]">
          <div className="flex-1 min-w-[110px] px-[14px] py-3 border-r border-rule">
            <div className="font-serif text-2xl leading-none font-medium tabular">{money(summary.endMember, true)}</div>
            <div className="font-mono text-[10px] tracking-[0.07em] uppercase text-ink-3 mt-[7px]">Estimated value today</div>
          </div>
          <div className="flex-1 min-w-[110px] px-[14px] py-3 border-r border-rule">
            <div className="font-serif text-2xl leading-none font-medium tabular">{pct(summary.vsBenchmarkPct)}</div>
            <div className="font-mono text-[10px] tracking-[0.07em] uppercase text-ink-3 mt-[7px]">vs {benchmarkLabel}</div>
          </div>
          <div className="flex-1 min-w-[110px] px-[14px] py-3 border-r border-rule">
            <div className="font-serif text-2xl leading-none font-medium tabular">{pct(summary.vsCashPct)}</div>
            <div className="font-mono text-[10px] tracking-[0.07em] uppercase text-ink-3 mt-[7px]">vs not investing</div>
          </div>
          <div className="flex-1 min-w-[110px] px-[14px] py-3">
            <div className="font-serif text-2xl leading-none font-medium tabular">{pct(summary.disclosureGapPct)}</div>
            <div className="font-mono text-[10px] tracking-[0.07em] uppercase text-ink-3 mt-[7px]">Edge lost to filing delay</div>
          </div>
        </div>

        {purchaseCount < SMALL_SAMPLE && (
          <p className="font-mono text-[10.5px] leading-[1.6] text-ink-3 border-l-2 border-accent pl-3 mb-[14px]">
            Read with caution: based on {purchaseCount} purchase{purchaseCount === 1 ? '' : 's'}. With so few
            trades a single one drives the whole line, so the percentages swing far more than they would over a
            longer record.
          </p>
        )}

        <div className="flex flex-wrap gap-5 mb-[14px]">
          {lines.map((l) => (
            <span key={l.key} className="inline-flex items-center gap-2 font-mono text-[11px] text-ink-2">
              <svg width="20" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="20" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
              </svg>
              <span>{l.label}</span>
              <span className="text-ink-3">{pct(l.plot[l.plot.length - 1])}</span>
            </span>
          ))}
        </div>

        <div className="grid grid-cols-[46px_minmax(0,1fr)_54px] gap-2">
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
            aria-label={`Growth per dollar invested over time for ${memberName} against the ${benchmarkLabel}`}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            {geom.ticks.map((t) => (
              <line
                key={t}
                x1={PAD.left} y1={geom.y(t)} x2={W - PAD.right} y2={geom.y(t)}
                stroke={t === 0 ? 'var(--ink-3)' : 'var(--rule)'} strokeWidth="1" vectorEffect="non-scaling-stroke"
              />
            ))}

            {lines.map((l) => (
              <path
                key={l.key}
                d={geom.path(l.plot)}
                fill="none"
                stroke={l.color}
                strokeWidth="2"
                strokeDasharray={l.dash}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Trade markers on the member line; overlap trades get a ring */}
            {markerPoints.map((m, i) => (
              <circle
                key={`${m.date}-${m.ticker}-${i}`}
                cx={geom.x(m.idx)}
                cy={geom.y(growth.member[m.idx])}
                r={m.committeeOverlap ? 4 : 2.5}
                fill={m.isPurchase ? SERIES.member : 'var(--card)'}
                stroke={m.committeeOverlap ? 'var(--red)' : SERIES.member}
                strokeWidth={m.committeeOverlap ? 2 : 1.5}
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {`${m.isPurchase ? 'Bought' : 'Sold'} ${m.ticker} ${m.date} · ${m.amountLabel}`}
                  {m.owner ? ` · ${m.owner}` : ''}
                  {m.committeeOverlap ? ' · committee overlap' : ''}
                </title>
              </circle>
            ))}

            {hoverIdx != null && (
              <line
                x1={geom.x(hoverIdx)} y1={PAD.top} x2={geom.x(hoverIdx)} y2={H - PAD.bottom}
                stroke="var(--ink-3)" strokeWidth="1" vectorEffect="non-scaling-stroke"
              />
            )}
            {hoverIdx != null && lines.map((l) => (
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
          </svg>
          <div className="relative" style={{ height: H }}>
            {lines.map((l) => (
              <span
                key={l.key}
                className="absolute left-0 -translate-y-1/2 font-mono text-[10px] whitespace-nowrap"
                style={{ top: `${labelTop[l.key]}%`, color: l.color }}
              >
                {l.label.length > 12 ? `${l.label.slice(0, 11)}…` : l.label}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[46px_minmax(0,1fr)_54px] gap-2 mt-[6px]">
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
              {lines.map((l) => (
                <span key={l.key} className="flex items-center gap-[6px]">
                  <svg width="10" height="8" aria-hidden="true">
                    <line x1="0" y1="4" x2="10" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
                  </svg>
                  {pct(l.plot[hoverIdx])} <span className="text-ink-3">({money(l.values[hoverIdx], true)})</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="font-mono text-[11px] text-ink-3">Hover the chart for values on a given day.</p>
          )}
        </div>

        <p className="font-mono text-[10.5px] leading-[1.6] text-ink-3 border-l-2 border-accent pl-3 mt-3">
          Modelled from disclosed purchases at range midpoints. Sales, dividends, options, and holdings that
          were never disclosed are absent — this is not this member's real return.
          {' '}The <em>filing reader</em> line repeats the same purchases on the date each one was publicly
          disclosed — the first day anyone outside Congress could have acted on it.
          {skipped.unmatchedSales > 0 && (
            <> {skipped.unmatchedSales} sale{skipped.unmatchedSales === 1 ? '' : 's'} of positions acquired
            before this window are not represented — only trades disclosed here can be modelled.</>
          )}
          {exclusions.length > 0 && <> Also excluded: {exclusions.join('; ')}.</>}
        </p>
      </div>

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
            <h3 className="font-serif text-lg font-medium text-ink mb-1">The flat line at 0% is the starting point</h3>
            <p>
              It represents leaving the money in cash. Everything is measured against it: above the
              line made money, below it lost money.
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
                    {l.key === 'member' && ' — what their disclosed purchases actually did.'}
                    {l.key === 'benchmark' && ` — the same money, on the same days, in an ${benchmarkLabel} index fund instead.`}
                    {l.key === 'follower' && ' — you, copying each trade on the day its filing became public, which is typically weeks after the member made it.'}
                    {l.key === 'cash' && ' — money never invested. Always flat.'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-ink mb-1">Height is percent gained, not dollars</h3>
            <p>
              Showing dollars would make every line jump whenever more money was added, so you would
              be watching <em>how much</em> was invested rather than how well it did. Dots on the
              line mark individual trades; filled dots are purchases, hollow ones are sales, and a
              red ring means the trade was in a sector their committee oversees.
            </p>
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-ink mb-1">Reading the four numbers above</h3>
            <div className="space-y-1">
              <p><strong className="text-ink font-semibold">Estimated value today</strong> — what the disclosed purchases are now worth.</p>
              <p>
                <strong className="text-ink font-semibold">vs {benchmarkLabel}</strong> — how they did against a plain index fund.
                {' '}{beatIndex ? 'Positive means they beat it.' : 'Negative means the index fund did better.'}
              </p>
              <p><strong className="text-ink font-semibold">vs not investing</strong> — the plain gain or loss on the money.</p>
              <p>
                <strong className="text-ink font-semibold">Edge lost to filing delay</strong> — how much of the result came
                from acting before the public could. {readerDidBetter
                  ? 'A negative number, as here, means someone following the filings would have done better — the delay hid no advantage.'
                  : 'A positive number means the trades did better than a follower could have managed by waiting for the filings.'}
              </p>
            </div>
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-ink mb-1">What this does not show</h3>
            <p>
              Beating or trailing the market is not evidence of wrongdoing. Members file these
              disclosures because the law requires it, and most trades are ordinary investing —
              often made by a financial adviser rather than the member. This chart describes
              returns, nothing more.
            </p>
          </div>
        </div>
      )}

      {showTable && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[11.5px] text-left">
            <caption className="sr-only">
              Estimated portfolio value by date for {memberName}
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
                    <td key={l.key} className="py-[6px] pr-4 font-mono tabular">{money(l.values[i], true)}</td>
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
