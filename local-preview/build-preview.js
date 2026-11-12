// Builds preview.html: the real Apps Script files + a local stand-in for Google Sheets.
// Run again after changing anything in ../apps-script:  node build-preview.js
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "apps-script");
const read = f => fs.readFileSync(path.join(src, f), "utf8");

const banner = `
<div class="preview-banner">
  <strong>LOCAL PREVIEW</strong> &middot; data is saved in this browser only, not in Google Sheets.
  <button type="button" onclick="previewClear()">Clear all data</button>
</div>
<style>
  .preview-banner { margin: -40px -16px 24px; z-index: 30; background: #7c3aed; color: #fff; font-size: 12px; padding: 6px 12px; display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; }
  .preview-banner button { padding: 3px 10px; font-size: 12px; background: rgba(255,255,255,.2); }
  .preview-banner button:hover { background: rgba(255,255,255,.35); }
  @media (max-width: 640px) { .preview-banner { margin: -16px -12px 16px; } }
</style>`;

const mock = `
<script>
// ---- Local stand-in for Google Sheets / Apps Script services ----
const PREVIEW_KEY = "makutaPreviewData";
// Data saved under the old key was demo data only: remove it once
try { ["makutaPreviewSheet", "makutaPreviewSheet:Tasks"].forEach(k => localStorage.removeItem(k)); } catch (e) {}
const mockSheets = {};
// One fake sheet per name ("Links", "Tasks"), each saved under its own localStorage key
function mockSheet(name) {
  if (mockSheets[name]) return mockSheets[name];
  const key = name === "Links" ? PREVIEW_KEY : PREVIEW_KEY + ":" + name;
  return mockSheets[name] = {
  data: (() => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; } })(),
  save() { localStorage.setItem(key, JSON.stringify(this.data)); },
  getName() { return name; },
  getLastRow() { return this.data.length; },
  getMaxRows() { return Math.max(1000, this.data.length); },
  insertRowsAfter() {},
  deleteRow(r) { this.data.splice(r - 1, 1); this.save(); },
  setFrozenRows() {},
  // Edit warnings on columns: only recorded, so the tests can check them
  protections: [],
  getProtections() { return this.protections.map(d => ({ getDescription: () => d })); },
  getRange(r, c, nr = 1, nc = 1) {
    const sheet = this;
    if (typeof r === "string") return { protect: () => ({ setDescription(d) { sheet.protections.push(d); return { setWarningOnly: () => this }; } }) };
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) { const row = sheet.data[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, j) => row[c - 1 + j] ?? "")); }
        return out;
      },
      setValues(vals) {
        vals.forEach((row, i) => { sheet.data[r - 1 + i] = sheet.data[r - 1 + i] || []; row.forEach((v, j) => sheet.data[r - 1 + i][c - 1 + j] = storeValue(v)); });
        sheet.save();
        return this;
      },
      getValue() { return this.getValues()[0][0]; },
      setValue(v) { return this.setValues([[v]]); },
      setFontWeight() { return this; },
      setNumberFormat() { return this; },
    };
  },
  };
}
// Sheets drops the leading apostrophe used to force plain text
function storeValue(v) { return typeof v === "string" && v.startsWith("'") ? v.slice(1) : v; }
const SpreadsheetApp = { getActiveSpreadsheet: () => ({
  getSheetByName: mockSheet,
  insertSheet: mockSheet,
  getUrl: () => "",  // no real sheet in the preview; the page shows a notice instead
  getSpreadsheetTimeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
}) };
// The preview's passcode is "preview" (filled in automatically the first time)
const mockProps = { APP_PASSCODE: "preview" };
const PropertiesService = { getScriptProperties: () => ({ getProperty: k => mockProps[k] || null, setProperty: (k, v) => { mockProps[k] = v; } }) };
try { if (localStorage.getItem("makutaPasscode") === null) localStorage.setItem("makutaPasscode", "preview"); } catch (e) {}
const mockCache = {};
const CacheService = { getScriptCache: () => ({ get: k => mockCache[k] || null, put: (k, v) => { mockCache[k] = v; } }) };
SpreadsheetApp.ProtectionType = { RANGE: "RANGE" };
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
const ScriptApp = { getService: () => ({ getUrl: () => location.href.split("?")[0] }) };
const HtmlService = {};
// Pretend calendar: reminder events are only logged to the browser console
const mockEvents = {};
const CalendarApp = { getDefaultCalendar: () => ({
  createEvent(title, start) {
    const id = "evt" + Math.random().toString(36).slice(2);
    mockEvents[id] = title;
    console.log("[preview] calendar reminder added:", title, start.toString());
    return { removeAllReminders() {}, addPopupReminder() {}, getId: () => id };
  },
  getEventById: id => ({ deleteEvent() { console.log("[preview] calendar reminder removed:", mockEvents[id] || id); delete mockEvents[id]; } }),
}) };
const Utilities = {
  getUuid: () => ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ Math.random() * 16 >> c / 4).toString(16)),
  formatDate: d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"),
};
</script>
<script>const GAS = (function () {
${read("Code.gs")}
return Object.assign({ api }, API);
})();</script>
<script>
const google = { script: {
  run: new Proxy({}, { get(_, fn) {
    let ok = () => {}, fail = () => {};
    const runner = new Proxy({}, { get(_, name) {
      if (name === "withSuccessHandler") return f => (ok = f, runner);
      if (name === "withFailureHandler") return f => (fail = f, runner);
      return (...args) => setTimeout(() => {
        try { ok(JSON.parse(JSON.stringify(GAS[name](...JSON.parse(JSON.stringify(args)))))); } catch (e) { fail(e); }
      }, 150);
    } });
    return runner[fn];
  } }),
  url: { getLocation: cb => cb({ parameter: Object.fromEntries(new URLSearchParams(location.search)) }) },
} };

function previewClear() {
  if (!confirm("Delete all data in this local preview?")) return;
  ["Links", "Tasks"].forEach(name => { mockSheet(name).data = []; mockSheet(name).save(); });
  loadData();
  toast("Preview data cleared");
}
</script>`;

const html = read("Index.html")
  .replace("<?!= include('Styles'); ?>", read("Styles.html"))
  .replace("<body>", "<body>" + banner)
  .replace("<?!= include('JavaScript'); ?>", mock + read("JavaScript.html"));
fs.writeFileSync(path.join(__dirname, "preview.html"), html);
console.log("preview.html built");
