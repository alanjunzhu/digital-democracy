/**
 * Shared drawing helpers for the finance charts, so the member chart and the
 * Congress-wide chart keep the same axes, labels and formatting.
 */

/**
 * Party colors already mean something on this site (blue D, red R, violet I), so
 * chart series use a party-neutral set. Validated for colorblind separation and
 * contrast against a light surface; the cash line is a neutral reference rather
 * than a category, which is why it carries no chroma.
 */
export const SERIES_COLORS = {
  primary: '#0d9488',
  benchmark: '#d97706',
  variant: '#c026d3',
  neutral: '#9ca3af',
} as const;

export function money(value: number | null | undefined, compact = false) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard',
  });
}

export function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

/** Rounded ticks bracketing a signed range, always including zero. */
export function niceTicks(min: number, max: number, count = 4) {
  const span = Math.max(max - min, 1);
  const rough = span / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10;
  // Round the top tick up, not down, or any series above it clips out of frame.
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 0.001; v += step) {
    ticks.push(Math.abs(v) < step * 0.001 ? 0 : v);
  }
  return ticks;
}

/** Nudge overlapping end labels apart so none is unreadable. */
export function spreadLabels(entries: { key: string; y: number }[], minGap = 12) {
  const sorted = [...entries].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y;
    if (gap < minGap) sorted[i].y = sorted[i - 1].y + minGap;
  }
  return Object.fromEntries(sorted.map((e) => [e.key, e.y])) as Record<string, number>;
}

/** Percent-growth axis label, e.g. "+10%" or "-2.5%". */
export function axisPct(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}
