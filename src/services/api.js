// Use the same origin in development and production so the HttpOnly session
// cookie is sent consistently for both localhost and 127.0.0.1.
const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Request failed: ${res.status}`); }
  return res.json();
}

async function uploadFile(path, file) {
  const form = new FormData(); form.append("file", file);
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: form, credentials: "include" });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export const fetchComponents = () => request("/components");
export const loginUser = (username, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
export const logoutUser = () => request("/auth/logout", { method: "POST" });
export const fetchCurrentUser = () => request("/auth/me");
export const fetchUsers = () => request("/users");
export const saveUserApi = (user) => request("/users", { method: "POST", body: JSON.stringify(user) });
export const deleteUserApi = (username) => request(`/users/${encodeURIComponent(username)}`, { method: "DELETE" });
export const saveComponent = (c) => request("/components", { method: "POST", body: JSON.stringify(c) });
export const deleteComponentApi = (id) => request(`/components/${encodeURIComponent(id)}`, { method: "DELETE" });
export const uploadComponents = (file, workbook = false) => uploadFile(`/uploads/components${workbook ? "?mode=workbook" : ""}`, file);
export const uploadMaterialDiscipline = (file) => uploadFile("/uploads/components/material-discipline", file);
export const fetchFgProducts = () => request("/fg-products");
export const saveFgProduct = (fg) => request("/fg-products", { method: "POST", body: JSON.stringify(fg) });
export const deleteFgProductApi = (partNo) => request(`/fg-products/${encodeURIComponent(partNo)}`, { method: "DELETE" });
export const uploadFgProducts = (file) => uploadFile("/uploads/fg-products", file);
export const fetchFgStockMonitoring = () => request("/fg-stock-monitoring");
export const uploadFgStockMonitoring = (file) => uploadFile("/uploads/fg-stock-monitoring", file);
export const fetchWorkingDays = () => request("/working-days");
export const saveWorkingDays = (entries) => request("/working-days", { method: "PUT", body: JSON.stringify({ entries }) });
export const fetchProductionPlans = () => request("/production-plans");
export const fetchExpiredProductionPlans = () => request("/production-plans/expired-archive");
export const restoreExpiredProductionPlans = (ids = []) => request("/production-plans/expired-archive/restore", { method: "POST", body: JSON.stringify({ ids }) });
export const previewProductionPlan = (file) => uploadFile("/uploads/production-plan", file);
export const confirmProductionPlans = (plans) => request("/production-plans/confirm", { method: "POST", body: JSON.stringify({ plans }) });
export const updateProductionPlanPriorities = (ids) => request("/production-plans/priorities", { method: "PUT", body: JSON.stringify({ ids }) });
export const confirmUploadedProductionPlans = (ids = []) => request("/production-plans/confirm-production", { method: "POST", body: JSON.stringify({ ids }) });
export const confirmProductionPlan = (id) => request(`/production-plans/${encodeURIComponent(id)}/confirm-production`, { method: "POST" });
export const deleteProductionPlan = (id) => request(`/production-plans/${encodeURIComponent(id)}`, { method: "DELETE" });
export const clearProductionPlans = () => request("/production-plans", { method: "DELETE" });
export const fetchProductionRuns = () => request("/production-runs");
export const confirmProductionRun = (payload) => request("/production-runs", { method: "POST", body: JSON.stringify(payload) });
export const fetchStockMovements = () => request("/stock/movements");
export const saveStockInward = (payload) => request("/stock/inward", { method: "POST", body: JSON.stringify(payload) });
export const uploadStock = (file) => uploadFile("/uploads/stock", file);
export const fetchDashboard = (month) => request(`/dashboard${month ? `?month=${encodeURIComponent(month)}` : ""}`);
export const fetchReports = (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/reports${qs ? `?${qs}` : ""}`); };
export const sendRiskEmailNow = () => request("/reports/email-now", { method: "POST" });
export const deleteAllData = () => request("/admin/all-data", { method: "DELETE" });
