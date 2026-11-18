// Builds preview.html: the real Apps Script files + a local stand-in for Google Sheets.
// Run again after changing anything in ../apps-script:  node build-preview.js
// A published demo version (GitHub Pages, one folder per version):  node build-preview.js v1 <output file>
// Each version keeps its demo data and login under its own browser keys, so versions on the same site never mix.
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "apps-script");
const read = f => fs.readFileSync(path.join(src, f), "utf8");
const version = process.argv[2] || "";
const out = process.argv[3] || path.join(__dirname, "preview.html");

const banner = `
<div class="preview-banner">
  <span><strong>${version ? "DEMO " + version.toUpperCase() : "LOCAL PREVIEW"}</strong> &middot; demo data, saved in this browser only, not in Google Sheets.</span>
  <span>Logins: hendra, riska, faza, obi, puput, alfid, ilham, wawan &middot; password = username + <b>demo</b> (e.g. <b>obidemo</b>) &middot; owner / <b>owner</b></span>
  <button type="button" onclick="previewReset()">Reset demo data</button>
</div>
<style>
  .preview-banner { position: relative; z-index: 1; background: #7c3aed; color: #fff; font-size: 12px; padding: 6px 12px; display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; }
  .preview-banner button { padding: 3px 10px; font-size: 12px; background: rgba(255,255,255,.2); }
  .preview-banner button:hover { background: rgba(255,255,255,.35); }
</style>`;

const mock = `
<script>
// ---- Local stand-in for Google Sheets / Apps Script services ----
// Demo data lives under its own keys, apart from anything saved by older previews
const PREVIEW_KEY = "makutaDemo${version ? "-" + version : ""}";
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
// Script Properties with demo passwords only (the real ones are never in this repository).
// Saved in the browser, so logins (sessions) survive a reload like on the real app.
const PROPS_KEY = PREVIEW_KEY + ":props";
const mockProps = Object.assign((() => { try { return JSON.parse(localStorage.getItem(PROPS_KEY)) || {}; } catch (e) { return {}; } })(),
  { PASSWORD_SUFFIX: "demo", OWNER_USERNAME: "owner", OWNER_PASSWORD: "owner" });
const saveProps = () => { try { localStorage.setItem(PROPS_KEY, JSON.stringify(mockProps)); } catch (e) {} };
const PropertiesService = { getScriptProperties: () => ({
  getProperty: k => mockProps[k] ?? null,
  setProperty(k, v) { mockProps[k] = String(v); saveProps(); },
  deleteProperty(k) { delete mockProps[k]; saveProps(); },
  getProperties: () => Object.assign({}, mockProps),
}) };
const mockCache = {};
const CacheService = { getScriptCache: () => ({ get: k => mockCache[k] || null, put: (k, v) => { mockCache[k] = v; }, remove: k => { delete mockCache[k]; } }) };
SpreadsheetApp.ProtectionType = { RANGE: "RANGE" };
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
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
// SHA-256 like Utilities.computeDigest (the browser's own is async only)
function sha256Bytes(text) {
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  const k = [], h = [];
  for (let n = 2, c = 0; c < 64; n++) {
    let prime = true;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) { prime = false; break; }
    if (!prime) continue;
    if (c < 8) h[c] = (Math.pow(n, 1 / 2) % 1) * 4294967296 | 0;
    k[c++] = (Math.pow(n, 1 / 3) % 1) * 4294967296 | 0;
  }
  const bytes = [...new TextEncoder().encode(text)], bits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255);
  for (let j = 0; j < bytes.length; j += 64) {
    const w = [];
    for (let i = 0; i < 64; i++) {
      w[i] = i < 16 ? (bytes[j + 4 * i] << 24) | (bytes[j + 4 * i + 1] << 16) | (bytes[j + 4 * i + 2] << 8) | bytes[j + 4 * i + 3]
        : (w[i - 16] + (r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 7] + (r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10))) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => h[i] = (h[i] + v) | 0);
  }
  return h.flatMap(v => [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].map(x => x > 127 ? x - 256 : x));
}
const Utilities = {
  DigestAlgorithm: { SHA_256: "SHA_256" },
  computeDigest: (alg, text) => sha256Bytes(text),
  getUuid: () => ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ Math.random() * 16 >> c / 4).toString(16)),
  formatDate: d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"),
};
</script>
<script>const GAS = (function () {
${read("Code.gs")}
// actAs: run the server functions directly as that account (the demo data and the tests use it)
return Object.assign({ api, login, actAs: key => { user_ = account_(key === "owner" ? OWNER_KEY : key); } }, API);
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
} };

${fs.readFileSync(path.join(__dirname, "demo-data.js"), "utf8")}
// The demo data is added the first time (and again when it changes); logins stay
if ((() => { try { return localStorage.getItem(PREVIEW_KEY + ":version"); } catch (e) { return ""; } })() !== DEMO_VERSION) loadDemoData();

function previewReset() {
  if (!confirm("Replace everything in this local preview with fresh demo data?")) return;
  loadDemoData();
  if (state.user) loadData();
  toast("Demo data loaded");
}
</script>`;

// The login screen covers the banner, so it says the demo logins too
const loginHint = `<p>Log in with your username and password.</p>
      <p class="demo-login"><b>Demo:</b> password = username + <b>demo</b>, e.g. <b>hendra</b> / <b>hendrademo</b>. Owner: <b>owner</b> / <b>owner</b>.<br>The passwords of the real app do not work here.</p>
      <style>.demo-login { margin-top: -6px; padding: 8px 10px; border-radius: 10px; background: rgba(124, 58, 237, .12); color: inherit; font-size: 13px; }</style>`;
let html = read("Index.html")
  .replace("<p>Log in with your username and password.</p>", loginHint)
  .replace("<?!= include('Styles'); ?>", read("Styles.html"))
  // Inside the main area, so the sidebar keeps the full height of the screen
  .replace('<main class="main">', '<main class="main">' + banner)
  .replace("<?!= include('JavaScript'); ?>", mock + read("JavaScript.html"));
if (version) {
  // Own login per version, a tab title that says which demo it is, and kept out of search engines
  html = html.replace(/"makutaTicket"/g, `"makutaTicket-${version}"`)
    .replace("<head>", `<head>\n  <title>Makuta Links Center · Demo ${version}</title>\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="robots" content="noindex">`);
  if (!html.includes(`"makutaTicket-${version}"`)) throw new Error("login key not found");
}
fs.writeFileSync(out, html);
console.log(path.basename(out) + " built" + (version ? " (demo " + version + ")" : ""));
