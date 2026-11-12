// End-to-end test of local-preview/preview.html in headless Chrome.
// Rebuilds preview.html from apps-script/ first, then tests the server logic and every button.
// Usage (in this folder): npm install (once), then npm test
// Screenshots for a visual check are saved in tests/screenshots/.
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const preview = path.join(__dirname, "..", "local-preview");
execFileSync(process.execPath, [path.join(preview, "build-preview.js")], { stdio: "inherit" });
const file = path.join(preview, "preview.html");
const shots = path.join(__dirname, "screenshots");
fs.mkdirSync(shots, { recursive: true });
// Chrome location; set CHROME_PATH when Chrome is installed somewhere else
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : fail++; console.log((cond ? "  PASS " : "  FAIL ") + name); };

(async () => {
  if (!chrome) throw new Error("Chrome not found. Set CHROME_PATH to chrome.exe.");
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  page.on("dialog", d => d.accept());
  await page.setViewport({ width: 1300, height: 900 });
  await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"));
  await page.waitForFunction(() => state.loaded);

  /* ---------- 1. Server logic (Code.gs) ---------- */
  console.log("Server logic");
  const r = await page.evaluate(() => {
    const out = {};
    const tryErr = fn => { try { fn(); return ""; } catch (e) { return e.message; } };
    ["Links", "Tasks"].forEach(n => { mockSheet(n).data = []; mockSheet(n).save(); });
    const cfg = GAS.getInitialData().taskConfig;
    // Every project x content type x channel runs from brief to done
    out.flows = [];
    Object.keys(cfg.projects).forEach(p => (cfg.projects[p].types || cfg.contentTypes.filter(t => t !== cfg.eventType)).forEach(type =>
      ["ORG", "ADS"].filter(c => !(cfg.projects[p].orgOnly && c === "ADS")).forEach(ch => {
        let t = GAS.addTask({ title: `TEST ${ch} DEC ${p}`, project: p, type, deadline: "2026-12-20", videographer: cfg.projects[p].videographer ? "" : "Arif" });
        const visited = [t.stage];
        for (let i = 0; i < 30 && t.stage !== "done"; i++) { t = GAS.moveTask(t.id, "advance", { from: t.stage }); visited.push(t.stage); }
        out.flows.push({ p, type, ch, visited: visited.join(">"), vg: t.videographer, designer: t.designer });
      })));
    out.errors = {
      krrNonShoot: tryErr(() => GAS.addTask({ title: "X ORG KRR", project: "KRR", type: "Video (Non-Shooting)" })),
      vtbNonShoot: tryErr(() => GAS.addTask({ title: "X ORG VTB", project: "VTB", type: "Video (Non-Shooting)" })),
      gtrShoot: tryErr(() => GAS.addTask({ title: "X ORG GTR", project: "GTR", type: "Video (Shooting)" })),
      vtbEvent: tryErr(() => GAS.addTask({ title: "X ORG VTB", project: "VTB", type: "Event Attribute", deadline: "2026-12-20" })),
      makutaAds: tryErr(() => GAS.addTask({ title: "X ADS MAKUTA", project: "Makuta", type: "Static" })),
      makutaNoVg: tryErr(() => GAS.addTask({ title: "X ORG MAKUTA", project: "Makuta", type: "Video (Shooting)" })),
      makutaBadVg: tryErr(() => GAS.addTask({ title: "X ORG MAKUTA", project: "Makuta", type: "Video (Shooting)", videographer: "Budi" })),
      eventNoDate: tryErr(() => GAS.addTask({ title: "EVENT ORG KRR", project: "KRR", type: "Event Attribute" })),
      noChannel: tryErr(() => GAS.addTask({ title: "BRIEF DEC KRR", project: "KRR", type: "Static" })),
      bothChannels: tryErr(() => GAS.addTask({ title: "ORG ADS KRR", project: "KRR", type: "Static" })),
    };
    // Revisions: internal QC goes straight back to QC after the fix; client revisions go via Obi
    let t = GAS.addTask({ title: "VIDEO CTC ORG DEC KRR", project: "KRR", type: "Video (Shooting)" });
    out.krrVg = t.videographer;
    const adv = n => { for (let i = 0; i < n; i++) t = GAS.moveTask(t.id, "advance"); };
    adv(4); out.atQcCut = t.stage;
    t = GAS.moveTask(t.id, "revise", { to: "shoot", note: "reshoot" }); out.reviseTo = t.stage;
    adv(1); out.afterFixShoot = t.stage;
    adv(1); out.afterQcCut = t.stage;
    adv(3); out.atQcClient = t.stage;
    t = GAS.moveTask(t.id, "revise", { to: "design", note: "client" }); out.clientRev = t.stage;
    out.advanceAtRevision = tryErr(() => GAS.moveTask(t.id, "advance"));
    out.badAssign = tryErr(() => GAS.moveTask(t.id, "assign", { to: "brief" }));
    t = GAS.moveTask(t.id, "assign", { to: "video" }); out.assigned = t.stage;
    adv(1); out.afterClientFix = t.stage;
    out.stale = tryErr(() => GAS.moveTask(t.id, "advance", { from: "brief" }));
    t = GAS.moveTask(t.id, "undo"); out.undo = t.stage;
    out.revCount = mockSheet("Tasks").data.find(r => r[0] === t.id)[12];
    out.reviseNonQc = tryErr(() => GAS.moveTask(t.id, "revise", { to: "brief" }));
    // Event Attribute checklist
    let e = GAS.addTask({ title: "EVENT ORG DECEMBER KRR", project: "KRR", type: "Event Attribute", deadline: "2026-12-20" });
    out.eventSteps = e.steps.join(">");
    e = GAS.setTaskItem(e.id, "Flyer Cetak", true);
    e = GAS.setTaskItem(e.id, "Countdown H-5", true);
    e = GAS.setTaskItem(e.id, "Countdown H-5", true);
    out.ticked = e.checklist.slice().sort().join(",");
    e = GAS.setTaskItem(e.id, "Flyer Cetak", false);
    out.afterUntick = GAS.getTasks().find(x => x.id === e.id).checklist.join(",");
    out.badItem = tryErr(() => GAS.setTaskItem(e.id, "Spanduk", true));
    out.nonEventItem = tryErr(() => GAS.setTaskItem(t.id, "Flyer Cetak", true));
    e = GAS.updateTask(e.id, { title: "BRIEF ORG DECEMBER KRR", project: "KRR", type: "Static", deadline: "2026-12-20" });
    out.checklistAfterTypeChange = e.checklist.length;
    out.missingTask = tryErr(() => GAS.moveTask("Tnope", "advance"));
    // Links
    const l = GAS.addLink({ title: "=SUM(1)", url: "https://a.com/x", category: "Google Docs", project: "KRR", deadline: "2026-12-20", versions: [{ label: "P2", url: "https://a.com/y" }] });
    out.formulaSafe = GAS.getLinks()[0].title;
    out.ctcNoSource = tryErr(() => GAS.addLink({ title: "v", url: "https://a.com", category: "CTC-Video" }));
    out.badUrl = tryErr(() => GAS.addLink({ title: "v", url: "a.com", category: "Other" }));
    GAS.updateLink(l.id, Object.assign({}, l, { status: "Done" }));
    GAS.setPinned(l.id, true);
    out.pinned = GAS.getLinks()[0].pinned;
    GAS.deleteLink(l.id);
    out.linksLeft = GAS.getLinks().length;
    out.missingLink = tryErr(() => GAS.deleteLink(l.id));
    return out;
  });
  const flow = (p, type, ch) => r.flows.find(f => f.p === p && f.type === type && f.ch === ch);
  ok(r.flows.length === 17, `17 project/type/channel combinations created (got ${r.flows.length})`);
  ok(r.flows.every(f => f.visited.endsWith(">done")), "every combination reaches Done by pressing the main button");
  ok(flow("VTB", "Static", "ORG").visited === "brief>qcBrief>design>qcContent>toClient>qcClient>post>done", "Static ORG timeline");
  ok(flow("KRR", "Video (Shooting)", "ADS").visited === "brief>qcBrief>shoot>video>qcCut>motion>qcContent>toClient>qcClient>ads>done", "Video Shooting ADS timeline (Shooting before CTC)");
  ok(flow("GTR", "Video (Non-Shooting)", "ORG").visited === "brief>qcBrief>vo>video>qcCut>motion>qcContent>toClient>qcClient>post>done", "Video Non-Shooting timeline (Voice Over)");
  ok(flow("KRR", "Event Attribute", "ORG").visited === flow("KRR", "Static", "ORG").visited, "Event Attribute follows the Static timeline");
  ok(flow("KRR", "Event Attribute", "ADS").visited.includes(">ads>"), "Event Attribute ADS ends with Run Ads");
  ok(["VTB", "KRR", "GTR"].every(p => r.flows.filter(f => f.p === p && /^Video/.test(f.type)).every(f => f.vg === "Anno")), "VTB / KRR / GTR videos get VG Anno automatically");
  ok(r.flows.filter(f => f.p === "Makuta" && /^Video/.test(f.type)).every(f => f.vg === "Arif"), "Makuta videos keep the chosen videographer");
  ok(r.flows.filter(f => !/^Video/.test(f.type)).every(f => f.vg === ""), "non-video tasks have no videographer");
  ok(r.flows.find(f => f.p === "GTR").designer === "Wawan" && flow("VTB", "Static", "ORG").designer === "Ilham", "graphic designer comes from the project");
  for (const [k, v] of Object.entries(r.errors)) ok(!!v, `rejected: ${k} -> "${v}"`);
  ok(r.atQcCut === "qcCut" && r.reviseTo === "shoot" && r.afterFixShoot === "qcCut" && r.afterQcCut === "motion", "QC CTC revision -> fix -> straight back to QC CTC -> Motion / ToV");
  ok(r.atQcClient === "qcClient" && r.clientRev === "revision", "QC Client revision always goes back to Obi");
  ok(!!r.advanceAtRevision && !!r.badAssign, "Obi must pick a valid person for the client revision");
  ok(r.assigned === "video" && r.afterClientFix === "qcCut", "client revision passed to CTC returns to QC CTC");
  ok(!!r.stale, "double click / stale page cannot move a task twice");
  ok(r.undo === "video", "Undo returns to the previous step");
  ok(r.revCount === "2", "Revisions column counts both revisions");
  ok(!!r.reviseNonQc, "revision only allowed at QC steps");
  ok(r.eventSteps === "brief>qcBrief>design>qcContent>toClient>qcClient>post", "Event task steps");
  ok(r.ticked === "Countdown H-5,Flyer Cetak", "checklist ticks saved without duplicates");
  ok(r.afterUntick === "Countdown H-5", "checklist untick saved");
  ok(!!r.badItem && !!r.nonEventItem, "checklist rejects unknown items and non-event tasks");
  ok(r.checklistAfterTypeChange === 0, "changing away from Event Attribute clears the checklist");
  ok(/^Task not found/.test(r.missingTask) && /^Link not found/.test(r.missingLink), "not-found errors name the right thing");
  ok(r.formulaSafe === "=SUM(1)", "text starting with = is stored as text, not a formula");
  ok(!!r.ctcNoSource && !!r.badUrl, "link validation");
  ok(r.pinned === true && r.linksLeft === 0, "link update / pin / delete");

  /* ---------- 2. Page: sample data (fixtures.js) + buttons ---------- */
  console.log("Page");
  await page.addScriptTag({ path: path.join(__dirname, "fixtures.js") });
  await page.evaluate(() => loadTestData());
  await page.waitForFunction(() => state.tasks.length > 0);
  await page.evaluate(() => showView("tasks"));
  await page.select("#tStep", "all");
  ok(await page.$$eval("#taskResults article.task", a => a.length) === 16, "sample data: 16 tasks shown");
  ok(await page.$$eval(".checklist", a => a.length) === 1, "sample data: KRR event task shows its checklist");
  ok(await page.$eval(".checklist-head", e => e.textContent.includes("2/5")), "sample data: checklist shows 2/5");
  ok(await page.$$eval(".ms-red", a => a.length) > 0, "sample data: open revisions shown in red");

  // New task form: Makuta video needs a videographer
  const openForm = async () => { await page.evaluate(() => openTaskForm()); await page.waitForSelector("#taskModal.show"); };
  const typeOptions = () => page.$$eval("#tfType option", o => o.map(x => x.value).filter(Boolean));
  await openForm();
  await page.type("#tfTitle", "VIDEO CTC ORG DECEMBER MAKUTA");
  ok(await page.$eval("#tfProject", s => s.value) === "Makuta", "project picked from the title");
  ok((await typeOptions()).join() === "Static,Video (Non-Shooting),Video (Shooting)", "Makuta: all types except Event Attribute");
  await page.select("#tfType", "Video (Shooting)");
  ok(await page.$eval("#tfVideographerField", e => !e.hidden), "Makuta: videographer field shown on a new task");
  await page.click("#taskSaveBtn");
  ok(await page.$eval("#taskFormErr", e => !e.hidden && /videographer/i.test(e.textContent)), "Makuta: saving without a videographer is blocked");
  await page.select("#tfVideographer", "Arif");
  await page.click("#taskSaveBtn");
  await page.waitForFunction(() => !document.querySelector("#taskModal.show"));
  ok(await page.evaluate(() => state.tasks.some(t => t.project === "Makuta" && t.videographer === "Arif" && t.history.length === 1)), "Makuta video task saved with VG Arif");

  // KRR: no Non-Shooting, has Event Attribute; VTB: no Event Attribute; VG field hidden for fixed VG
  await openForm();
  await page.type("#tfTitle", "EVENT ORG DECEMBER KRR");
  ok((await typeOptions()).join() === "Static,Video (Shooting),Event Attribute", "KRR types: Static, Video (Shooting), Event Attribute");
  await page.select("#tfType", "Video (Shooting)");
  ok(await page.$eval("#tfVideographerField", e => e.hidden), "KRR new video: videographer hidden (auto Anno)");
  await page.select("#tfType", "Event Attribute");
  ok(await page.$eval("#tfDeadlineLabel", e => e.textContent.includes("Event Date")), "Event: deadline labeled Event Date (D-Day)");
  await page.click("#taskSaveBtn");
  ok(await page.$eval("#taskFormErr", e => !e.hidden && /event date/i.test(e.textContent)), "Event: saving without the event date is blocked");
  await page.$eval("#tfDeadline", e => { e.value = "2026-12-20"; e.dispatchEvent(new Event("input")); });
  ok(await page.$eval("#tfEventItems", e => e.textContent.includes("Countdown H-5 (15 Dec)") && e.textContent.includes("D-Day (20 Dec)")), "Event: countdown dates counted back from D-Day");
  await page.click("#taskSaveBtn");
  await page.waitForFunction(() => !document.querySelector("#taskModal.show"));
  const evId = await page.evaluate(() => state.tasks.filter(t => t.type === "Event Attribute").pop().id);
  await page.select("#tStep", "all");
  await page.click(`input[data-titem="Video Reels Pameran"][data-id="${evId}"]`);
  await page.waitForFunction(id => state.tasks.find(t => t.id === id).checklist.length === 1, {}, evId);
  ok(await page.evaluate(id => GAS.getTasks().find(t => t.id === id).checklist[0] === "Video Reels Pameran", evId), "ticking a checkbox saves it");
  await openForm();
  await page.type("#tfTitle", "BRIEF ORG DECEMBER VTB");
  ok(!(await typeOptions()).includes("Event Attribute"), "VTB has no Event Attribute");
  await page.click("#taskModal .btn-soft");

  // Walk the new event task through every step with the real buttons, with one client revision
  const card = () => page.evaluateHandle(id => document.querySelector(`[data-id="${id}"]`).closest("article"), evId);
  const stage = () => page.evaluate(id => state.tasks.find(t => t.id === id).stage, evId);
  const clickIn = async (sel) => { const c = await card(); const b = await c.$(sel); await b.click(); };
  const waitStage = (s) => page.waitForFunction((id, s) => state.tasks.find(t => t.id === id).stage === s, {}, evId, s);
  const seen = [await stage()];
  let revised = false;
  for (let i = 0; i < 20 && seen[seen.length - 1] !== "done"; i++) {
    const s = seen[seen.length - 1];
    if (s === "qcClient" && !revised) {
      await clickIn('[data-tact="revise"]');
      await page.waitForSelector("#reviseModal.show");
      ok(await page.$eval("#reviseToField", e => e.hidden), "QC Client revise popup has no step picker (goes to Obi)");
      await page.type("#reviseNote", "Ganti tanggal di flyer");
      await page.click("#reviseOk");
      await waitStage("revision");
      ok(await page.evaluate(id => document.querySelector(`[data-id="${id}"]`).closest("article").querySelectorAll(".ms-red").length >= 2, evId), "client revision turns the timeline red");
      await clickIn('[data-tact="assign"][data-to="design"]');
      await waitStage("design");
      revised = true;
    } else {
      await clickIn('[data-tact="advance"]');
      await page.waitForFunction((id, s) => state.tasks.find(t => t.id === id).stage !== s, {}, evId, s);
    }
    seen.push(await stage());
  }
  ok(seen.join(">") === "brief>qcBrief>design>qcContent>toClient>qcClient>design>qcContent>toClient>qcClient>post>done", "buttons walk the event task to Done: " + seen.join(">"));
  ok(await page.evaluate(id => document.querySelector(`[data-id="${id}"]`).closest("article").querySelectorAll(".ms-red").length === 0, evId), "timeline green again after the client approved");
  await clickIn('[data-tact="undo"]');
  await page.click("#confirmOk");
  await waitStage("post");
  ok(true, "Undo button works");
  await clickIn('[data-tact="delete"]');
  await page.click("#confirmOk");
  await page.waitForFunction(id => !state.tasks.some(t => t.id === id), {}, evId);
  ok(await page.evaluate(id => !GAS.getTasks().some(t => t.id === id), evId), "Delete button removes the task");

  // Edit: Arif can be picked for a VTB video only via Edit
  const vtbId = await page.evaluate(() => state.tasks.find(t => t.project === "VTB" && t.type === "Video (Shooting)").id);
  await page.evaluate(id => openTaskForm(state.tasks.find(t => t.id === id)), vtbId);
  ok(await page.$eval("#tfVideographerField", e => !e.hidden) && await page.$eval("#tfVideographer", s => s.value) === "Anno", "Edit: videographer picker shown with Anno");
  await page.select("#tfVideographer", "Arif");
  await page.click("#taskSaveBtn");
  await page.waitForFunction(id => state.tasks.find(t => t.id === id).videographer === "Arif", {}, vtbId);
  ok(true, "Edit: VTB video switched to VG Arif");

  // Filters
  await page.select("#tType", "Event Attribute");
  ok(await page.$$eval("#taskResults article.task", a => a.length) === 1, "filter by Event Attribute");
  await page.evaluate(() => resetTaskFilters());

  // Links tab
  await page.evaluate(() => showView("submit"));
  await page.type("#title", "Test Link");
  await page.type("#url", "docs.google.com/document/d/abc");
  await page.select("#category", "CTC-Video");
  await page.click("#submitBtn");
  ok(await page.$eval("#videoSourceErr", e => !e.hidden), "CTC-Video needs the video source");
  await page.select("#videoSource", "VG-Anno");
  await page.click("#submitBtn");
  await page.waitForSelector("#successModal.show");
  ok(await page.evaluate(() => state.links.some(l => l.category === "CTC-Video [VG-Anno]" && l.url === "https://docs.google.com/document/d/abc")), "link saved with https:// added");
  await page.evaluate(() => { closeModal("successModal"); showView("links"); });
  ok(await page.$$eval("#results tbody tr", a => a.length) === 8, "All Links table shows 8 links");
  ok(await page.$$eval("#results thead th", a => a.every(th => th.textContent.trim())), "every table column has a name (incl. Pin)");
  // Sample data follows the app rules: known projects only, Reference -> REFERENCE
  const known = await page.evaluate(() => Object.keys(state.cfg.projects).concat(REFERENCE_PROJECT));
  ok(await page.evaluate(k => state.links.every(l => !l.project || k.includes(l.project)), known), "sample links only use real projects");
  ok(await page.evaluate(() => state.links.filter(l => l.category === "Reference").every(l => l.project === "REFERENCE")), "sample Reference links are in REFERENCE");
  // Table fits without sideways scrolling at every width (cards below 1340px)
  for (const w of [1920, 1440, 1340, 1339, 1024, 800, 390]) {
    await page.setViewport({ width: w, height: 900 });
    const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - innerWidth, document.querySelector(".table-wrap").scrollWidth - document.querySelector(".table-wrap").clientWidth));
    ok(over <= 0, `table at ${w}px: no sideways scroll (${over}px)`);
  }
  await page.setViewport({ width: 1300, height: 900 });
  await page.click('#results [data-act="pin"]');
  await page.click(".segmented button[data-view=groups]");
  ok(await page.$$eval("#results .group", a => a.length) >= 4, "By Project view renders");

  // Reference category: project becomes REFERENCE (locked), and goes back to empty when changed
  await page.evaluate(() => showView("submit"));
  await page.type("#project", "KRR");
  await page.select("#category", "Reference");
  ok(await page.$eval("#project", e => e.value === "REFERENCE" && e.readOnly), "Reference: project set to REFERENCE and locked");
  await page.select("#category", "Google Docs");
  ok(await page.$eval("#project", e => e.value === "" && !e.readOnly), "other category: project unlocked again");
  await page.evaluate(() => resetForm());
  ok(await page.evaluate(() => GAS.addLink({ title: "r", url: "https://r.com", category: "Reference", project: "KRR" }).project === "REFERENCE"), "server forces REFERENCE for Reference links");
  ok(await page.evaluate(() => GAS.addLink({ title: "r", url: "https://r2.com", category: "Other", project: "reference" }).project === ""), "server keeps REFERENCE for Reference links only");

  // Footer credit opens Instagram in a new tab
  ok(await page.$eval(".credit a", a => a.textContent.trim() === "Made by Muhammad Nurul Qolbi" && a.href === "https://www.instagram.com/biyoosh.i/" && a.target === "_blank" && a.rel === "noopener"), "footer: Made by Muhammad Nurul Qolbi -> Instagram (new tab)");

  // Passcode: the server refuses every call without the right passcode
  const lockErr = await page.evaluate(() => {
    const err = fn => { try { fn(); return ""; } catch (e) { return e.message; } };
    return {
      wrong: err(() => GAS.api("nope", "getLinks", [])),
      empty: err(() => GAS.api("", "deleteLink", ["x"])),
      unknown: err(() => GAS.api("preview", "getSheet_", [])),
      ok: Array.isArray(GAS.api("preview", "getLinks", [])),
    };
  });
  ok(/^LOCKED: Wrong passcode/.test(lockErr.wrong) && /^LOCKED/.test(lockErr.empty), "server: wrong / empty passcode refused");
  ok(lockErr.unknown === "Unknown action." && lockErr.ok, "server: only listed actions can be called, right passcode works");
  // Passcode screen: Lock, wrong passcode, then the right one
  await page.evaluate(() => lockApp());
  ok(await page.$eval("#lockModal", e => e.classList.contains("show")) && !(await page.evaluate(() => state.links.length)), "Lock button shows the passcode screen and hides the data");
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  ok(await page.$eval("#lockModal", e => e.classList.contains("show")), "passcode screen cannot be closed with Esc or a click outside");
  await page.type("#lockInput", "salah");
  await page.click("#lockEye");
  ok(await page.$eval("#lockInput", e => e.type === "text" && e.value === "salah") && await page.$eval("#lockEye", e => e.classList.contains("on")), "eye button shows the passcode");
  await page.click("#lockEye");
  ok(await page.$eval("#lockInput", e => e.type === "password" && e.value === "salah"), "eye button hides it again (text kept)");
  await page.click("#lockEye");
  await page.click(".lock-btn");
  await page.waitForFunction(() => !document.getElementById("lockErr").hidden);
  ok(await page.$eval("#lockErr", e => e.textContent.includes("Wrong passcode")), "wrong passcode shows an error");
  ok(await page.$eval("#lockInput", e => e.type === "password" && e.value === ""), "after a wrong try the field is cleared and hidden again");
  await page.type("#lockInput", "preview");
  await page.click(".lock-btn");
  await page.waitForFunction(() => state.loaded && state.links.length > 0);
  ok(await page.evaluate(() => localStorage.getItem("makutaPasscode") === "preview"), "right passcode opens the app and is remembered on this device");

  // Layout: no sideways scroll on a phone, and screenshots for a visual check
  for (const [w, name] of [[1300, "desktop"], [390, "phone"]]) {
    await page.setViewport({ width: w, height: 900 });
    for (const v of ["submit", "links", "tasks"]) {
      await page.evaluate(v => showView(v), v);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(over <= 0, `${name} ${v}: no horizontal page scroll (${over}px)`);
      await page.screenshot({ path: `${shots}/${name}-${v}.png`, fullPage: v !== "tasks" });
    }
  }
  await page.setViewport({ width: 1300, height: 900 });
  await page.evaluate(() => { showView("tasks"); document.documentElement.dataset.theme = "dark"; openTaskForm(); });
  await page.type("#tfTitle", "EVENT ORG DECEMBER KRR");
  await page.select("#tfType", "Event Attribute");
  await page.screenshot({ path: `${shots}/dark-form.png` });

  ok(errors.length === 0, "no JavaScript errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
