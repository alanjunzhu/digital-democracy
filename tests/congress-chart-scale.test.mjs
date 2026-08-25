import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZOOM_STRATEGIES,
  ZOOM_PACK,
  ZOOM_HIGHLIGHTED,
  ZOOM_FULL,
  ZOOM_DEFAULT,
  clampZoom,
  packCeiling,
  yDomainForZoom,
  isReturnClipped,
} from '../shared/congress-chart-scale.mjs';

test('clampZoom stays on the discrete 0–3 ladder', () => {
  assert.equal(clampZoom(ZOOM_DEFAULT), ZOOM_PACK);
  assert.equal(clampZoom(-2), ZOOM_STRATEGIES);
  assert.equal(clampZoom(99), ZOOM_FULL);
  assert.equal(clampZoom(1.4), ZOOM_PACK);
});

test('packCeiling follows the pack, not whoever is highlighted', () => {
  const members = [5, 8, 10, 12, 15, 28, 50, 51, 52, 81, 88, 103, 306];
  // Nine members in ten end at or below 103; the 306% outlier does not set the axis.
  assert.equal(packCeiling(members), 103);
  assert.equal(packCeiling([5, 10, 20]), 20);
  assert.equal(packCeiling([]), 0);
});

test('+ tightens the axis; − widens it through highlighted then full range', () => {
  const args = {
    strategyValues: [0, 13, 16, 21],
    memberReturns: [-8, 5, 10, 12, 18, 22, 50, 103, 306],
    highlightedReturns: [50, 51, 52, 81, 88, 103, 306],
  };
  const strategies = yDomainForZoom({ zoom: ZOOM_STRATEGIES, ...args });
  const pack = yDomainForZoom({ zoom: ZOOM_PACK, ...args });
  const highlighted = yDomainForZoom({ zoom: ZOOM_HIGHLIGHTED, ...args });
  const full = yDomainForZoom({ zoom: ZOOM_FULL, ...args });

  const span = (d) => d.max - d.min;
  assert.ok(span(strategies) < span(pack));
  assert.ok(span(pack) < span(highlighted));
  assert.ok(span(highlighted) <= span(full) + 1e-9);

  assert.ok(strategies.max < 40);
  // The pack ends at 103, and the strategies top out at 21 — neither the 306%
  // outlier nor the highlighted set stretches the default axis to reach them.
  assert.ok(pack.max < 130);
  assert.ok(pack.max > 90);
  assert.ok(highlighted.max > 300);
  assert.ok(full.max > 300);

  assert.equal(isReturnClipped(306, pack), true);
  assert.equal(isReturnClipped(103, pack), false);
  assert.equal(isReturnClipped(306, highlighted), false);
  assert.equal(isReturnClipped(21, strategies), false);
});

test('highlighted zoom still includes the strategy lines', () => {
  const domain = yDomainForZoom({
    zoom: ZOOM_HIGHLIGHTED,
    strategyValues: [0, 20],
    memberReturns: [300],
    highlightedReturns: [5],
  });
  assert.ok(domain.max > 20);
  assert.ok(domain.min < 0);
});
