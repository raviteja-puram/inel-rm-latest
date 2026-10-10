export function addMonthsToDate(dateKey, months) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + Number(months || 0), 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(day, lastDay));
  return firstOfTarget.toISOString().slice(0, 10);
}

export function getProjectionDates(components) {
  const dates = new Set();
  components.forEach((component) => {
    const months = Math.max(0, Math.floor(Number(component.leadTimeMonths) || 0));
    if (!component.projectionStartDate || !months) return;
    for (let month = 0; month <= months; month += 1) {
      const date = addMonthsToDate(component.projectionStartDate, month);
      if (date) dates.add(date);
    }
  });
  return [...dates].sort();
}

export function formatProjectionDate(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}
