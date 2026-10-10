import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { parseProductionPlanFlat } from './parseProductionPlan.js';

function workbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Plan');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('row-based production plan keeps an Excel date cell on the intended local day', () => {
  const result = parseProductionPlanFlat(workbookBuffer([
    ['FG Part Number', 'FG Name', 'Production Quantity', 'Production Date'],
    ['FG-1', 'Product One', 100, new Date(2026, 9, 9)],
  ]));

  assert.equal(result.items[0]?.productionDate, '2026-10-09');
  assert.deepEqual(result.errors, []);
});

test('dated production plan accepts today and the next two months from Excel date headers', () => {
  const result = parseProductionPlanFlat(workbookBuffer([
    ['FG Part Number', 'FG Name', new Date(2026, 9, 9), new Date(2026, 10, 9), new Date(2026, 11, 9)],
    ['FG-1', 'Product One', 100, 200, 300],
  ]));

  assert.deepEqual(result.items.map((plan) => plan.productionDate), [
    '2026-10-09',
    '2026-11-09',
    '2026-12-09',
  ]);
  assert.deepEqual(result.items.map((plan) => plan.qty), [100, 200, 300]);
  assert.deepEqual(result.errors, []);
});

test('row-based production plan accepts an ISO date string', () => {
  const result = parseProductionPlanFlat(workbookBuffer([
    ['FG Part Number', 'FG Name', 'Production Quantity', 'Production Date'],
    ['FG-1', 'Product One', 100, '2026-10-09'],
  ]));

  assert.equal(result.items[0]?.productionDate, '2026-10-09');
  assert.deepEqual(result.errors, []);
});

test('dated production plan accepts day-month-name headers', () => {
  const result = parseProductionPlanFlat(workbookBuffer([
    ['FG Part Number', 'FG Name', '9-Oct-2026', '9-Nov-2026', '9-Dec-2026'],
    ['FG-1', 'Product One', 100, 200, 300],
  ]));

  assert.deepEqual(result.items.map((plan) => plan.productionDate), [
    '2026-10-09',
    '2026-11-09',
    '2026-12-09',
  ]);
  assert.deepEqual(result.errors, []);
});
