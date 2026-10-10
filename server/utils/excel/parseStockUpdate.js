import { readWorkbookBuffer, sheetToRows, mapHeaders, cell } from './readWorkbook.js';

export function parseStockUpdateFlat(buffer) {
  const wb = readWorkbookBuffer(buffer);
  const { rows } = sheetToRows(wb);
  const hasHeader = rows[0] && isNaN(Number(rows[0][1]));
  const start = hasHeader ? 1 : 0;
  const map = hasHeader ? mapHeaders(rows[0]) : {};
  const hasStockHeader = !hasHeader || [
    'stockdelta', 'stock delta', 'receivedqty', 'received qty', 'receiptqty', 'receipt qty',
    'updatestock', 'update stock', 'addstock', 'add stock',
    'stockvalue', 'stock value', 'stock', 'stocks', 'totalstock', 'total stock', 'mm01', 'storestockmm01',
    'mm10', 'storestockmm10', 'wip', 'pp00', 'qr01', 'inspection', 'qad',
    'ibpending', 'plannedinward', 'inward', 'openorder', 'open order',
    'leadtime', 'lead time', 'leadtimemonths', 'lead time months',
  ].some((key) => map[key.replace(/[^a-z0-9]+/gi, '').toLowerCase()] !== undefined);
  const items = [], errors = [], byId = new Map();
  function addItem(item, rowNumber) {
    const key = item.id.toUpperCase();
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, item);
      items.push(item);
      return;
    }
    const existingHasDelta = Number.isFinite(Number(existing.stockDelta));
    const itemHasDelta = Number.isFinite(Number(item.stockDelta));
    if (existingHasDelta !== itemHasDelta) {
      errors.push(`Row ${rowNumber}: duplicate Component ID ${item.id} mixes stock replacement and stock addition; skipped`);
      return;
    }
    if (Number.isFinite(Number(existing.stock)) && Number.isFinite(Number(item.stock))) {
      existing.stock += Number(item.stock);
    } else if (Number.isFinite(Number(item.stock))) {
      existing.stock = Number(item.stock);
    }
    if (itemHasDelta) existing.stockDelta = Number(existing.stockDelta || 0) + Number(item.stockDelta || 0);
    Object.entries(item.bucketUpdates || {}).forEach(([field, value]) => {
      if (field === "leadTimeMonths") {
        if (existing.bucketUpdates[field] !== undefined && Number(existing.bucketUpdates[field]) !== Number(value)) {
          errors.push(`Row ${rowNumber}: duplicate Component ID ${item.id} has conflicting lead times; kept the first value`);
        } else {
          existing.bucketUpdates[field] = Number(value || 0);
        }
        return;
      }
      existing.bucketUpdates[field] = Number(existing.bucketUpdates[field] || 0) + Number(value || 0);
    });
  }
  const bucketColumns = [
    ['storeStockMm01', ['mm01', 'storestockmm01']],
    ['storeStockMm10', ['mm10', 'storestockmm10']],
    ['qr01Stock', ['qr01', 'qr01stock']],
    ['ibPending', ['ibpending']],
    ['openOrder', ['openorder', 'open order']],
    ['leadTimeMonths', ['leadtimemonths', 'lead time months', 'leadtime', 'lead time']],
  ];
  if (!hasStockHeader) {
    return {
      items: [],
      errors: ['Missing stock column. Use Total Stock to replace, or Update Stock to add.'],
    };
  }
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((v) => v === null || v === '')) continue;
    const id = String(cell(row, map, 'componentid', 'component id', 'id') ?? row[0] ?? '').trim();
    if (!id) { errors.push(`Row ${i+1}: missing Component ID`); continue; }
    const bucketUpdates = {};
    let invalidBucket = false;
    if (hasHeader) {
      for (const [field, aliases] of bucketColumns) {
        const index = aliases.map((alias) => map[alias]).find((value) => value !== undefined);
        if (index === undefined || row[index] === null || row[index] === '') continue;
        const value = Number(String(row[index]).replace(/,/g, ''));
        if (!Number.isFinite(value) || value < 0) {
          errors.push(`Row ${i + 1}: ${aliases[0].toUpperCase()} must be a non-negative number`);
          invalidBucket = true;
          continue;
        }
        bucketUpdates[field] = value;
      }
    }
    if (invalidBucket) continue;
    const stockDelta = Number(String(cell(
      row,
      map,
      'stockdelta',
      'stock delta',
      'receivedqty',
      'received qty',
      'receiptqty',
      'receipt qty',
      'updatestock',
      'update stock',
      'addstock',
      'add stock',
    ) ?? '').replace(/,/g, ''));
    if (Number.isFinite(stockDelta) && stockDelta > 0) {
      addItem({ id, stockDelta, bucketUpdates }, i + 1);
      continue;
    }
    const rawStockValue =
      cell(
        row,
        map,
        'stockvalue',
        'stock value',
        'stock',
        'stocks',
        'totalstock',
        'total stock',
      ) ?? (hasHeader ? null : row[2] ?? row[1]);
    const stockValue = Number(String(rawStockValue ?? '').replace(/,/g, ''));
    if (
      rawStockValue !== null &&
      rawStockValue !== '' &&
      Number.isFinite(stockValue)
    ) {
      addItem({ id, stock: stockValue, bucketUpdates }, i + 1);
      continue;
    }
    if (Object.keys(bucketUpdates).length) {
      addItem({ id, bucketUpdates }, i + 1);
      continue;
    }
    const multiBucketUpdate = {
      id,
      storeStockMm01: Number(cell(row, map, 'mm01', 'storestockmm01') ?? row[1]) || 0,
      storeStockMm10: Number(cell(row, map, 'mm10', 'storestockmm10') ?? row[2]) || 0,
      wipStock: Number(cell(row, map, 'wip', 'pp00') ?? row[3]) || 0,
      qr01Stock: Number(cell(row, map, 'qr01') ?? row[4]) || 0,
      inspectionStock: Number(cell(row, map, 'inspection', 'qad') ?? row[5]) || 0,
      ibPending: Number(cell(row, map, 'ibpending') ?? row[6]) || 0,
      inwardQty: Number(cell(row, map, 'plannedinward', 'inward') ?? row[7]) || 0,
    };
    const total = multiBucketUpdate.storeStockMm01 + multiBucketUpdate.storeStockMm10
      + multiBucketUpdate.wipStock + multiBucketUpdate.qr01Stock
      + multiBucketUpdate.inspectionStock + multiBucketUpdate.ibPending
      + multiBucketUpdate.inwardQty;
    if (total === 0) {
      errors.push(`Row ${i+1}: missing Stock Value`);
      continue;
    }
    addItem({ id, stock: total }, i + 1);
  }
  return { items, errors };
}
