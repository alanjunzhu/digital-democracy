/**
 * Discrete y-axis windows for the Congress cash-vs-trading chart.
 *
 * Map convention: + zooms in (tighter band, strategy lines clearer),
 * − zooms out (wider band, eventually the full outlier range).
 *
 * 0 Strategies  — cash / all / S&P / committee only
 * 1 Pack        — typical member returns; a singleton spike is clipped
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
 * In-frame ceiling for the default pack view. A singleton spike (hundreds of
 * percent on a handful of trades) is dropped so the rest of the chart stays
 * readable; press − to bring it back.
 */
export function packCeiling(memberReturns, highlightedReturns = []) {
  const members = finite(memberReturns).sort((a, b) => a - b);
  const highlighted = finite(highlightedReturns).sort((a, b) => a - b);
  const typical = (sorted) => {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.round((sorted.length - 1) * 0.9))];
  };
  const dropSpike = (top, next) => top > next * 1.8 && top - next > 40;

  if (highlighted.length >= 2) {
    const top = highlighted[highlighted.length - 1];
    const next = highlighted[highlighted.length - 2];
    return dropSpike(top, next) ? next : top;
  }
  if (highlighted.length === 1) {
    const spike = highlighted[0];
    const next = typical(members);
    return dropSpike(spike, next) ? next : spike;
  }
  return typical(members);
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
    Math.max(strategyHi, packCeiling(members, highlighted), 0),
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
