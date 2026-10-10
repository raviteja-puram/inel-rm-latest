import {
  readWorkbookBuffer,
  sheetToRows,
  mapHeaders,
  cell,
} from "./readWorkbook.js";

function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Excel date-only cells may arrive a few seconds before local midnight.
    // Round toward the nearest calendar day before extracting the date.
    const rounded = new Date(value.getTime() + 12 * 60 * 60 * 1000);
    const year = rounded.getUTCFullYear();
    const month = String(rounded.getUTCMonth() + 1).padStart(2, "0");
    const day = String(rounded.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
    ) return `${year}-${month}-${day}`;
    return "";
  }
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const namedMatch = text.match(
    /^(?:(\d{1,2})[\s/-]+([a-z]{3,9})|([a-z]{3,9})[\s/-]+(\d{1,2})(?:st|nd|rd|th)?)[,\s/-]+(\d{4})$/i,
  );
  let day;
  let month;
  let year;
  if (match) {
    [, day, month, year] = match;
  } else if (namedMatch) {
    const monthNames = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
    ];
    day = namedMatch[1] || namedMatch[4];
    const monthName = (namedMatch[2] || namedMatch[3]).toLowerCase();
    month = String(monthNames.findIndex((name) => name.startsWith(monthName)) + 1);
    year = namedMatch[5];
  } else {
    return "";
  }
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  )
    return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function todayIsoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseProductionPlanFlat(buffer) {
  const wb = readWorkbookBuffer(buffer);
  const { rows } = sheetToRows(wb);
  const firstHeader = String(rows[0]?.[0] || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const hasHeader =
    Boolean(rows[0]) &&
    (firstHeader.includes("fg") ||
      firstHeader.includes("part") ||
      rows[0].slice(1).some((value) => Boolean(toIsoDate(value))));
  const start = hasHeader ? 1 : 0;
  const map = hasHeader ? mapHeaders(rows[0]) : {};
  const planMap = new Map(),
    errors = [];
  const datedQuantityColumns = hasHeader
    ? rows[0]
        .map((header, index) => ({ index, date: toIsoDate(header) }))
        .filter((column) => column.date)
    : [];

  function addPlan(fgPartNo, fgName, qty, productionDate) {
    const key = `${fgPartNo}|${productionDate}`;
    if (planMap.has(key)) {
      planMap.get(key).qty += qty;
    } else {
      planMap.set(key, { fgPartNo, fgName, qty, productionDate });
    }
  }

  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((v) => v === null || v === "")) continue;
    const fgPartNo = String(
      cell(
        row,
        map,
        "fgpartnumber",
        "fg part number",
        "fgpartnum",
        "fg part num",
        "fgpartno",
        "fg part no",
        "fgid",
        "fg id",
        "partno",
        "part no",
      ) ??
        row[0] ??
        "",
    ).trim();
    const fgName = String(
      cell(row, map, "name", "fgname", "fg name") ??
        (datedQuantityColumns.length ? "" : row[1]) ??
        "",
    ).trim();
    if (!fgPartNo) continue;

    if (datedQuantityColumns.length) {
      datedQuantityColumns.forEach(({ index, date }) => {
        const dateQty =
          Number(String(row[index] ?? "").replace(/,/g, "")) || 0;
        if (dateQty > 0) {
          addPlan(fgPartNo, fgName, dateQty, date);
        }
      });
      continue;
    }

    const qty =
      Number(
        String(
          cell(
            row,
            map,
            "productionqty",
            "production quantity",
            "productionquantity",
            "qty",
            "quantity",
            "plan",
          ) ??
            row[2] ??
            row[1] ??
            "",
        ).replace(/,/g, ""),
      ) || 0;
    const rawDate = cell(row, map, "productiondate", "date") ?? row[2];
    const dateText = String(rawDate ?? "").trim();
    let dateVal = !dateText || dateText === String(qty)
      ? todayIsoDate()
      : toIsoDate(rawDate);
    if (!dateVal) {
      errors.push(`Row ${i + 1}: invalid production date`);
      continue;
    }
    if (qty <= 0) {
      errors.push(`Row ${i + 1}: invalid quantity`);
      continue;
    }
    addPlan(fgPartNo, fgName, qty, dateVal);
  }
  return { items: [...planMap.values()], errors };
}
