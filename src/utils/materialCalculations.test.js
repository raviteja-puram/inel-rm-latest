import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateSequentialRequirements,
  getComponentUsedIn,
  getRemainingBalance,
  normalizeComponentId,
} from './materialCalculations.js';

test('Used In matches component IDs after trimming and string conversion', () => {
  const fgProducts = [
    { partNo: 'FG-1', name: 'Product One', items: [{ componentId: ' RM-1 ', norms: 2 }] },
    { partNo: 'FG-2', name: 'Product Two', items: [{ componentId: 42, norms: 1 }] },
    { partNo: 'FG-3', name: 'Other Product', items: [{ componentId: 'RM-2', norms: 1 }] },
  ];

  assert.deepEqual(getComponentUsedIn('RM-1', fgProducts), [
    { partNo: 'FG-1', name: 'Product One' },
  ]);
  assert.deepEqual(getComponentUsedIn('42', fgProducts), [
    { partNo: 'FG-2', name: 'Product Two' },
  ]);
  assert.deepEqual(getComponentUsedIn('missing', fgProducts), []);
  assert.equal(normalizeComponentId(null), '');
});

test('remaining balance never goes below zero when demand exceeds available stock', () => {
  assert.equal(getRemainingBalance(32_000, 65_600), 0);
  assert.equal(getRemainingBalance(65_600, 32_000), 33_600);
  assert.equal(getRemainingBalance(10, 10), 0);
});

test('split FG requirements carry remaining stock forward and report each shortage', () => {
  const rows = allocateSequentialRequirements(32_000, [4_800, 1_800, 3_600, 50_400, 5_000]);

  assert.deepEqual(rows.map((row) => row.closingStock), [27_200, 25_400, 21_800, 0, 0]);
  assert.deepEqual(rows.map((row) => row.shortage), [0, 0, 0, 28_600, 5_000]);
  assert.deepEqual(rows.map((row) => row.openingStock), [32_000, 27_200, 25_400, 21_800, 0]);
});
