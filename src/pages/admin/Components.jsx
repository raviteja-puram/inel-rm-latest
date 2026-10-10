import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  fetchComponents,
  fetchFgProducts,
  fetchProductionRuns,
  fetchReports,
  fetchWorkingDays,
  saveComponent,
  deleteComponentApi,
  uploadComponents,
  uploadMaterialDiscipline,
} from "../../services/api";
import { getCurrentUser } from "../../services/session";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import ActionIconButton from "../../components/ActionIconButton";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import {
  getComponentTotalRequirement,
  getPlannedComponentRequirement,
  getComponentUsedIn,
  normalizeComponentId,
  getComponentTotalStock,
  allocateSequentialRequirements,
  getRequiredQuantity,
  getStockStatus,
} from "../../utils/materialCalculations";
import ExportModal from "../../components/ExportModal";
import { downloadExcelTable, downloadPdfTable } from "../../utils/exportUtils";
import { addMonthsToDate, formatProjectionDate, getProjectionDates } from "../../utils/leadTimeProjection";
// import readXlsxFile from 'read-excel-file/web-worker';

const VALID_CATS = ["Runner", "Repeater", "Stranger", "NPD"];
const MATERIAL_DISCIPLINES = ["Electrical", "Mechanical"];
const VALID_UOMS = ["EA", "KG", "MTR", "NOS"];
const MONTHS = [
  "Jan 2026",
  "Feb 2026",
  "Mar 2026",
  "Apr 2026",
  "May 2026",
  "Jun 2026",
];

const formatWholeNumber = (value) =>
  Math.round(Number(value) || 0).toLocaleString();

function getRiskLabel(r) {
  return { critical: "CRITICAL", high: "HIGH RISK", safe: "SAFE" }[r] || "—";
}

function getRiskStyle(r) {
  return (
    {
      critical: {
        chip: "border border-red-200 bg-red-50 text-red-700",
        dot: "#ef4444",
        text: "text-red-600",
        bar: "#ef4444",
      },
      high: {
        chip: "border border-amber-200 bg-amber-50 text-amber-700",
        dot: "#f59e0b",
        text: "text-amber-600",
        bar: "#f59e0b",
      },
      safe: {
        chip: "border border-emerald-200 bg-emerald-50 text-emerald-700",
        dot: "#10b981",
        text: "text-emerald-600",
        bar: "#10b981",
      },
    }[r] || {
      chip: "border border-slate-200 bg-slate-50 text-slate-600",
      dot: "#64748b",
      text: "text-slate-500",
      bar: "#64748b",
    }
  );
}

function RiskChip({ risk }) {
  const s = getRiskStyle(risk);
  return (
    <span
      className={`inline-flex min-w-[80px] items-center justify-center whitespace-nowrap text-xs px-3 py-1 rounded-full font-semibold leading-none ${s.chip}`}
    >
      {getRiskLabel(risk)}
    </span>
  );
}

