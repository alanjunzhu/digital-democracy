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

test('packCeiling drops a singleton spike so the rest stay in frame', () => {
  const members = [5, 8, 10, 12, 15, 28, 50, 51, 52, 81, 88, 103, 306];
  const highlighted = [50, 51, 52, 54, 56, 81, 88, 103, 306];
  assert.equal(packCeiling(members, highlighted), 103);
  assert.equal(packCeiling([5, 10, 20], [200]), 20);
  assert.equal(packCeiling([10, 12, 14], [14, 15]), 15);
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
  assert.ok(pack.max < 150);
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
