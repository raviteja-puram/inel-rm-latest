import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { parseFgProductsFlat } from './parseFgProducts.js';
import { parseFgStockWorkbook } from './parseFgStock.js';

test('FG upload accepts files without a category column and with standard FG ID headers', () => {
  const rows = [
    ['FG Part Number', 'FG Description', 'Buyer', 'Customer', 'Market Segment', 'Material ID', 'Material Description', 'Norms', 'UOM'],
    ['FG-1001', 'Pump Assembly', 'U1', '', '', 'C-1001', 'Motor', 2, 'EA'],
    ['FG-1001', 'Pump Assembly', 'U1', '', '', 'C-1002', 'Fastener', 1.5, 'EA'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'FG Products');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = parseFgProductsFlat(buffer);

  assert.equal(result.errors.length, 0, `Unexpected parse errors: ${result.errors.join(', ')}`);
  assert.equal(result.fgMap.size, 1);
  assert.equal(result.fgMap.get('FG-1001').items.length, 2);
  assert.equal(result.fgMap.get('FG-1001').fgCategory, '');
});

test('FG BOM upload accepts the six required columns while Product Group and Customer stay optional', () => {
  const rows = [
    ['FG Part Number', 'FG Description', 'Material ID', 'Material Description', 'Norms', 'UOM'],
    ['FG-2001', 'Valve Assembly', 'MAT-2001', 'Steel Body', 2.5, 'EA'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'FG BOM');
  const result = parseFgProductsFlat(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  assert.equal(result.fatalError, undefined);
  assert.equal(result.errors.length, 0, `Unexpected parse errors: ${result.errors.join(', ')}`);
  assert.equal(result.fgMap.get('FG-2001').items[0].componentId, 'MAT-2001');
});

test('FG BOM upload reports a missing required column', () => {
  const rows = [
    ['FG Part Number', 'FG Description', 'Material ID', 'Material Description', 'Norms'],
    ['FG-2001', 'Valve Assembly', 'MAT-2001', 'Steel Body', 2.5],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'FG BOM');
  const result = parseFgProductsFlat(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  assert.match(result.fatalError, /Missing required columns: UOM/);
});

test('production plan workbook is rejected when uploaded as FG BOM data', () => {
  const rows = [
    ['Part No', 'Production Date', 'Quantity'],
    ['FG-3001', '07/10/2026', 25],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Production Plan');
  const result = parseFgProductsFlat(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

  assert.equal(result.fgMap.size, 0);
  assert.match(result.fatalError, /Production plans cannot be uploaded as FG data/);
});

test('FG monitoring upload accepts the minimal 5-column sheet without Customer Name', () => {
  const rows = [
    ['Updated On', '05.09.2026'],
    ['Part No', 'Month Plan Qty', 'Stock Norms In days', 'Total Stock', 'Category'],
    ['FG-1001', 150, 30, 900, 'Runner'],
    ['FG-1002', 200, 45, 1000, 'Repeater'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Monitor');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = parseFgStockWorkbook(buffer);

  assert.equal(result.errors.length, 0, `Unexpected parse errors: ${result.errors.join(', ')}`);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].partNo, 'FG-1001');
  assert.equal(result.records[0].customer, '');
});

test('FG monitoring upload defaults to today when the sheet has no explicit date row', () => {
  const rows = [
    ['Part No', 'Month Plan Qty', 'Stock Norms In days', 'Total Stock', 'Category'],
    ['N5010198', 80000, 5, 400, 'Runner'],
    ['N5010320', 24000, 5, 960, 'Runner'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Monitor plan');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = parseFgStockWorkbook(buffer);
  const today = new Date().toISOString().slice(0, 10);

  assert.equal(result.errors.length, 0, `Unexpected parse errors: ${result.errors.join(', ')}`);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].monitorDate, today);
});
