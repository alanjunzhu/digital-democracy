/**
 * Discrete y-axis windows for the Congress cash-vs-trading chart.
 *
 * Map convention: + zooms in (tighter band, strategy lines clearer),
 * − zooms out (wider band, eventually the full outlier range).
 *
 * 0 Strategies  — cash / all / S&P / committee only
 * 1 Pack        — the strategies plus nine members in ten; the rest run off the
 *                 top edge, marked with the return they actually reached
 * 2 Highlighted — fit the currently highlighted members
 * 3 Full range  — every member's return
 */

export const ZOOM_STRATEGIES = 0;
export const ZOOM_PACK = 1;
export const ZOOM_HIGHLIGHTED = 2;
export const ZOOM_FULL = 3;
export const ZOOM_MIN = ZOOM_STRATEGIES;
export const ZOOM_MAX = ZOOM_FULL;
export const ZOOM_DEFAULT = ZOOM_PACK;

export const ZOOM_LABELS = {
  [ZOOM_STRATEGIES]: 'Strategies',
  [ZOOM_PACK]: 'Pack',
  [ZOOM_HIGHLIGHTED]: 'Highlighted',
  [ZOOM_FULL]: 'Full range',
};

export function clampZoom(zoom) {
  const n = Number(zoom);
  if (!Number.isFinite(n)) return ZOOM_DEFAULT;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(n)));
}

function finite(values) {
  return (values || []).filter((v) => v != null && Number.isFinite(v));
}

function padRange(lo, hi) {
  const padding = Math.max((hi - lo) * 0.12, 1);
  return { min: lo - padding, max: hi + padding };
}

/**
 * In-frame ceiling for the default pack view: where the ninth member out of ten
 * ends up.
 *
 * The highlighted set used to set this ceiling, and since the default
 * highlights are the ten members who beat the market by the most, the axis was
 * always stretched to the top of the distribution — the four strategy lines,
 * which is what the chart is about, ended up sharing a tenth of the plot
 * height. The pack view now means the pack; members above it are drawn to the
 * frame edge and labelled with their real return, and − fits them properly.
 */
export function packCeiling(memberReturns) {
  const members = finite(memberReturns).sort((a, b) => a - b);
  if (!members.length) return 0;
  return members[Math.min(members.length - 1, Math.round((members.length - 1) * 0.9))];
}

/**
 * @param {{
 *   zoom?: number,
 *   strategyValues?: number[],
 *   memberReturns?: Array<number | null | undefined>,
 *   highlightedReturns?: Array<number | null | undefined>,
 * }} [opts]
 * @returns {{ min: number, max: number }}
 */
export function yDomainForZoom({
  zoom = ZOOM_DEFAULT,
  strategyValues = [],
  memberReturns = [],
  highlightedReturns = [],
} = {}) {
  const strategies = finite(strategyValues);
  const members = finite(memberReturns);
  const highlighted = finite(highlightedReturns);
  const level = clampZoom(zoom);

  const strategyLo = strategies.length ? Math.min(...strategies, 0) : 0;
  const strategyHi = strategies.length ? Math.max(...strategies, 0) : 0;

  if (level === ZOOM_STRATEGIES) {
    return padRange(strategyLo, strategyHi);
  }

  if (level === ZOOM_FULL) {
    return padRange(
      Math.min(strategyLo, ...members, 0),
      Math.max(strategyHi, ...members, 0),
    );
  }

  if (level === ZOOM_HIGHLIGHTED) {
    return padRange(
      Math.min(strategyLo, ...highlighted, 0),
      Math.max(strategyHi, ...highlighted, 0),
    );
  }

  const packLo = members.length
    ? members.slice().sort((a, b) => a - b)[Math.floor((members.length - 1) * 0.05)]
    : 0;
  return padRange(
    Math.min(strategyLo, packLo, 0),
    Math.max(strategyHi, packCeiling(members), 0),
  );
}

/**
 * @param {number | null | undefined} value
 * @param {{ min: number, max: number } | null | undefined} domain
 */
export function isReturnClipped(value, domain) {
  if (value == null || !Number.isFinite(value) || !domain) return false;
  return value < domain.min || value > domain.max;
}
