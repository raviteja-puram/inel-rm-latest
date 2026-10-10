import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { parseStockUpdateFlat } from "./parseStockUpdate.js";

function workbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Stock");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("stock upload combines duplicate material stock and order quantities", () => {
  const result = parseStockUpdateFlat(workbookBuffer([
    ["Component ID", "Stock Delta", "MM01", "Open Order", "Lead Time (Months)"],
    ["RM-1", 3, 10, 5, 6],
    ["RM-1", 4, 2, 7, 6],
  ]));

  assert.deepEqual(result.errors, []);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].stockDelta, 7);
  assert.equal(result.items[0].bucketUpdates.storeStockMm01, 12);
  assert.equal(result.items[0].bucketUpdates.openOrder, 12);
  assert.equal(result.items[0].bucketUpdates.leadTimeMonths, 6);
});

test("stock upload still accepts optional open order and lead time columns", () => {
  const result = parseStockUpdateFlat(workbookBuffer([
    ["Component ID", "Total Stock"],
    ["RM-1", 25],
  ]));

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.items, [{ id: "RM-1", stock: 25, bucketUpdates: {} }]);
});
