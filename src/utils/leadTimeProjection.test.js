import test from "node:test";
import assert from "node:assert/strict";
import { addMonthsToDate, getProjectionDates } from "./leadTimeProjection.js";

test("lead time creates monthly projection dates from upload day through due month", () => {
  const dates = getProjectionDates([{
    projectionStartDate: "2026-10-05",
    leadTimeMonths: 6,
  }]);

  assert.deepEqual(dates, [
    "2026-10-05", "2026-11-05", "2026-12-05", "2027-01-05",
    "2027-02-05", "2027-03-05", "2027-04-05",
  ]);
});

test("monthly projection dates clamp to the target month's final day", () => {
  assert.equal(addMonthsToDate("2026-01-31", 1), "2026-02-28");
});