function FgList({ value, onMore, fgUsages = [], componentUom }) {
  if (!value) return <span className="text-xs text-[#4a5080]">-</span>;
  const rows = String(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  return (
    <div className="fg-list-cell relative flex min-w-[260px] max-w-[360px] flex-col gap-1">
      {rows.slice(0, 3).map((item) => (
        <button
          type="button"
          key={item}
          onClick={onMore}
          className="fg-list-trigger truncate text-left text-xs leading-relaxed"
          title={item}
        >
          {item}
        </button>
      ))}
      {rows.length > 3 && (
        <button
          type="button"
          onClick={onMore}
          className="text-left text-[11px] text-[#6c63ff] hover:text-white"
        >
          +{rows.length - 3} more
        </button>
      )}
      <div className="fg-hover-popover" role="tooltip">
        <strong>Component requirement by FG</strong>
        {rows.map((item) => {
          const partNo = item.split(" - ")[0].trim();
          const required = fgUsages
            .filter((usage) => usage.partNo === partNo)
            .reduce((sum, usage) => sum + Number(usage.required || 0), 0);
          return (
            <div key={item}>
              <span>{item}</span>
              <b>
                {formatWholeNumber(required)} {componentUom || "units"}
              </b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FgListModal({
  title,
  value,
  componentId,
  componentUom,
  fgProducts,
  fgUsages,
  onClose,
}) {
  if (!value) return null;
  const rows = String(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  return (
    <div
      className="fg-list-backdrop fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="fg-list-modal w-[620px] max-w-[94vw] max-h-[82vh] overflow-hidden">
        <div className="fg-list-header flex items-center justify-between px-6 py-5">
          <div>
            <div className="font-bold text-base text-white">{title}</div>
            <div className="fg-list-count text-xs mt-1">
              {rows.length} FG products
            </div>
          </div>
          <button
            onClick={onClose}
            className="fg-list-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="fg-list-content p-5 overflow-y-auto max-h-[68vh] space-y-2">
          {rows.map((row) => {
            const fg = fgProducts.find(
              (product) =>
                row === product.partNo || row.startsWith(`${product.partNo} -`),
            );
            const matchingUsages = (fgUsages || []).filter(
              (usage) => usage.partNo === fg?.partNo,
            );
            const required = matchingUsages.reduce(
              (sum, usage) => sum + Number(usage.required || 0),
              0,
            );
            const norms = fg?.items?.find(
              (item) => item.componentId === componentId,
            )?.norms;
            const displayQty = matchingUsages.length ? required : norms;
            return (
              <div
                key={row}
                className="fg-list-row flex items-center justify-between gap-5 rounded-xl px-4 py-3 text-xs"
              >
                <span>{row}</span>
                <span className="fg-usage-value">
                  <strong>
                    {displayQty === undefined || displayQty === null
                      ? "—"
                      : formatWholeNumber(displayQty)}
                  </strong>
                  <small>
                    {componentUom === "EA"
                      ? "EA (Each)"
                      : componentUom || "units"}{" "}
                    required
                  </small>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const colors = {
    success: "border-green-800 text-green-400",
    error: "border-red-800 text-red-400",
    info: "border-[#6c63ff] text-[#6c63ff]",
  };
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 bg-[#131627] border px-4 py-3 rounded-xl text-sm font-medium shadow-2xl ${colors[toast.type] || colors.info}`}
    >
      {toast.msg}
    </div>
  );
}

function FormModal({ open, onClose, onSave, editData, allComponents }) {
  const [id, setId] = useState(editData?.id || "");
  const [desc, setDesc] = useState(editData?.desc || "");
  const [componentType, setComponentType] = useState(
    editData?.componentType || "",
  );
  const [oeExport, setOeExport] = useState(editData?.oeExport || "");
  const [materialDiscipline, setMaterialDiscipline] = useState(
    editData?.materialDiscipline || "",
  );
  const [cat, setCat] = useState(editData?.cat || "");
  const [productGroup, setProductGroup] = useState(
    editData?.productGroup || "",
  );
  const [uom, setUom] = useState(editData?.uom || "");
  const [vendor, setVendor] = useState(editData?.vendor || "");
  const [vendorCode, setVendorCode] = useState(editData?.vendorCode || "");
  const [openOrder, setOpenOrder] = useState(String(editData?.openOrder || ""));
  const [leadTimeMonths, setLeadTimeMonths] = useState(String(editData?.leadTimeMonths || ""));
  const [idError, setIdError] = useState("");
  const isEdit = !!editData;

  if (!open) return null;

  function checkId(val) {
    setId(val);
    if (!isEdit && allComponents.find((c) => c.id === val.trim()))
      setIdError("⚠ This ID already exists");
    else setIdError("");
  }

  function handleSave() {
    if (!id.trim()) {
      alert("Unique ID is required");
      return;
    }
    if (!desc.trim()) {
      alert("Description is required");
      return;
    }
    if (!cat) {
      alert("Application Category is required");
      return;
    }
    if (!materialDiscipline) {
      alert("Material Discipline is required");
      return;
    }
    if (!uom) {
      alert("UOM is required");
      return;
    }
    if (!isEdit && allComponents.find((c) => c.id === id.trim())) {
      alert("Part Number already exists");
      return;
    }
    onSave({
      ...(editData || {}),
      id: id.trim(),
      desc: desc.trim(),
      componentType: componentType.trim(),
      oeExport: oeExport.trim(),
      materialDiscipline,
      cat,
      productGroup: productGroup.trim(),
      uom,
      vendor: vendor.trim(),
      vendorCode: vendorCode.trim(),
      openOrder: Number(openOrder) || 0,
      leadTimeMonths: Number(leadTimeMonths) || 0,
      stock: Number(editData?.stock || 0),
    });
  }

  const inp =
    "w-full bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#6c63ff] placeholder:text-[#4a5080]";
  const lbl = "text-[#8890b0] text-xs mb-1.5 block";

  return (
    <div
      className="component-form-backdrop fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="component-form-modal w-[540px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <div className="component-form-header flex items-center justify-between px-6 py-5">
          <div>
            <div className="font-bold text-base text-white">
              {isEdit ? "Edit Component" : "Create Component"}
            </div>
            <div className="text-[#4a5080] text-xs mt-0.5">
              Fields marked * are required
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#4a5080] hover:text-white text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>PART NUMBER *</label>
              <input
                value={id}
                onChange={(e) => checkId(e.target.value)}
                readOnly={isEdit}
                placeholder="e.g. N1010037"
                className={`${inp} ${isEdit ? "opacity-50 cursor-not-allowed" : ""}`}
              />
              {idError && (
                <span className="text-orange-400 text-xs mt-1 block">
                  {idError}
                </span>
              )}
            </div>
            <div>
              <label className={lbl}>DESCRIPTION *</label>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="e.g. TRANSISTOR BC 847B"
                className={inp}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>OPEN ORDER</label>
              <input value={openOrder} onChange={(e) => setOpenOrder(e.target.value)} type="number" min="0" step="1" placeholder="Optional quantity" className={inp} />
            </div>
            <div>
              <label className={lbl}>LEAD TIME (MONTHS)</label>
              <input value={leadTimeMonths} onChange={(e) => setLeadTimeMonths(e.target.value)} type="number" min="0" step="1" placeholder="Optional months" className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>MATERIAL TYPE / CATEGORY</label>
              <input
                value={componentType}
                onChange={(e) => setComponentType(e.target.value)}
                placeholder="e.g. ROH"
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>OE / EXPORT</label>
              <input
                value={oeExport}
                onChange={(e) => setOeExport(e.target.value)}
                placeholder="e.g. OE or EXPORT"
                className={inp}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>APPLICATION CATEGORY *</label>
              <select
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                className={inp}
              >
                <option value="">Select application category</option>
                {VALID_CATS.map((application) => (
                  <option key={application} value={application}>
                    {application}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>MATERIAL DISCIPLINE *</label>
              <select
                value={materialDiscipline}
                onChange={(e) => setMaterialDiscipline(e.target.value)}
                className={inp}
              >
                <option value="">Select discipline</option>
                {MATERIAL_DISCIPLINES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>PRODUCT GROUP</label>
              <input
                value={productGroup}
                onChange={(e) => setProductGroup(e.target.value)}
                placeholder="Enter product group"
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>UOM *</label>
              <select
                value={uom}
                onChange={(e) => setUom(e.target.value)}
                className={inp}
              >
                <option value="">Select UOM</option>
                {VALID_UOMS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>VENDOR</label>
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Enter vendor"
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>VENDOR CODE</label>
              <input
                value={vendorCode}
                onChange={(e) => setVendorCode(e.target.value)}
                placeholder="Enter vendor code"
                className={inp}
              />
            </div>
          </div>
          {/*
          <div className="border-t border-[#1e2235] pt-4">
            <div className="text-[#4a5080] text-xs uppercase tracking-widest mb-3">
              Stock Management
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-[#0d0f1a] border border-[#1e2235] rounded-lg py-2.5 text-center font-mono text-sm font-bold text-[#3ecfcf]">
                {formatWholeNumber(stock)}
              </div>
              <div className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => applyStock("-")}
                  className="w-9 h-9 flex items-center justify-center bg-[#0d0f1a] border border-[#1e2235] rounded-lg text-[#8890b0] hover:border-red-700 hover:text-red-400 transition-colors text-lg"
                >
                  −
                </button>
                <input
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="qty"
                  className="flex-1 bg-[#0d0f1a] border border-[#1e2235] rounded-lg py-2 px-3 text-sm text-center font-mono text-white focus:outline-none focus:border-[#6c63ff]"
                />
                <button
                  onClick={() => applyStock("+")}
                  className="w-9 h-9 flex items-center justify-center bg-[#0d0f1a] border border-[#1e2235] rounded-lg text-[#8890b0] hover:border-green-700 hover:text-green-400 transition-colors text-lg"
                >
                  +
                </button>
              </div>
            </div>
            <div className="text-[#4a5080] text-xs mt-2">
              Enter qty and click + to add or − to subtract stock.
            </div>
          </div>
          <div className="border-t border-[#1e2235] pt-4">
            <div className="text-[#4a5080] text-xs uppercase tracking-widest mb-3">
              Workbook Manual Inputs
            </div>
            <div className="grid grid-cols-2 gap-4">
              {MANUAL_COMPONENT_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className={lbl}>{field.label}</label>
                  <input
                    value={extraFields[field.key] ?? ""}
                    onChange={(e) =>
                      updateExtraField(field.key, e.target.value)
                    }
                    type={field.type}
                    min={field.type === "number" ? "0" : undefined}
                    step={field.type === "number" ? "1" : undefined}
                    placeholder={field.source}
                    className={inp}
                  />
                </div>
              ))}
            </div>
          </div>
          */}
        </div>
        <div className="flex gap-3 justify-end px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#8890b0] border border-[#1e2235] rounded-lg hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#6c63ff] hover:bg-[#5a52e0] rounded-lg transition-colors"
          >
            {isEdit ? "Update Component" : "Save Component"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadModal({ open, onClose, onImport, disciplineOnly = false }) {
  const [errors, setErrors] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  if (!open) return null;

  // Load SheetJS from CDN at runtime — no npm needed, no vulnerabilities
  async function processFile(file) {
    if (!file) return;
    if (!file.name.match(/\.xlsx?$/i)) {
      setErrors(["Please upload a .xlsx file (Excel 2007 or newer)."]);
      return;
    }
    setErrors([]);
    setLoading(true);
    try {
      const result = await onImport(file);
      setErrors([...(result.errors || []), ...(result.warnings || [])]);
    } catch (err) {
      setErrors([
        `Error uploading file: ${err.message}`,
        "Make sure it is a valid .xlsx Excel file.",
      ]);
    }
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#131627] border border-[#1e2235] rounded-2xl w-[500px] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#1e2235]">
          <div>
            <div className="font-bold text-base text-white">
              {disciplineOnly ? "Update Material Discipline" : "Upload Excel"}
            </div>
            <div className="text-[#4a5080] text-xs mt-0.5">
              {disciplineOnly
                ? "Safely update only the discipline field for existing materials"
                : "Prepare your file in the format below"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#4a5080] hover:text-white text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5">
          <div className="bg-[#0d0f1a] border border-[#1e2235] rounded-xl p-4 mb-4">
            <div className="text-[#6c63ff] text-xs font-semibold uppercase tracking-widest mb-3">
              {disciplineOnly ? "Required Columns" : "Required Column Order"}
            </div>
            <div className="space-y-2">
              {(disciplineOnly
                ? [
                    ["A", "Part Number", true],
                    ["B", "Material Discipline (Electrical / Mechanical)", true],
                  ]
                : [
                ["A", "Part Number", true],
                ["B", "Description", true],
                ["C", "Material Discipline (Electrical / Mechanical)", false],
                ["D", `UOM (${VALID_UOMS.join(" / ")})`, true],
                ["E", "Material Type / Category", false],
                ["F", "OE / EXPORT", false],
                ["G", `Application Category (${VALID_CATS.join(" / ")})`, false],
                ["H", "Product Group", false],
                ["I", "Vendor Code", false],
                ["J", "Vendor Name", false],
                ]).map(([col, name, req]) => (
                <div key={col} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-[#4a5080] w-4">
                    {col}
                  </span>
                  <span className="text-xs text-[#c0c8e8] flex-1">{name}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${req ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                  >
                    {req ? "Required" : "Optional"}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[#4a5080] text-xs mt-3">
              {disciplineOnly
                ? "Only non-empty Electrical or Mechanical values are applied. Blank cells are skipped; stock and all other material fields stay unchanged. Unknown Part Numbers are reported."
                : "Header names are recognized even when the sheet has an S.no column."}
            </div>
          </div>

          <div
            onClick={() => fileRef.current.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              processFile(e.dataTransfer.files[0]);
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${dragging ? "border-[#6c63ff] bg-[#6c63ff]/5" : "border-[#2a2d4a] hover:border-[#4a5080]"}`}
          >
            {loading ? (
              <>
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#2a2d4a] border-t-[#8f86e8]" />
                <div className="text-sm text-[#6c63ff]">Uploading and processing file…</div>
              </>
            ) : (
              <>
                <div className="text-3xl mb-3">Excel Upload</div>
                <div className="text-sm font-medium text-[#6c63ff]">
                  Click to select or drag and drop
                </div>
                <div className="text-xs text-[#4a5080] mt-2">
                  Accepts .xlsx files only
                </div>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => processFile(e.target.files[0])}
          />

          {errors.length > 0 && (
            <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="text-xs font-semibold text-red-400 mb-2">
                ⚠ Issues Found
              </div>
              {errors.map((e, i) => (
                <div key={i} className="text-xs text-red-400 mb-1">
                  • {e}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#8890b0] border border-[#1e2235] rounded-lg hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
function MonthlyDemandPage({
  components,
  onBack,
  getDemandRequirement,
  getComponentRisk,
}) {
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-[#131627] border border-[#1e2235] text-[#8890b0] rounded-lg text-xs hover:text-white transition-colors"
        >
          ← Back
        </button>
        <div>
          <h2 className="font-bold text-lg text-white">
            Monthly Demand Overview
          </h2>
          <p className="text-[#4a5080] text-xs mt-0.5">
            Stock consumption and coverage by month
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {MONTHS.map((m) => {
          const total = components.reduce(
            (sum, component) => sum + getComponentTotalStock(component),
            0,
          );
          const critical = components.filter((component) => {
            const demandRequirement = getDemandRequirement(component.id);
            return (
              demandRequirement > 0 &&
              getStockStatus(
                demandRequirement,
                getComponentTotalStock(component),
              ) === "critical"
            );
          }).length;
          return (
            <div
              key={m}
              className="bg-[#131627] border border-[#1e2235] rounded-xl p-4"
            >
              <div className="text-[#4a5080] text-xs uppercase tracking-widest mb-3">
                {m}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#8890b0] text-xs">
                    Total Components
                  </span>
                  <span className="text-white text-sm font-bold">
                    {components.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8890b0] text-xs">Total Stock</span>
                  <span className="text-[#3ecfcf] text-sm font-bold font-mono">
                    {formatWholeNumber(total)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8890b0] text-xs">Critical</span>
                  <span className="text-red-400 text-sm font-bold">
                    {critical}
                  </span>
                </div>
              </div>
              <div className="mt-3 bg-[#1e2235] rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${components.length ? (1 - critical / components.length) * 100 : 100}%`,
                    background: critical > 0 ? "#e24b4a" : "#639922",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-[#131627] border border-[#1e2235] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1e2235]">
          <div className="font-semibold text-sm text-[#c0c8e8]">
            Component Stock by Month
          </div>
        </div>
        <div
          className="overflow-x-auto"
          style={{ maxHeight: "400px", overflowY: "auto" }}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1e2235]">
                {[
                  "Part Number",
                  "Description",
                  "Required Qty",
                  "Stock Available",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs text-[#4a5080] uppercase tracking-widest px-5 py-3 font-semibold sticky top-0 bg-[#131627]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {components.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-[#4a5080] text-sm"
                  >
                    No data yet
                  </td>
                </tr>
              ) : (
                components.map((c, i) => {
                  const demandRequirement = getDemandRequirement(c.id);
                  const totalStock = getComponentTotalStock(c);
                  const calculatedRisk = getComponentRisk(c);

                  return (
                    <tr
                      key={i}
                      className="border-b border-[#1a1d35] hover:bg-[#1a1d35] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span className="bg-[#1a1d35] text-[#6c63ff] text-xs font-mono px-2 py-1 rounded">
                          {c.id}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-[#8890b0] max-w-[200px] truncate">
                        {c.desc}
                      </td>
                      <td className="px-5 py-3">
                        {demandRequirement > 0 ? (
                          <span
                            className={`text-sm font-bold font-mono ${demandRequirement > totalStock ? "text-red-400" : "text-[#6c63ff]"}`}
                          >
                            {formatWholeNumber(demandRequirement)}
                          </span>
                        ) : (
                          <span className="text-xs text-[#4a5080]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm font-bold font-mono text-[#3ecfcf]">
                        {formatWholeNumber(totalStock)}
                      </td>
                      <td className="px-5 py-3">
                        <RiskChip risk={calculatedRisk} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Components() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const isAdmin = user?.role === "admin";
  const [components, setComponents] = useState([]);
  const projectionDates = getProjectionDates(components);
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showDisciplineUpload, setShowDisciplineUpload] = useState(false);
  const [editData, setEditData] = useState(null);
  const [editIndex, setEditIndex] = useState(-1);
  const [search, setSearch] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [productGroupFilter, setProductGroupFilter] = useState("all");
  const [applicationFilter, setApplicationFilter] = useState("all");
  const [uomFilter, setUomFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [usedInFilter, setUsedInFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState(
    () => new URLSearchParams(location.search).get("risk") || "all",
  );
  const [page, setPage] = useState("components");
  const [toast, setToast] = useState(null);
  const [resettingFilters, setResettingFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [fgProducts, setFgProducts] = useState([]);
  const [productionRuns, setProductionRuns] = useState([]);
  const [componentMetrics, setComponentMetrics] = useState({});
  const [reportsData, setReportsData] = useState(null);
  const [shortageDate, setShortageDate] = useState("");
  const [shortageMonth, setShortageMonth] = useState("");
  const [shortageOnly, setShortageOnly] = useState(false);
  const [fgModal, setFgModal] = useState(null);
  const [exportJob, setExportJob] = useState(null);
  // Start with the complete master view. Users choose what to hide.
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [splitByFgRows, setSplitByFgRows] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyMessage, setBusyMessage] = useState("");
  async function reloadAll() {
    const [comp, fg, runs, reports] = await Promise.all([
      fetchComponents(),
      fetchFgProducts(),
      fetchProductionRuns(),
      fetchReports({}),
    ]);
    setComponents(comp);
    setFgProducts(fg);
    setProductionRuns(runs);
    setReportsData(reports);
    setComponentMetrics(
      Object.fromEntries((reports.rows || []).map((row) => [row.id, row])),
    );
    setShortageDate(
      (prev) => prev || reports.shortages?.dailySummary?.[0]?.date || "",
    );
    setLoading(false);
  }
  useEffect(() => {
    reloadAll().catch(console.error);
  }, []);
  useEffect(() => {
    const requestedRisk = new URLSearchParams(location.search).get("risk");
    const nextRisk = ["critical", "high", "safe"].includes(requestedRisk)
      ? requestedRisk
      : "all";
    setRiskFilter(nextRisk);
    if (requestedRisk) {
      setPage("components");
      setSearch("");
      setShortageOnly(false);
      setShortageDate("");
      setShortageMonth("");
    }
  }, [location.search]);

  if (loading)
    return (
      <div className="min-h-screen bg-[#0d0f1a] text-[#9c94a8] flex flex-col items-center justify-center gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#2a2d4a] border-t-[#8f86e8]" />
        <span>Loading Raw Materials…</span>
      </div>
    );

  if (!user) {
    navigate("/");
    return null;
  }

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  async function withBusyBuffer(message, operation) {
    setBusyMessage(message);
    try {
      await operation();
    } catch (error) {
      showToast(error.message || "Operation failed", "error");
    } finally {
      setBusyMessage("");
    }
  }

  function openCreate() {
    setEditData(null);
    setEditIndex(-1);
    setShowForm(true);
  }
  function openEdit(i) {
    setEditData(components[i]);
    setEditIndex(i);
    setShowForm(true);
  }

  async function handleSave(comp) {
    setComponents((prev) => {
      const updated =
        editIndex === -1
          ? [...prev, comp]
          : prev.map((c, i) => (i === editIndex ? comp : c));

      return updated;
    });
    showToast(
      `${comp.id} ${editIndex === -1 ? "added" : "updated"}`,
      "success",
    );
    await saveComponent(comp);
    await reloadAll();
    setShowForm(false);
  }
  async function handleDelete(i) {
    if (!window.confirm(`Delete ${components[i].id}?`)) return;
    await withBusyBuffer("Deleting material…", async () => {
      await deleteComponentApi(components[i].id);
      await reloadAll();
      showToast("Component deleted", "error");
    });
  }
  async function handleDeleteAll() {
    if (!window.confirm("Delete all components?")) return;
    await withBusyBuffer("Deleting all materials…", async () => {
      for (const comp of components) await deleteComponentApi(comp.id);
      await reloadAll();
      showToast("All components deleted", "success");
    });
  }

  function toggleSelected(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleAllVisible(visibleComponents) {
    const visibleIds = visibleComponents.map((component) => component.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) =>
      allSelected
        ? prev.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...prev, ...visibleIds])),
    );
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      alert("Select at least one component to delete");
      return;
    }
    if (
      !window.confirm(`Delete ${selectedIds.length} selected component(s)?`)
    )
      return;
    await withBusyBuffer("Deleting selected materials…", async () => {
      for (const id of selectedIds) await deleteComponentApi(id);
      await reloadAll();
      setSelectedIds([]);
      showToast("Selected components deleted", "error");
    });
  }

  async function handleImport(file) {
    const result = await uploadComponents(file);
    await reloadAll();
    showToast(result.imported + " components imported/updated", "success");
    if (!result.errors?.length) setShowUpload(false);
    return result;
  }

  async function handleMaterialDisciplineImport(file) {
    const result = await uploadMaterialDiscipline(file);
    await reloadAll();
    showToast(`${result.updated} material discipline value(s) updated`, "success");
    const warnings = [
      ...result.notFound.map((id) => `Unknown Part Number ${id}; skipped`),
      ...(result.blankDisciplineRows
        ? [`${result.blankDisciplineRows} blank discipline row(s) skipped`]
        : []),
    ];
    if (!result.errors?.length && !warnings.length) setShowDisciplineUpload(false);
    return { ...result, warnings };
  }

  function getComponentRisk(component) {
    const metric = componentMetrics[component.id];
    if (metric?.risk) return metric.risk;
    const demandRequirement = Math.max(
      getPlannedComponentRequirement(component.id, fgProducts, component),
      getComponentTotalRequirement(component.id, productionRuns),
    );
    return getStockStatus(demandRequirement, getComponentTotalStock(component));
  }

  const shortageDates =
    reportsData?.shortages?.dailySummary?.map((row) => row.date) || [];
  const shortageMonths =
    reportsData?.shortages?.monthlySummary?.map((row) => row.month) || [];
  const shortageScope = shortageDate ? "date" : shortageMonth ? "month" : "";
  const selectedShortageRows = shortageDate
    ? reportsData?.shortages?.daily?.[shortageDate] || []
    : shortageMonth
      ? reportsData?.shortages?.monthly?.[shortageMonth] || []
      : [];
  const shortageByComponent = Object.fromEntries(
    selectedShortageRows.map((row) => [row.componentId, row]),
  );
  const uniqueColumnValues = (key) =>
    Array.from(
      new Set(
        components
          .map((component) => String(component[key] || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const columnFilters = {
    "Material Discipline": {
      key: "materialDiscipline",
      value: disciplineFilter,
      setValue: setDisciplineFilter,
      options: MATERIAL_DISCIPLINES,
      allLabel: "All disciplines",
    },
    "Product Group": {
      key: "productGroup",
      value: productGroupFilter,
      setValue: setProductGroupFilter,
      options: uniqueColumnValues("productGroup"),
      allLabel: "All groups",
    },
    "Application Category": {
      key: "cat",
      value: applicationFilter,
      setValue: setApplicationFilter,
      options: uniqueColumnValues("cat"),
      allLabel: "All applications",
    },
    UOM: {
      key: "uom",
      value: uomFilter,
      setValue: setUomFilter,
      options: uniqueColumnValues("uom"),
      allLabel: "All UOM",
    },
    Vendor: {
      key: "vendor",
      value: supplierFilter,
      setValue: setSupplierFilter,
      options: uniqueColumnValues("vendor"),
      allLabel: "All vendors",
    },
    "Used In": {
      value: usedInFilter,
      setValue: setUsedInFilter,
      options: [...new Set(fgProducts.map((fg) => fg.partNo).filter(Boolean))].sort(),
      allLabel: "All finished goods",
    },
  };
  const matchesColumnFilter = (value, selected) => {
    if (selected === "all") return true;
    if (selected === "__blank__") return !String(value || "").trim();
    return String(value || "").trim() === selected;
  };

  const filtered = components.filter((c) => {
    const shortageRow = shortageByComponent[c.id];
    const matchesSelectedPlan =
      !shortageScope || Boolean(shortageRow);
    const matchesSearch =
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.desc.toLowerCase().includes(search.toLowerCase());
    const matchesRisk =
      riskFilter === "all" ||
      (shortageScope && shortageRow
        ? getStockStatus(shortageRow.required, shortageRow.stock)
        : getComponentRisk(c)) === riskFilter;
    const matchesShortage =
      !shortageOnly || Number(shortageRow?.shortage || 0) > 0;
    const matchesProductGroup = matchesColumnFilter(
      c.productGroup,
      productGroupFilter,
    );
    const matchesDiscipline = matchesColumnFilter(
      c.materialDiscipline,
      disciplineFilter,
    );
    const matchesApplication = matchesColumnFilter(c.cat, applicationFilter);
    const matchesUom = matchesColumnFilter(c.uom, uomFilter);
    const matchesSupplier = matchesColumnFilter(c.vendor, supplierFilter);
    const usedIn = getUsedIn(c.id);
    const matchesUsedIn = usedInFilter === "all"
      ? true
      : usedInFilter === "__blank__"
        ? usedIn.length === 0
        : usedIn.some((fg) => fg.partNo === usedInFilter);
    return (
      matchesSelectedPlan &&
      matchesSearch &&
      matchesRisk &&
      matchesShortage &&
      matchesDiscipline &&
      matchesProductGroup &&
      matchesApplication &&
      matchesUom &&
      matchesSupplier &&
      matchesUsedIn
    );
  });
  const counts = shortageScope
    ? selectedShortageRows.reduce(
        (acc, row) => {
          const status = getStockStatus(row.required, row.stock);
          acc[status] += 1;
          return acc;
        },
        { critical: 0, high: 0, safe: 0 },
      )
    : components.reduce(
        (acc, component) => {
          const metric = componentMetrics[component.id];
          if (metric?.risk && acc[metric.risk] !== undefined) {
            acc[metric.risk] += 1;
            return acc;
          }
          const demandRequirement = getPlannedComponentRequirement(
            component.id,
            fgProducts,
            component,
          );
          const status = getStockStatus(
            demandRequirement,
            getComponentTotalStock(component),
          );
          if (acc[status] !== undefined) acc[status] += 1;
          return acc;
        },
        { critical: 0, high: 0, safe: 0 },
      );
  const statCards = [
    {
      label: "Critical",
      risk: "critical",
      count: counts.critical,
      sub: "No stock for demand",
      dot: "#e24b4a",
      cls: "text-red-600",
    },
    {
      label: "High Risk",
      risk: "high",
      count: counts.high,
      sub: "Stock below demand",
      dot: "#ef9f27",
      cls: "text-amber-600",
    },
    {
      label: "Safe",
      risk: "safe",
      count: counts.safe,
      sub: "Enough stock",
      dot: "#639922",
      cls: "text-emerald-600",
    },
  ];

  function getTotalRequirement(compId) {
    return getComponentTotalRequirement(compId, productionRuns);
  }

  function getPlannedRequirement(compId) {
    return getPlannedComponentRequirement(
      compId,
      fgProducts,
      components.find((component) => component.id === compId),
    );
  }

  function getDemandRequirement(compId) {
    const metric = componentMetrics[compId];
    if (metric) return metric.demandRequirement || 0;
    return Math.max(getPlannedRequirement(compId), getTotalRequirement(compId));
  }

  function getUsedIn(compId) {
    return getComponentUsedIn(compId, fgProducts);
  }

  function getComponentFgUsages(component) {
    const shortageRow = shortageByComponent[component.id];
    const usages = shortageScope && shortageRow?.fgUsages
      ? shortageRow.fgUsages
      : getUsedIn(component.id).map((usedFg) => {
          const fg = fgProducts.find((item) => item.partNo === usedFg.partNo);
          const norms = fg?.items?.find(
            (item) => normalizeComponentId(item.componentId) === normalizeComponentId(component.id),
          )?.norms || 0;
          const productionQty = Object.values(fg?.monthlyPlan || {}).reduce(
            (sum, qty) => sum + Number(qty || 0), 0,
          );
          return {
            partNo: usedFg.partNo,
            name: usedFg.name || fg?.name || fg?.desc || "",
            required: getRequiredQuantity(productionQty, norms, component),
          };
        });
    const byFg = new Map();
    usages.forEach((usage) => {
      if (!usage.partNo) return;
      const existing = byFg.get(usage.partNo) || { ...usage, required: 0 };
      existing.required += Number(usage.required || 0);
      byFg.set(usage.partNo, existing);
    });
    return [...byFg.values()];
  }

  const displayedRows = filtered.flatMap((component) => {
    const usages = splitByFgRows ? getComponentFgUsages(component) : [];
    if (!splitByFgRows || usages.length === 0) {
      return [{ component, fgUsage: null, splitIndex: 0, splitCount: 1 }];
    }
    const shortageRow = shortageByComponent[component.id];
    const availableStock = shortageScope && shortageRow
      ? Number(shortageRow.openingStock ?? shortageRow.stock ?? getComponentTotalStock(component))
      : getComponentTotalStock(component);
    const allocations = allocateSequentialRequirements(
      availableStock,
      usages.map((usage) => usage.required),
    );
    return usages.map((fgUsage, splitIndex) => ({
      component,
      fgUsage: { ...fgUsage, ...allocations[splitIndex] },
      splitIndex,
      splitCount: usages.length,
    }));
  });

  function getExportRows() {
    return filtered.map((c) => {
      const shortageRow = shortageByComponent[c.id];
      const usedIn = getUsedIn(c.id);
      const demandRequirement = shortageScope
        ? Number(shortageRow?.required || 0)
        : getDemandRequirement(c.id);
      const totalStock = getComponentTotalStock(c);
      const shortageQty = Math.max(
        0,
        shortageScope && shortageRow
          ? Number(shortageRow.shortage || 0)
          : demandRequirement - totalStock,
      );
      const coverageDays = componentMetrics[c.id]?.coverageDays;
      const adr = componentMetrics[c.id]?.dailyConsumption || 0;
      const rawBalance = shortageScope && shortageRow
        ? Number(shortageRow.stock || 0) - Number(shortageRow.required || 0)
        : Number(componentMetrics[c.id]?.balance ?? (
            totalStock + Number(c.inwardQty || 0) + Number(c.ibPending || 0) - demandRequirement
          ));
      const balance = Math.max(0, rawBalance);
      const calculatedRisk =
        componentMetrics[c.id]?.risk ||
        getStockStatus(demandRequirement, totalStock);
      const usedInText =
        shortageScope && shortageRow
          ? shortageRow.fgList || shortageRow.fgPartNo || ""
          : usedIn.map((fg) => `${fg.partNo} - ${fg.name}`).join(" | ");

      const exportRow = {
        "Part Number": c.id,
        Description: c.desc,
        "Product Group": c.productGroup || "",
        "Application Category": c.cat,
        "Material Discipline": c.materialDiscipline || "",
        UOM: c.uom,
        Vendor: c.vendor || "",
        "Vendor Code": c.vendorCode || "",
        "Manufacturing Code": c.manufacturingCode || "",
        "Manufacturing Number": c.manufacturingNumber || "",
        "Open Order": Math.round(Number(c.openOrder) || 0),
        "Lead Time (Months)": Number(c.leadTimeMonths) || 0,
        ...Object.fromEntries(projectionDates.map((date) => [
          date,
          date === addMonthsToDate(c.projectionStartDate, c.leadTimeMonths)
            ? Math.round(Number(c.openOrder) || 0)
            : "",
        ])),
        "Used In": usedInText,
        Requirement: Math.round(Number(demandRequirement) || 0),
        "Total Stock": Math.round(Number(totalStock) || 0),
        Balance: Math.round(balance),
        MM01: Math.round(Number(c.storeStockMm01) || 0),
        MM10: Math.round(Number(c.storeStockMm10) || 0),
        QR01: Math.round(Number(c.qr01Stock) || 0),
        "IB Pending": Math.round(Number(c.ibPending) || 0),
        Shortage: Math.round(Number(shortageQty) || 0),
        "Coverage Days": coverageDays ?? "",
        ADR: Math.round(Number(adr) || 0),
        Status: getRiskLabel(calculatedRisk),
      };
      if (!splitByFgRows) return exportRow;
      const fgUsages = getComponentFgUsages(c);
      if (fgUsages.length === 0) return exportRow;
      const splitAvailableStock = shortageScope && shortageRow
        ? Number(shortageRow.openingStock ?? shortageRow.stock ?? totalStock)
        : totalStock;
      const allocations = allocateSequentialRequirements(
        splitAvailableStock,
        fgUsages.map((usage) => usage.required),
      );
      return fgUsages.map((usage, index) => {
        const allocation = allocations[index];
        const requirement = allocation.required;
        return {
          ...exportRow,
          "Used In": `${usage.partNo}${usage.name ? ` - ${usage.name}` : ""}`,
          Requirement: Math.round(requirement),
          Balance: Math.round(allocation.closingStock),
          Shortage: Math.round(allocation.shortage),
          Status: getRiskLabel(getStockStatus(requirement, allocation.openingStock)),
        };
      });
    }).flat();
  }

  function exportRawMaterials() {
    const exportScope = shortageDate
      ? `Date ${shortageDate}`
      : shortageMonth
        ? `Month ${shortageMonth}`
        : "All Dates";
    const selectedPeriod = shortageDate || shortageMonth || "all_dates";
    const allHeaders = [
      "Part Number",
      "Description",
      "Product Group",
      "Application Category",
      "Material Discipline",
      "UOM",
      "Vendor",
      "Vendor Code",
      "Manufacturing Code",
      "Manufacturing Number",
      "Open Order",
      "Lead Time (Months)",
      ...projectionDates.map(formatProjectionDate),
      "Used In",
      "Requirement",
      "Total Stock",
      "Balance",
      "MM01",
      "MM10",
      "QR01",
      "IB Pending",
      "Shortage",
      "Coverage Days",
      "ADR",
      "Status",
    ];
    const exportKeys = {
      "Part Number": "partNumber",
      Description: "description",
      "Product Group": "productGroup",
      "Application Category": "applicationCategory",
      "Material Discipline": "materialDiscipline",
      UOM: "uom",
      Vendor: "vendorName",
      "Vendor Code": "vendorCode",
      "Manufacturing Code": "manufacturingCode",
      "Manufacturing Number": "manufacturingNumber",
      "Open Order": "openOrder",
      "Lead Time (Months)": "leadTimeMonths",
      "Used In": "usedIn",
      Requirement: "requirement",
      "Total Stock": "totalStock",
      Balance: "balance",
      MM01: "storeStockMm01",
      MM10: "storeStockMm10",
      QR01: "qr01Stock",
      "IB Pending": "ibPending",
      Shortage: "shortage",
      "Coverage Days": "coverageDays",
      ADR: "adr",
      Status: "status",
    };
    const fixedExportKeys = new Set(["partNumber", "description", "status"]);
    const headers = allHeaders.filter((header) => {
      const projectionDate = projectionDates.find(
        (date) => formatProjectionDate(date) === header,
      );
      const key = projectionDate
        ? `projection:${projectionDate}`
        : exportKeys[header];
      return !key || fixedExportKeys.has(key) || !hiddenColumns.includes(key);
    });
    const rows = getExportRows().map((row) =>
      Object.fromEntries(
        headers.map((header) => {
          const projectionDate = projectionDates.find(
            (date) => formatProjectionDate(date) === header,
          );
          return [header, row[projectionDate || header]];
        }),
      ),
    );
    setExportJob({
      title: `Components Filtered ${exportScope}`,
      fileName: `components_filtered_${selectedPeriod}`,
      headers,
      rows,
    });
  }

  async function exportMonthlyRawMaterials() {
    const monthlyReports = reportsData?.shortages?.monthly || {};
    const months = reportsData?.shortages?.monthlySummary?.map((row) => row.month) || [];
    if (!months.length) {
      showToast("No monthly production plan data to download", "error");
      return;
    }

    const identityColumns = [
      ["productGroup", "Product Group", (c) => c.productGroup || ""],
      ["applicationCategory", "Application Category", (c) => c.cat || ""],
      ["materialDiscipline", "Material Discipline", (c) => c.materialDiscipline || ""],
      ["uom", "UOM", (c) => c.uom || ""],
      ["materialType", "Material Type / Category", (c) => c.componentType || ""],
      ["oeExport", "OE / Export", (c) => c.oeExport || ""],
      ["vendorName", "Vendor Name", (c) => c.vendor || ""],
      ["vendorCode", "Vendor Code", (c) => c.vendorCode || ""],
      ["manufacturingCode", "Manufacturing Code", (c) => c.manufacturingCode || ""],
      ["manufacturingNumber", "Manufacturing Number", (c) => c.manufacturingNumber || ""],
      ["openOrder", "Open Order", (c) => Math.round(Number(c.openOrder) || 0)],
      ["leadTimeMonths", "Lead Time (Months)", (c) => Number(c.leadTimeMonths) || 0],
      ["usedIn", "Used In", (c) => getUsedIn(c.id).map((fg) => `${fg.partNo}${fg.name ? ` - ${fg.name}` : ""}`).join(" | ")],
      ["storeStockMm01", "MM01", (c) => Math.round(Number(c.storeStockMm01) || 0)],
      ["storeStockMm10", "MM10", (c) => Math.round(Number(c.storeStockMm10) || 0)],
      ["qr01Stock", "QR01", (c) => Math.round(Number(c.qr01Stock) || 0)],
      ["ibPending", "IB Pending", (c) => Math.round(Number(c.ibPending) || 0)],
    ];
    const visibleIdentityColumns = identityColumns.filter(
      ([key]) => !hiddenColumns.includes(key),
    );
    const monthlyFields = [
      ["requirement", "Required Qty"],
      ["totalStock", "Opening Stock"],
      ["balance", "Balance"],
      ["shortage", "Shortage"],
      ["status", "Status"],
      ["coverageDays", "Coverage Days"],
      ["adr", "ADR"],
    ].filter(([key]) => !hiddenColumns.includes(key));
    const visibleProjections = projectionDates.filter(
      (date) => !hiddenColumns.includes(`projection:${date}`),
    );
    const headers = [
      "Part Number",
      "Description",
      ...visibleIdentityColumns.map(([, label]) => label),
      ...visibleProjections.map(formatProjectionDate),
      ...months.flatMap((month) => monthlyFields.map(([, label]) => `${month} | ${label}`)),
    ];

    const monthRows = Object.fromEntries(
      months.map((month) => [
        month,
        new Map((monthlyReports[month] || []).map((row) => [row.componentId, row])),
      ]),
    );
    const componentsWithPlans = components.filter((component) =>
      months.some((month) => monthRows[month].has(component.id)),
    );
    let workingDaysCalendar = [];
    try {
      workingDaysCalendar = await fetchWorkingDays();
    } catch {
      workingDaysCalendar = reportsData?.workingDaysCalendar || [];
    }
    const monthNumberByName = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };
    const rows = componentsWithPlans.map((component) => {
      const row = {
        "Part Number": component.id,
        Description: component.desc,
        ...Object.fromEntries(visibleIdentityColumns.map(([, label, value]) => [label, value(component)])),
        ...Object.fromEntries(visibleProjections.map((date) => [
          formatProjectionDate(date),
          date === addMonthsToDate(component.projectionStartDate, component.leadTimeMonths)
            ? Math.round(Number(component.openOrder) || 0)
            : "",
        ])),
      };
      let carriedStock = getComponentTotalStock(component);
      months.forEach((month) => {
        const monthlyRow = monthRows[month].get(component.id);
        const required = Number(monthlyRow?.required || 0);
        const openingStock = Number(monthlyRow?.openingStock ?? monthlyRow?.stock ?? carriedStock);
        const balance = Number(monthlyRow?.closingStock ?? Math.max(0, openingStock - required));
        const shortage = Number(monthlyRow?.shortage || 0);
        const workingDays = String(component.materialDiscipline || "").trim().toLowerCase() === "mechanical"
          ? 7
          : (() => {
              const [monthName, year] = month.split(" ");
              const monthKey = `${year}-${monthNumberByName[monthName] || ""}`;
              const configured = workingDaysCalendar.find((entry) => entry.monthKey === monthKey);
              return Number(configured?.workingDays) || 24;
            })();
        const adrExact = required > 0 ? required / workingDays : 0;
        const values = {
          requirement: Math.round(required),
          totalStock: Math.round(openingStock),
          balance: Math.round(Math.max(0, balance)),
          shortage: Math.round(shortage),
          status: getRiskLabel(getStockStatus(required, openingStock)),
          coverageDays: adrExact > 0 ? Math.round((openingStock / adrExact) * 10) / 10 : "",
          adr: Math.round(adrExact),
        };
        monthlyFields.forEach(([key, label]) => {
          row[`${month} | ${label}`] = values[key];
        });
        carriedStock = Math.max(0, balance);
      });
      return row;
    });

    const toFileMonth = (month) => month.replace(/\s+/g, "_");
    downloadExcelTable(
      `Raw Materials Monthly Plan ${months[0]} to ${months.at(-1)}`,
      headers,
      rows,
      `components_monthly_${toFileMonth(months[0])}_to_${toFileMonth(months.at(-1))}`,
    );
  }

  function resetFilters() {
    setResettingFilters(true);
    setSearch("");
    setShortageDate("");
    setShortageMonth("");
    setShortageOnly(false);
    setRiskFilter("all");
    setDisciplineFilter("all");
    setProductGroupFilter("all");
    setApplicationFilter("all");
    setUomFilter("all");
    setSupplierFilter("all");
    setUsedInFilter("all");
    navigate(location.pathname, { replace: true });
    showToast("All filters reset", "success");
    window.setTimeout(() => setResettingFilters(false), 350);
  }

  function toggleColumn(key) {
    setHiddenColumns((current) =>
      current.includes(key)
        ? current.filter((column) => column !== key)
        : [...current, key],
    );
  }

  const columnOptions = [
    ["materialDiscipline", "Material Discipline"],
    ["uom", "UOM"],
    ["materialType", "Material Type / Category"],
    ["oeExport", "OE / Export"],
    ["applicationCategory", "Application Category"],
    ["productGroup", "Product Group"],
    ["vendorCode", "Vendor Code"],
    ["vendorName", "Vendor Name"],
    ["manufacturingCode", "Manufacturing Code"],
    ["manufacturingNumber", "Manufacturing Number"],
    ["openOrder", "Open Order"],
    ["leadTimeMonths", "Lead Time (Months)"],
    ["usedIn", "Used In"],
    ["requirement", "Required Qty"],
    ["totalStock", "Total Stock"],
    ["balance", "Balance"],
    ["storeStockMm01", "MM01"],
    ["storeStockMm10", "MM10"],
    ["qr01Stock", "QR01"],
    ["ibPending", "IB Pending"],
    ["shortage", "Shortage"],
    ["coverageDays", "Coverage Days"],
    ["adr", "ADR"],
  ];

  function closeExport() {
    setExportJob(null);
  }

  function handleExport(format) {
    if (!exportJob?.rows?.length) {
      alert("No rows to export");
      return;
    }
    if (format === "excel")
      downloadExcelTable(exportJob.title, exportJob.headers, exportJob.rows, exportJob.fileName);
    else downloadPdfTable(exportJob.title, exportJob.headers, exportJob.rows);
    closeExport();
  }

  return (
    <div className="erp-admin rm-page flex h-screen overflow-hidden bg-[#05050a] text-white">
      {/* SIDEBAR */}
      <AdminSidebar active="components" user={user} />

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminTopbar
          title="Raw Materials"
          description="Component master, stock position and material risk"
          user={user}
          actions={
            page === "components" ? (
              <>
                <button onClick={() => toggleAllVisible(filtered)}>
                  Select Visible
                </button>
                <button
                  type="button"
                  aria-pressed={splitByFgRows}
                  onClick={() => setSplitByFgRows((current) => !current)}
                >
                  {splitByFgRows ? "Show Materials Together" : "Split All Rows by FG"}
                </button>
                {isAdmin && <>
                  <button onClick={handleDeleteSelected}>Delete Selected ({selectedIds.length})</button>
                  <button onClick={handleDeleteAll}>Delete All</button>
                  <button onClick={() => setShowUpload(true)}>Upload Excel</button>
                  <button onClick={() => setShowDisciplineUpload(true)}>Update Discipline Only</button>
                  <button onClick={openCreate}>Create Component</button>
                </>}
              </>
            ) : null
          }
        />

        <div className="flex-1 overflow-y-auto p-6">
          {page === "demand" ? (
            <MonthlyDemandPage
              components={components}
              onBack={() => setPage("components")}
              getDemandRequirement={getDemandRequirement}
              getComponentRisk={getComponentRisk}
            />
          ) : (
            <>
              {/* STAT CARDS */}
              <div className="grid grid-cols-4 gap-4 mb-5">
                {page === "removed-demand" && (
                <div className="bg-[#131627] border border-[#1e2235] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-[#6c63ff]" />
                    <span className="text-[#4a5080] text-xs uppercase tracking-widest">
                      Demand
                    </span>
                  </div>
                  <div className="text-xs text-[#8890b0] mb-3 leading-relaxed">
                    Monthly stock trends
                  </div>
                  <button
                    onClick={() => setPage("demand")}
                    className="w-full text-xs text-[#6c63ff] border border-[#2a2d4a] rounded-lg py-1.5 hover:bg-[#6c63ff]/10 transition-all"
                  >
                    View →
                  </button>
                </div>
                )}
                {statCards.map((card) => (
                  <div
                    key={card.label}
                    onClick={() => setRiskFilter(card.risk)}
                    className={`bg-[#131627] border rounded-xl p-4 cursor-pointer transition-colors ${riskFilter === card.risk ? "border-[#6c63ff]" : "border-[#1e2235] hover:border-[#4a5080]"}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: card.dot }}
                      />
                      <span className="text-[#4a5080] text-xs uppercase tracking-widest">
                        {card.label}
                      </span>
                    </div>
                    <div className={`text-4xl font-bold ${card.cls}`}>
                      {card.count}
                    </div>
                    <div className="text-[#4a5080] text-xs mt-1">
                      {card.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* TABLE */}
              <div className="bg-[#131627] border border-[#1e2235] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e2235]">
                  <div className="font-semibold text-sm text-[#c0c8e8]">
                    All Raw Materials ({filtered.length} / {components.length})
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={exportRawMaterials}
                      className="text-xs text-[#6c63ff] border border-[#2a2d4a] rounded-lg px-3 py-1.5 hover:bg-[#6c63ff]/10 whitespace-nowrap"
                    >
                      Download
                    </button>
                    <button
                      onClick={exportMonthlyRawMaterials}
                      className="text-xs text-[#6c63ff] border border-[#2a2d4a] rounded-lg px-3 py-1.5 hover:bg-[#6c63ff]/10 whitespace-nowrap"
                      title="Download monthly requirements and stock side by side in one Excel file"
                    >
                      Download Monthly Excel
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowColumnMenu((open) => !open)}
                        title={showColumnMenu ? "Close column visibility" : "Show or hide columns"}
                        aria-label={showColumnMenu ? "Close column visibility" : "Show or hide columns"}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[#2a2d4a] text-[#c0c8e8] hover:bg-white/5"
                      >
                        {showColumnMenu ? (
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m3 3 18 18" />
                            <path d="M10.6 10.7a3 3 0 0 0 4.2 4.2" />
                            <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9.3 5.1 10 8-.2.8-.8 2-1.7 3.2" />
                            <path d="M6.2 6.2C4.3 7.6 2.8 9.8 2 12c.7 2.9 4.5 8 10 8 1.8 0 3.4-.5 4.8-1.3" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                            <circle cx="12" cy="12" r="2.5" />
                          </svg>
                        )}
                      </button>
                      {showColumnMenu && (
                        <div className="absolute right-0 top-10 z-30 w-56 rounded-xl border border-[#2a2d4a] bg-[#131627] p-3 shadow-2xl">
                          <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[#8890b0]">
                            Show columns
                          </div>
                          <div className="max-h-72 space-y-1 overflow-y-auto">
                            {columnOptions.map(([key, label]) => (
                              <label
                                key={key}
                                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-xs text-[#c0c8e8] hover:bg-white/5"
                              >
                                <input
                                  type="checkbox"
                                  checked={!hiddenColumns.includes(key)}
                                  onChange={() => toggleColumn(key)}
                                  className="accent-[#6c63ff]"
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search ID or description..."
                      className="bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#6c63ff] placeholder:text-[#4a5080] w-56"
                    />
                    <select
                      value={shortageDate}
                      onChange={(e) => {
                        setShortageDate(e.target.value);
                        if (e.target.value) setShortageMonth("");
                      }}
                      className="bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#6c63ff]"
                    >
                      <option value="">All dates</option>
                      {shortageDates.map((date) => (
                        <option key={date} value={date}>
                          {date}
                        </option>
                      ))}
                    </select>
                    <select
                      value={shortageMonth}
                      onChange={(e) => {
                        setShortageMonth(e.target.value);
                        if (e.target.value) setShortageDate("");
                      }}
                      className="bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#6c63ff]"
                    >
                      <option value="">All months</option>
                      {shortageMonths.map((month) => (
                        <option key={month} value={month}>
                          {month}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-xs text-[#8890b0] whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={shortageOnly}
                        onChange={(e) => setShortageOnly(e.target.checked)}
                        className="accent-[#6c63ff]"
                      />
                      Shortage only
                    </label>
                    <select
                      value={riskFilter}
                      onChange={(e) => setRiskFilter(e.target.value)}
                      className="bg-[#0d0f1a] border border-[#1e2235] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#6c63ff]"
                    >
                      <option value="all">All Status</option>
                      <option value="critical">Critical</option>
                      <option value="high">High Risk</option>
                      <option value="safe">Safe</option>
                    </select>
                    <button
                      type="button"
                      onClick={resetFilters}
                      title="Reset all filters"
                      aria-label="Reset all filters"
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-all duration-300 active:scale-90 ${
                        resettingFilters
                          ? "rotate-180 border-[#c99cff] bg-[#352246] text-white"
                          : "border-[#2a2d4a] bg-[#0d0f1a] text-[#9c94a8] hover:border-[#a66cf1]/50 hover:bg-[#241a31] hover:text-[#d8baff]"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                        <path d="M20 4v7h-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div
                  className="overflow-x-auto"
                  style={{ maxHeight: "460px", overflowY: "auto" }}
                >
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#1e2235]">
                        {[
                          ["select", "Select", true],
                          ["partNumber", "Part Number", true],
                          ["description", "Description", true],
                          ["materialDiscipline", "Material Discipline"],
                          ["uom", "UOM"],
                          ["materialType", "Material Type / Category"],
                          ["oeExport", "OE / EXPORT"],
                          ["applicationCategory", "Application Category"],
                          ["productGroup", "Product Group"],
                          ["vendorCode", "Vendor Code"],
                          ["vendorName", "Vendor Name"],
                          ["manufacturingCode", "Manufacturing Code"],
                          ["manufacturingNumber", "Manufacturing Number"],
                          ["openOrder", "Open Order"],
                          ["leadTimeMonths", "Lead Time (Months)"],
                          ...projectionDates.map((date) => [`projection:${date}`, formatProjectionDate(date)]),
                          ["usedIn", "Used In"],
                          [
                            "requirement",
                            shortageScope === "date"
                              ? "Required Qty"
                              : shortageScope === "month"
                                ? "Monthly Required Qty"
                                : "Required Qty",
                          ],
                          ["totalStock", "Total Stock"],
                          ["balance", "Balance"],
                          ["storeStockMm01", "MM01"],
                          ["storeStockMm10", "MM10"],
                          ["qr01Stock", "QR01"],
                          ["ibPending", "IB Pending"],
                          ["shortage", "Shortage"],
                          ["coverageDays", "Coverage Days"],
                          ["adr", "ADR"],
                          ["status", "Status", true],
                          ["actions", "Remarks", true],
                        ]
                          .filter(([key, , fixed]) =>
                            (key !== "actions" || isAdmin) && (fixed || !hiddenColumns.includes(key)),
                          )
                          .map(([key, h]) => {
                          const filter = columnFilters[h];
                          return (
                            <th
                              key={key}
                              className="text-left text-xs text-[#4a5080] uppercase tracking-widest px-5 py-3 font-semibold whitespace-nowrap sticky top-0 bg-[#131627] z-10"
                            >
                              {filter ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span>{h}</span>
                                  {key === "usedIn" && (
                                    <label className="ml-2 inline-flex items-center gap-1 normal-case tracking-normal text-[10px] text-[#8890b0]">
                                      <input type="checkbox" checked={splitByFgRows} onChange={(event) => setSplitByFgRows(event.target.checked)} />
                                      Split by FG
                                    </label>
                                  )}
                                  <span
                                    className={`relative grid h-6 w-6 place-items-center rounded-md transition ${
                                      filter.value === "all"
                                        ? "text-[#777184] hover:bg-white/5 hover:text-[#c3bdca]"
                                        : "bg-[#a66cf1]/15 text-[#c99cff]"
                                    }`}
                                    title={
                                      filter.value === "all"
                                        ? `Filter ${h}`
                                        : `${h}: ${filter.value}`
                                    }
                                  >
                                    <svg
                                      viewBox="0 0 20 20"
                                      width="13"
                                      height="13"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <path d="m6 8 4 4 4-4" />
                                    </svg>
                                    <select
                                      value={filter.value}
                                      onChange={(event) =>
                                        filter.setValue(event.target.value)
                                      }
                                      aria-label={`Filter ${h}`}
                                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    >
                                      <option value="all">
                                        {filter.allLabel}
                                      </option>
                                      <option value="__blank__">(Blank)</option>
                                      {filter.options.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </span>
                                </div>
                              ) : (
                                h
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-14 text-center">
                            <div className="text-3xl mb-3">🗂</div>
                            <div className="text-sm text-[#4a5080]">
                              {search
                                ? "No components match your search"
                                : "No components added yet"}
                            </div>
                            <div className="text-xs text-[#2a2d4a] mt-1">
                              {search
                                ? "Try a different search term"
                                : "Click Create Component or Upload Excel to get started"}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map(({ component: c, fgUsage: splitFgUsage, splitIndex, splitCount }) => {
                          const ai = components.indexOf(c);
                          const shortageRow = shortageByComponent[c.id];
                          const usedIn = getUsedIn(c.id);
                          const visibleFgValue =
                            shortageScope && shortageRow
                              ? shortageRow.fgList || shortageRow.fgPartNo
                              : usedIn
                                  .map((fg) => `${fg.partNo} - ${fg.name}`)
                                  .join("|");
                          const visibleFgUsages =
                            shortageScope && shortageRow
                              ? shortageRow.fgUsages || []
                              : usedIn.map((usedFg) => {
                                  const fg = fgProducts.find(
                                    (item) => item.partNo === usedFg.partNo,
                                  );
                                    const norms =
                                    fg?.items?.find(
                                      (item) => normalizeComponentId(item.componentId) === normalizeComponentId(c.id),
                                    )?.norms || 0;
                                  const productionQty = Object.values(
                                    fg?.monthlyPlan || {},
                                  ).reduce(
                                    (sum, qty) => sum + Number(qty || 0),
                                    0,
                                  );
                                  return {
                                    partNo: usedFg.partNo,
                                    required: getRequiredQuantity(
                                      productionQty,
                                      norms,
                                      c,
                                    ),
                                  };
                                });
                          const rowFgValue = splitFgUsage
                            ? `${splitFgUsage.partNo}${splitFgUsage.name ? ` - ${splitFgUsage.name}` : ""}`
                            : visibleFgValue;
                          const rowFgUsages = splitFgUsage ? [splitFgUsage] : visibleFgUsages;
                          const demandRequirement = shortageScope
                            ? Number(shortageRow?.required || 0)
                            : getDemandRequirement(c.id);
                          const totalStock = getComponentTotalStock(c);
                          const rawBalance = shortageScope && shortageRow
                            ? Number(shortageRow.closingStock ?? (Number(shortageRow.stock || 0) - Number(shortageRow.required || 0)))
                            : Number(componentMetrics[c.id]?.balance ?? (
                                totalStock + Number(c.inwardQty || 0) + Number(c.ibPending || 0) - demandRequirement
                              ));
                          const balance = Math.max(0, rawBalance);
                          const shortageQty = Math.max(
                            0,
                            shortageScope && shortageRow
                              ? Number(shortageRow.shortage || 0)
                              : demandRequirement - totalStock,
                          );
                          const rowDemandRequirement = splitFgUsage
                            ? Number(splitFgUsage.required || 0)
                            : demandRequirement;
                          const rowBalance = splitFgUsage
                            ? splitFgUsage.closingStock
                            : balance;
                          const rowShortageQty = splitFgUsage
                            ? splitFgUsage.shortage
                            : shortageQty;
                          const coverageDays =
                            componentMetrics[c.id]?.coverageDays;
                          const calculatedRisk =
                            shortageScope && shortageRow
                              ? getStockStatus(
                                  shortageRow.required,
                                  shortageRow.stock,
                                )
                              : componentMetrics[c.id]?.risk ||
                                getStockStatus(demandRequirement, totalStock);
                          const rowRisk = splitFgUsage
                            ? getStockStatus(rowDemandRequirement, splitFgUsage.openingStock)
                            : calculatedRisk;
                          return (
                            <tr
                              key={`${c.id}-${splitFgUsage?.partNo || "all"}-${splitIndex}`}
                              className={`rm-risk-row rm-risk-row-${rowRisk} border-b border-[#1a1d35] transition-colors`}
                            >
                              <td className="px-5 py-3 text-[#4a5080] text-xs">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.includes(c.id)}
                                  onChange={() => toggleSelected(c.id)}
                                  className="accent-[#6c63ff]"
                                />
                              </td>
                              {splitIndex === 0 && <td rowSpan={splitCount} className="px-5 py-3 align-middle">
                                <span className="bg-[#1a1d35] text-[#6c63ff] text-xs font-mono px-2 py-1 rounded">
                                  {c.id}
                                </span>
                              </td>}
                              <td
                                className="px-5 py-3 text-xs text-[#8890b0] max-w-[180px] truncate"
                                title={c.desc}
                              >
                                {c.desc}
                              </td>
                              <td className={hiddenColumns.includes("materialDiscipline") ? "hidden" : "px-5 py-3 text-xs font-semibold text-[#bca5df] whitespace-nowrap"}>
                                {c.materialDiscipline || "-"}
                              </td>
                              <td className={hiddenColumns.includes("uom") ? "hidden" : "px-5 py-3 text-xs font-mono text-[#4a5080]"}>
                                {c.uom || "-"}
                              </td>
                              <td className={hiddenColumns.includes("materialType") ? "hidden" : "px-5 py-3 text-xs text-[#8890b0] whitespace-nowrap"}>
                                {c.componentType || "-"}
                              </td>
                              <td className={hiddenColumns.includes("oeExport") ? "hidden" : "px-5 py-3 text-xs text-[#8890b0] whitespace-nowrap"}>
                                {c.oeExport || "-"}
                              </td>
                              <td className={hiddenColumns.includes("applicationCategory") ? "hidden" : "px-5 py-3 text-xs text-[#8890b0] whitespace-nowrap"}>
                                {c.cat || "-"}
                              </td>
                              <td className={hiddenColumns.includes("productGroup") ? "hidden" : "px-5 py-3 text-xs text-[#8890b0]"}>
                                {c.productGroup || "-"}
                              </td>
                              <td
                                className={hiddenColumns.includes("vendorCode") ? "hidden" : "px-5 py-3 text-xs text-[#8890b0] max-w-[140px] truncate"}
                                title={c.vendorCode || ""}
                              >
                                {c.vendorCode || "-"}
                              </td>
                              <td
                                className={hiddenColumns.includes("vendorName") ? "hidden" : "px-5 py-3 text-xs text-[#8890b0] max-w-[160px] truncate"}
                                title={c.vendor || ""}
                              >
                                {c.vendor || "-"}
                              </td>
                              <td className={hiddenColumns.includes("manufacturingCode") ? "hidden" : "px-5 py-3 text-xs text-[#8890b0] max-w-[150px] truncate"} title={c.manufacturingCode || ""}>{c.manufacturingCode || "-"}</td>
                              <td className={hiddenColumns.includes("manufacturingNumber") ? "hidden" : "px-5 py-3 text-xs text-[#8890b0] max-w-[150px] truncate"} title={c.manufacturingNumber || ""}>{c.manufacturingNumber || "-"}</td>
                              <td className={hiddenColumns.includes("openOrder") ? "hidden" : "px-5 py-3 text-sm font-mono text-[#8890b0]"}>{formatWholeNumber(c.openOrder)}</td>
                              <td className={hiddenColumns.includes("leadTimeMonths") ? "hidden" : "px-5 py-3 text-sm font-mono text-[#8890b0]"}>{Number(c.leadTimeMonths || 0) || "-"}</td>
                              {projectionDates.map((date) => {
                                const dueDate = addMonthsToDate(c.projectionStartDate, c.leadTimeMonths);
                                const isProjectionDate = getProjectionDates([c]).includes(date);
                                return <td key={`${c.id}-${date}`} className="px-5 py-3 text-sm font-mono text-[#8890b0]">
                                  {date === dueDate && Number(c.openOrder) > 0
                                    ? formatWholeNumber(c.openOrder)
                                    : isProjectionDate ? "—" : ""}
                                </td>;
                              })}
                              <td className={hiddenColumns.includes("usedIn") ? "hidden" : "px-5 py-3 min-w-[220px]"}>
                                {rowFgValue ? (
                                  <FgList
                                    value={rowFgValue}
                                    fgUsages={rowFgUsages}
                                    componentUom={c.uom}
                                    onMore={() =>
                                      setFgModal({
                                        title: `${c.id} - ${c.desc}`,
                                        componentId: c.id,
                                        componentUom: c.uom,
                                        fgUsages: rowFgUsages,
                                        value: rowFgValue,
                                      })
                                    }
                                  />
                                ) : (
                                  <span className="text-xs text-[#4a5080]">
                                    -
                                  </span>
                                )}
                              </td>
                              <td className={hiddenColumns.includes("requirement") ? "hidden" : "px-5 py-3"}>
                                {(() => {
                                  const isShort =
                                    rowDemandRequirement > totalStock;
                                  return rowDemandRequirement > 0 ? (
                                    <span
                                      className={`text-sm font-bold font-mono ${isShort ? "text-red-400" : "text-[#6c63ff]"}`}
                                    >
                                      {formatWholeNumber(rowDemandRequirement)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-[#4a5080]">
                                      —
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className={hiddenColumns.includes("totalStock") ? "hidden" : "px-5 py-3 text-sm font-bold font-mono text-[#3ecfcf]"}>
                                {formatWholeNumber(totalStock)}
                              </td>
                              <td className={hiddenColumns.includes("balance") ? "hidden" : "px-5 py-3 text-sm font-bold font-mono text-[#c5b2ec]"}>{formatWholeNumber(rowBalance)}</td>
                              <td className={hiddenColumns.includes("storeStockMm01") ? "hidden" : "px-5 py-3 text-sm font-mono text-[#8890b0]"}>{formatWholeNumber(c.storeStockMm01)}</td>
                              <td className={hiddenColumns.includes("storeStockMm10") ? "hidden" : "px-5 py-3 text-sm font-mono text-[#8890b0]"}>{formatWholeNumber(c.storeStockMm10)}</td>
                              <td className={hiddenColumns.includes("qr01Stock") ? "hidden" : "px-5 py-3 text-sm font-mono text-[#8890b0]"}>{formatWholeNumber(c.qr01Stock)}</td>
                              <td className={hiddenColumns.includes("ibPending") ? "hidden" : "px-5 py-3 text-sm font-mono text-[#8890b0]"}>{formatWholeNumber(c.ibPending)}</td>
                              <td
                                className={hiddenColumns.includes("shortage") ? "hidden" : `px-5 py-3 text-sm font-bold font-mono ${rowShortageQty > 0 ? "text-red-400" : "text-green-400"}`}
                              >
                                {formatWholeNumber(rowShortageQty)}
                              </td>
                              <td className={hiddenColumns.includes("coverageDays") ? "hidden" : "px-5 py-3 text-sm font-bold font-mono text-[#8890b0] whitespace-nowrap"}>
                                {coverageDays === null ||
                                coverageDays === undefined
                                  ? "-"
                                  : coverageDays.toLocaleString()}
                              </td>
                              <td className={hiddenColumns.includes("adr") ? "hidden" : "px-5 py-3 text-sm font-mono text-[#8890b0]"}>
                                {Math.round(Number(componentMetrics[c.id]?.dailyConsumption) || 0).toLocaleString()}
                              </td>
                              <td className="min-w-[120px] px-5 py-3 whitespace-nowrap">
                                <RiskChip risk={rowRisk} />
                              </td>
                              <td className={isAdmin ? "px-5 py-3" : "hidden"}>
                                {isAdmin && (
                                <div className="flex gap-2">
                                  <ActionIconButton
                                    type="edit"
                                    label={`Edit ${c.id}`}
                                    onClick={() => openEdit(ai)}
                                  />
                                  <ActionIconButton
                                    type="delete"
                                    label={`Delete ${c.id}`}
                                    onClick={() => handleDelete(ai)}
                                  />
                                </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showForm && (
        <FormModal
          key={editData?.id || "new-component"}
          open={showForm}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          editData={editData}
          allComponents={components}
        />
      )}
      <UploadModal
        key="full-component-upload"
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onImport={handleImport}
      />
      <UploadModal
        key="discipline-only-upload"
        open={showDisciplineUpload}
        onClose={() => setShowDisciplineUpload(false)}
        onImport={handleMaterialDisciplineImport}
        disciplineOnly
      />
      <FgListModal
        title={fgModal?.title}
        value={fgModal?.value}
        componentId={fgModal?.componentId}
        componentUom={fgModal?.componentUom}
        fgProducts={fgProducts}
        fgUsages={fgModal?.fgUsages}
        onClose={() => setFgModal(null)}
      />
      <Toast toast={toast} />
      {busyMessage && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/65 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="flex min-w-64 flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#131627] px-8 py-7 text-sm text-white shadow-2xl">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#2a2d4a] border-t-[#a66cf1]" />
            <span>{busyMessage}</span>
          </div>
        </div>
      )}
      <ExportModal
        open={!!exportJob}
        title={exportJob?.title}
        rowCount={exportJob?.rows?.length || 0}
        onClose={closeExport}
        onExcel={() => handleExport("excel")}
        onPdf={() => handleExport("pdf")}
      />
    </div>
  );
}

export default Components;
