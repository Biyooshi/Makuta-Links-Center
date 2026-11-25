// End-to-end test of local-preview/preview.html in headless Chrome.
// Rebuilds preview.html from apps-script/ first, then tests the server logic and every button.
// Usage (in this folder): npm install (once), then npm test
// Screenshots for a visual check are saved in tests/screenshots/.
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");
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
  if (!chrome) throw new Error("Chrome not found. Set CHROME_PATH to the Chrome program.");
  // On GitHub Actions (Linux) Chrome needs --no-sandbox
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: process.env.CI ? ["--no-sandbox"] : [] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  page.on("dialog", d => d.accept());
  await page.setViewport({ width: 1300, height: 900 });
  await page.goto(pathToFileURL(file).href);
  // Logs in through the login screen (preview accounts: password = username + "demo", owner "owner" / "owner")
  const loginAs = async (username, password = username + "demo") => {
    await page.waitForSelector("#lockModal.show");
    await page.$eval("#lockUser", e => e.value = "");
    await page.type("#lockUser", username);
    await page.type("#lockInput", password);
    await page.click("#lockBtn");
    await page.waitForFunction(() => state.loaded);
  };
  await loginAs("owner", "owner");

  /* ---------- 1. Server logic (Code.gs) ---------- */
  console.log("Server logic");
  const r = await page.evaluate(() => {
    const out = {};
    const tryErr = fn => { try { fn(); return ""; } catch (e) { return e.message; } };
    ["Links", "Tasks", "Activity"].forEach(n => { mockSheet(n).data = []; mockSheet(n).save(); });
    GAS.actAs("owner");
    // Drafting Brief, Design and Motion need a link; these flow tests always hand one on (the link rules are tested below)
    const realMove = GAS.moveTask;
    GAS.moveTask = (id, action, opts) => realMove(id, action, action === "advance" ? Object.assign({ link: "https://example.com/work" }, opts) : opts);
    const cfg = GAS.getInitialData().taskConfig;
    // Every project x content type x channel runs from brief to done
    out.flows = [];
    Object.keys(cfg.projects).forEach(p => (cfg.projects[p].types || cfg.contentTypes.filter(t => t !== cfg.eventType && t !== cfg.collateralType)).forEach(type =>
      ["ORG", "ADS"].filter(c => !(cfg.projects[p].orgOnly && c === "ADS") && !(cfg.projects[p].adsOnly && c === "ORG")).forEach(ch => {
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
      collateralNoItem: tryErr(() => GAS.addTask({ title: "FLYER KRR", project: "KRR", type: "Collateral" })),
      collateralBadItem: tryErr(() => GAS.addTask({ title: "MUG KRR", project: "KRR", type: "Collateral", item: "Mug" })),
    };
    // Collateral: any project (VTB does not list it), no ORG / ADS, Static steps, done once the client approves
    let c = GAS.addTask({ title: "BILLBOARD ORG VTB", project: "VTB", type: "Collateral", item: "Billboard" });
    const cVisited = [c.stage];
    for (let i = 0; i < 30 && c.stage !== "done"; i++) { c = GAS.moveTask(c.id, "advance", { from: c.stage }); cVisited.push(c.stage); }
    const cRow = mockSheet("Tasks").data.find(row => row[0] === c.id);
    out.collateral = { channel: c.channel, item: c.item, visited: cVisited.join(">"), step: cRow[11], itemCol: cRow[19] };
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
    // Monthly Brief: linked tasks move together at Drafting Brief (per channel), QC Brief and Shooting
    const b = GAS.addTasks([
      { title: "BRIEF ORG DECEMBER VTB", project: "VTB", type: "Static" },
      { title: "VIDEO CTC ORG DECEMBER VTB", project: "VTB", type: "Video (Shooting)" },
      { title: "BRIEF ADS NOVEMBER VTB", project: "VTB", type: "Static" },
      { title: "VIDEO CTC ADS NOVEMBER VTB", project: "VTB", type: "Video (Shooting)" }], "2026-11");
    const [os, ov, as, av] = b.map(x => x.id);
    const st = () => { const all = GAS.getTasks(); return [os, ov, as, av].map(id => all.find(x => x.id === id).stage).join(","); };
    out.batchMonths = b.map(x => x.workMonth + ">" + x.forMonth).join(",");
    let m = GAS.moveTask(os, "advance", { from: "brief" });
    out.briefOrg = st(); out.briefLinked = m.linked.length;
    GAS.moveTask(av, "advance");
    out.briefAds = st();
    m = GAS.moveTask(ov, "revise", { channels: ["ADS"], note: "fix ads" });
    out.qcSplit = st(); out.qcLinked = m.linked.length;
    out.qcNone = tryErr(() => GAS.moveTask(os, "revise", { channels: ["ADS"] }));
    GAS.moveTask(as, "undo");
    out.qcUndo = st();
    GAS.moveTask(os, "advance");
    out.qcAll = st();
    GAS.moveTask(av, "advance");
    out.shoot = st();
    GAS.moveTask(os, "advance");
    out.designAlone = st();
    out.single = GAS.addTask({ title: "BRIEF ORG DEC GTR", project: "GTR", type: "Static" }).workMonth;
    // Tasks made one by one before Monthly Brief are upgraded once: working month from the title, standard title
    const old = [["BRIEF ORG DES KRR", "KRR", "Static"], ["VIDEO ORG DES GTR", "GTR", "Video (Non-Shooting)"], ["VIDEO CTC ADS Nov KRR", "KRR", "Video (Shooting)"],
      ["EVENT ORG KRR Countdown", "KRR", "Event Attribute"], ["KRR moodboard ORG", "KRR", "Static"], ["BRIEF ORG JAN VTB", "VTB", "Static"], ["BRIEF ORG NOV MAKUTA", "Makuta", "Static"]]
      .map(([title, project, type]) => GAS.addTask({ title, project, type, deadline: "2026-12-20" }).id);
    const oldRow = id => mockSheet("Tasks").data.find(row => row[0] === id);
    old.forEach((id, i) => oldRow(id)[1] = i === 5 ? "2026-12-10T03:00:00.000Z" : "2026-11-12T03:00:00.000Z");
    mockSheet("Tasks").save();
    const upgraded = () => old.map(id => { const t = GAS.getTasks().find(x => x.id === id); return [t.title, t.workMonth, t.forMonth].join("|"); });
    delete mockProps.UPGRADED_MONTHLY_BRIEF;
    GAS.getInitialData();
    out.upgraded = upgraded();
    out.upgradeFlag = mockProps.UPGRADED_MONTHLY_BRIEF;
    const later = GAS.addTask({ title: "BRIEF ORG DES GTR", project: "GTR", type: "Static" });
    GAS.getInitialData();
    out.upgradeOnce = GAS.getTasks().find(x => x.id === later.id).title;
    GAS.moveTask = realMove;
    // Brief and result links: required at Drafting Brief / Design / Motion, one brief per Monthly Brief channel,
    // the last link filled in again after a revision, every link kept in History
    const lb = GAS.addTasks([
      { title: "BRIEF ORG JANUARY GTR", project: "GTR", type: "Static" },
      { title: "VIDEO CTC ORG JANUARY GTR", project: "GTR", type: "Video (Non-Shooting)" }], "2026-12");
    out.noBrief = tryErr(() => GAS.moveTask(lb[0].id, "advance"));
    out.badBrief = tryErr(() => GAS.moveTask(lb[0].id, "advance", { link: "docs" }));
    let lm = GAS.moveTask(lb[0].id, "advance", { link: "https://docs.google.com/document/d/brief-gtr" });
    out.briefShared = [lm].concat(lm.linked).map(x => x.briefLink + ">" + x.stage).join();
    out.briefHistory = lm.history.slice(-1)[0].link;
    GAS.moveTask(lb[0].id, "advance");
    out.noResult = tryErr(() => GAS.moveTask(lb[0].id, "advance"));
    lm = GAS.moveTask(lb[0].id, "advance", { link: "https://drive.google.com/r1" });
    out.result = lm.resultLink + ">" + lm.stage;
    GAS.moveTask(lb[0].id, "revise", { to: "design", note: "fix" });
    lm = GAS.moveTask(lb[0].id, "advance");
    out.resultReuse = lm.resultLink + ">" + lm.stage;
    GAS.moveTask(lb[0].id, "revise", { to: "design", note: "again" });
    lm = GAS.moveTask(lb[0].id, "advance", { link: "https://drive.google.com/r2" });
    out.resultHistory = lm.history.filter(e => e.link && e.from === "design").map(e => e.link).join();
    out.noLinkElsewhere = lm.history.filter(e => e.link && !["brief", "design", "motion"].includes(e.from)).length;
    const lrow = mockSheet("Tasks").data.find(row => row[0] === lb[0].id);
    out.linkCols = [mockSheet("Tasks").data[0][13], mockSheet("Tasks").data[0][20], lrow[13], lrow[20]].join();
    out.badTaskLink = tryErr(() => GAS.addTask({ title: "BRIEF ORG DEC GTR", project: "GTR", type: "Static", resultLink: "drive" }));
    // Resources: no status, deadline or calendar reminder any more
    const l = GAS.addLink({ title: "=SUM(1)", url: "https://a.com/x", category: "Google Docs", project: "KRR", status: "Done", deadline: "2026-12-20", versions: [{ label: "P2", url: "https://a.com/y" }] });
    out.noDeadline = l.deadline === "" && l.status === "" && mockSheet("Links").data[1][12] === "";
    out.formulaSafe = GAS.getLinks()[0].title;
    out.ctcNoSource = tryErr(() => GAS.addLink({ title: "v", url: "https://a.com", category: "CTC-Video" }));
    out.badUrl = tryErr(() => GAS.addLink({ title: "v", url: "a.com", category: "Other" }));
    GAS.updateLink(l.id, Object.assign({}, l, { status: "Done" }));
    GAS.setPinned(l.id, true);
    out.pinned = GAS.getLinks()[0].pinned;
    GAS.deleteLink(l.id);
    out.linksLeft = GAS.getLinks().length;
    out.missingLink = tryErr(() => GAS.deleteLink(l.id));
    out.protect = { Links: mockSheet("Links").protections.slice(), Tasks: mockSheet("Tasks").protections.slice() };
    return out;
  });
  const flow = (p, type, ch) => r.flows.find(f => f.p === p && f.type === type && f.ch === ch);
  ok(r.flows.length === 31, `31 project/type/channel combinations created (got ${r.flows.length})`);
  ok(r.flows.every(f => f.visited.endsWith(">done")), "every combination reaches Done by pressing the main button");
  ok(/brief link first/.test(r.noBrief) && /brief link first/.test(r.badBrief), "Submit Brief for QC needs a valid brief link -> " + r.noBrief);
  ok(r.briefShared === "https://docs.google.com/document/d/brief-gtr>qcBrief,https://docs.google.com/document/d/brief-gtr>qcBrief" && r.briefHistory === "https://docs.google.com/document/d/brief-gtr",
    "one brief link for the channel's Static + Video, kept in History -> " + r.briefShared);
  ok(/result link first/.test(r.noResult) && r.result === "https://drive.google.com/r1>qcContent", "Design Done needs the result link -> " + r.result);
  ok(r.resultReuse === "https://drive.google.com/r1>qcContent", "after a revision the last result link is used again when none is pasted");
  ok(r.resultHistory === "https://drive.google.com/r1,https://drive.google.com/r1,https://drive.google.com/r2" && r.noLinkElsewhere === 0, "every result handed on stays in History -> " + r.resultHistory);
  ok(r.linkCols === "Brief Link,Result Link,https://docs.google.com/document/d/brief-gtr,https://drive.google.com/r2", "sheet: Brief Link and Result Link columns -> " + r.linkCols);
  ok(/result link must start/.test(r.badTaskLink), "a task's result link must be a web address");
  ok(r.noDeadline, "resources are saved without status, deadline or calendar reminder");
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
  ok(r.collateral.channel === "" && r.collateral.item === "Billboard" && r.collateral.itemCol === "Billboard", "Collateral: VTB allowed, no channel (even with ORG in the title), item saved in its column");
  ok(r.collateral.visited === "brief>qcBrief>design>qcContent>toClient>qcClient>done" && r.collateral.step === "Done: Approved by Client",
    "Collateral follows the Static steps and is done when the client approves -> " + r.collateral.visited);
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
  ok(r.batchMonths === "2026-11>2026-12,2026-11>2026-12,2026-11>2026-11,2026-11>2026-11", "Monthly Brief written in Nov: ORG for Dec, ADS for Nov");
  ok(r.briefOrg === "qcBrief,qcBrief,brief,brief" && r.briefLinked === 1, "Submit Brief moves the channel's Static + Video together (other channel stays)");
  ok(r.briefAds === "qcBrief,qcBrief,qcBrief,qcBrief", "ADS brief submitted on its own");
  ok(r.qcSplit === "design,shoot,brief,brief" && r.qcLinked === 3, "one QC Brief for ORG + ADS: ADS sent back, ORG approved -> " + r.qcSplit);
  ok(!!r.qcNone, "QC Brief revision must name a channel that is waiting");
  ok(r.qcUndo === "qcBrief,qcBrief,qcBrief,qcBrief", "Undo takes back the shared QC decision for all 4 tasks -> " + r.qcUndo);
  ok(r.qcAll === "design,shoot,design,shoot", "Approve at QC Brief approves ORG + ADS");
  ok(r.shoot === "design,video,design,video", "one Shooting Done moves the ORG and ADS videos");
  ok(r.designAlone === "qcContent,video,design,video", "after the shared steps each task moves on its own");
  ok(r.single === "", "a single task is not linked to anything");
  ok(r.upgraded.join(" ; ") === [
    "BRIEF ORG DECEMBER KRR|2026-11|2026-12", "VIDEO CTC ORG DECEMBER GTR|2026-11|2026-12", "VIDEO CTC ADS NOVEMBER KRR|2026-11|2026-11",
    "EVENT ORG KRR Countdown||", "KRR moodboard ORG||", "BRIEF ORG JANUARY VTB|2026-12|2027-01", "BRIEF ORG NOVEMBER MAKUTA|2026-10|2026-11"].join(" ; "),
    "old tasks upgraded to Monthly Brief (Event and free-form titles untouched) -> " + r.upgraded.join(" ; "));
  ok(/\(\d+ tasks\)$/.test(r.upgradeFlag), "upgrade records how many tasks changed -> " + r.upgradeFlag);
  ok(r.upgradeOnce === "BRIEF ORG DES GTR", "upgrade runs only once");
  ok(r.formulaSafe === "=SUM(1)", "text starting with = is stored as text, not a formula");
  ok(!!r.ctcNoSource && !!r.badUrl, "link validation");
  ok(r.pinned === true && r.linksLeft === 0, "link update / pin / delete");
  const prot = n => r.protect[n].map(d => d.replace(/^Makuta: | \(changed by the website only\)$/g, "")).join(",");
  ok(prot("Links") === "column titles,ID,Reminder IDs", "Links sheet: edit warnings on titles, ID, Reminder IDs (added once) -> " + prot("Links"));
  ok(prot("Tasks") === "column titles,ID,Stage,Current Step,Revisions,History,Checklist", "Tasks sheet: edit warnings on titles, ID, Stage, Current Step, Revisions, History, Checklist (added once) -> " + prot("Tasks"));
  // The flow tests above pass a link on every advance; the page must use the real function again
  ok(await page.evaluate(() => !/example\.com/.test(String(GAS.moveTask))), "server tests leave moveTask as it was");

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
  ok((await typeOptions()).join() === "Static,Video (Non-Shooting),Video (Shooting),Collateral", "Makuta: all types except Event Attribute");
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
  ok((await typeOptions()).join() === "Static,Video (Shooting),Event Attribute,Collateral", "KRR types: Static, Video (Shooting), Event Attribute, Collateral");
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

  // Collateral from the form: pick project + item, the title is written, no ORG / ADS needed
  await openForm();
  await page.select("#tfProject", "GTR");
  await page.select("#tfType", "Collateral");
  ok(await page.$eval("#tfItemField", e => !e.hidden) && await page.$eval("#tfVideographerField", e => e.hidden), "Collateral: Item field shown");
  await page.click("#taskSaveBtn");
  ok(await page.$eval("#taskFormErr", e => !e.hidden && /item/i.test(e.textContent)), "Collateral: saving without an item is blocked");
  await page.select("#tfItem", "Roll-up Banner");
  ok(await page.$eval("#tfTitle", e => e.value) === "ROLL-UP BANNER GTR", "Collateral: title written from item + project");
  ok(await page.$eval("#tfSteps", e => e.textContent.includes("QC Client") && !e.textContent.includes("Scheduling Post")), "Collateral: timeline ends at QC Client");
  await page.click("#taskSaveBtn");
  await page.waitForFunction(() => !document.querySelector("#taskModal.show"));
  ok(await page.evaluate(() => { const t = state.tasks.find(x => x.title === "ROLL-UP BANNER GTR"); return t && t.item === "Roll-up Banner" && t.channel === ""; }), "Collateral task created from the form");
  ok(await page.evaluate(() => [...document.querySelectorAll(".task")].some(a => a.querySelector("strong").textContent === "ROLL-UP BANNER GTR" && /Collateral: Roll-up Banner/.test(a.textContent) && /Approved by Client/.test(a.textContent))),
    "Collateral card shows its item and ends at Approved by Client");

  // Four filters (Show, Project, Month, search); ORG / ADS, Collateral and Event Attribute are found by typing them
  ok(await page.$$eval("#viewTasks .filters select", s => s.map(x => x.id).join()) === "tStep,tProject,tMonth", "Milestones has three filters plus search");
  ok(await page.$$eval("#tStep optgroup", g => g.map(x => x.label + ":" + x.children.length).join()) === "Tasks:6,At stage:5", "Show: 6 task choices for the owner (no My Tasks) and the 5 stages of Home's table");
  const kindsFor = async q => { await page.$eval("#tSearch", (e, q) => { e.value = q; e.dispatchEvent(new Event("input")); }, q); return page.evaluate(() => [...new Set(getFilteredTasks().map(t => typeKind(t.type) + ":" + (t.channel || "-")))].sort().join()); };
  await page.select("#tStep", "all");
  ok(await kindsFor("collateral") === "collateral:-", "search Collateral: only Collateral tasks");
  ok(await kindsFor("event attribute") === "event:ORG", "search Event Attribute: only Event Attribute tasks");
  ok(!/ORG/.test(await kindsFor("ads")), "search ADS: no ORG tasks");
  await page.evaluate(() => resetTaskFilters());

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
      // Drafting Brief and Design ask for their link first
      if (s === "brief" || s === "design") {
        await page.waitForSelector("#stepLinkModal.show");
        const prefilled = await page.$eval("#stepLinkInput", e => e.value);
        if (s === "brief") {
          ok(prefilled === "" && await page.$eval("#stepLinkLabel", e => /Brief link/.test(e.textContent)), "Submit Brief for QC asks for the brief link");
          await page.click("#stepLinkOk");
          ok(await page.$eval("#stepLinkErr", e => !e.hidden) && await stage() === "brief", "an empty link is refused (the task stays)");
          await page.type("#stepLinkInput", "docs.google.com/document/d/event-brief");
        } else if (revised) {
          ok(prefilled === "https://drive.google.com/drive/folders/event-result", "after the client revision the last result link is filled in");
          await page.$eval("#stepLinkInput", e => e.value = "");
          await page.type("#stepLinkInput", "https://drive.google.com/drive/folders/event-result-v2");
        } else {
          await page.type("#stepLinkInput", "https://drive.google.com/drive/folders/event-result");
        }
        await page.click("#stepLinkOk");
        await page.waitForFunction(() => !document.querySelector("#stepLinkModal.show"));
      }
      await page.waitForFunction((id, s) => state.tasks.find(t => t.id === id).stage !== s, {}, evId, s);
    }
    seen.push(await stage());
  }
  ok(seen.join(">") === "brief>qcBrief>design>qcContent>toClient>qcClient>design>qcContent>toClient>qcClient>post>done", "buttons walk the event task to Done: " + seen.join(">"));
  const evLinks = await page.evaluate(id => {
    const t = state.tasks.find(x => x.id === id), a = document.querySelector(`[data-id="${id}"]`).closest("article");
    return { brief: t.briefLink, result: t.resultLink, timeline: [...a.querySelectorAll("a.ms-link")].map(x => x.textContent.replace(/\s+/g, " ").trim() + "=" + x.getAttribute("href")).join(" | "),
      tags: [...a.querySelectorAll(".task-title .tag-link")].map(x => x.textContent.trim()).join(), history: [...a.querySelectorAll(".history a")].length };
  }, evId);
  ok(evLinks.brief === "https://docs.google.com/document/d/event-brief" && evLinks.result === "https://drive.google.com/drive/folders/event-result-v2", "the task keeps its brief and its latest result");
  ok(evLinks.timeline === "Drafting Brief ↗=https://docs.google.com/document/d/event-brief | Design ↗=https://drive.google.com/drive/folders/event-result-v2",
    "timeline: Drafting Brief opens the brief, Design the result -> " + evLinks.timeline);
  ok(evLinks.tags === "📄 Brief ↗,🎨 Result ↗" && evLinks.history === 3, "a single task shows both links; History links each one handed on");
  ok(await page.evaluate(id => document.querySelector(`[data-id="${id}"]`).closest("article").querySelectorAll(".ms-red").length === 0, evId), "timeline green again after the client approved");
  // Finished: still shown in the default view, greyed out at the bottom of its project, no Edit, last step green
  await page.evaluate(() => resetTaskFilters());
  ok(await page.$eval("#tStep", s => s.value) === "current", "default Step filter: active + recently done");
  const doneCard = await page.evaluate(id => {
    const a = document.querySelector(`[data-id="${id}"]`)?.closest("article");
    if (!a) return null;
    const cards = [...a.closest("section.group").querySelectorAll("article.task")];
    return { dim: a.classList.contains("task-done"), edit: !!a.querySelector('[data-tact="edit"]'), undo: !!a.querySelector('[data-tact="undo"]'),
      finish: !!a.querySelector(".ms-finish.ms-done"), badge: !!a.querySelector(".tag-finished"), last: cards.slice(cards.indexOf(a)).every(c => c.classList.contains("task-done")),
      checks: [...a.querySelectorAll(".checklist input")].every(i => i.disabled) };
  }, evId);
  ok(!!doneCard && doneCard.dim && doneCard.finish && doneCard.badge, "finished task stays visible, greyed out, last step green, Completed badge");
  ok(!!doneCard && !doneCard.edit && doneCard.undo && doneCard.checks, "finished task: no Edit, checklist locked, Undo still there");
  ok(!!doneCard && doneCard.last, "finished task sits below the unfinished ones");
  await page.select("#tStep", "active");
  ok(await page.evaluate(id => !document.querySelector(`[data-id="${id}"]`), evId), "Active Tasks filter hides finished tasks");
  await page.select("#tStep", "all");
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

  // Monthly Brief: written in December: ORG January + ADS December, Static + Video (Shooting) for ORG and ADS, titles written automatically
  const before = await page.evaluate(() => state.tasks.length);
  await page.evaluate(() => openBatchForm());
  await page.waitForSelector("#batchModal.show");
  await page.select("#bfProject", "KRR");
  await page.$eval("#bfMonth", e => { e.value = "2026-12"; e.dispatchEvent(new Event("input")); });
  const batchTitles = () => page.$$eval("#bfRows [data-btitle]", a => a.map(i => i.value));
  ok((await batchTitles()).join() === "BRIEF ORG JANUARY KRR,VIDEO CTC ORG JANUARY KRR,BRIEF ADS DECEMBER KRR,VIDEO CTC ADS DECEMBER KRR", "Monthly Brief KRR (written in Dec): ORG for January, ADS for December, no Event Attribute");
  ok(await page.$$eval("#bfRows .batch-for", a => a.map(e => e.textContent).join()) === "for JANUARY 2027,for DECEMBER 2026", "Monthly Brief: each channel shows the month it is for (year rolls over)");
  ok(await page.$eval("#bfVideographerField", e => e.hidden), "Monthly Brief KRR: videographer hidden (auto Anno)");
  await page.$eval("#bfDeadline", e => { e.value = "2026-11-28"; e.dispatchEvent(new Event("input")); });
  ok(await page.$$eval("#bfRows [data-bdeadline]", a => a.every(i => i.value === "2026-11-28")), "Monthly Brief: shared deadline fills every task");
  await page.type('#bfRows [data-blink="ORG"]', "docs.google.com/spreadsheets/d/brief-org");
  await page.click("#batchSaveBtn");
  await page.waitForFunction(() => !document.querySelector("#batchModal.show"));
  const made = await page.evaluate(n => state.tasks.slice(n), before);
  ok(made.length === 4 && made.every(t => t.project === "KRR" && t.stage === "brief" && t.deadline === "2026-11-28"), "Monthly Brief: 4 KRR tasks created at Drafting Brief");
  ok(made.filter(t => t.channel === "ORG").every(t => t.briefLink === "https://docs.google.com/spreadsheets/d/brief-org") && made.filter(t => t.channel === "ADS").every(t => !t.briefLink), "Monthly Brief: brief link goes to its channel only");
  ok(made.filter(t => /^Video/.test(t.type)).every(t => t.videographer === "Anno"), "Monthly Brief: KRR videos get VG Anno");

  // Month filter: by the month the content is for (ORG January, ADS December)
  ok(await page.$$eval("#tMonth option", a => a.some(o => o.value === "2027-01" && o.textContent === "January 2027")), "Month filter lists January 2027");
  await page.select("#tStep", "all");
  await page.select("#tMonth", "2027-01");
  ok(await page.evaluate(() => { const l = getFilteredTasks(); return l.length > 0 && l.every(t => taskMonth(t) === "2027-01") && l.some(t => t.title === "BRIEF ORG JANUARY KRR") && !l.some(t => t.title === "BRIEF ADS DECEMBER KRR"); }), "Month filter shows only January 2027 content");
  await page.evaluate(() => resetTaskFilters());
  ok(await page.$eval("#tMonth", s => s.value === ""), "Reset Filters clears the month");
  // Newest on top: the project just given a Monthly Brief comes first, with those tasks at the top
  ok(await page.$eval("#taskResults .group", g => /KRR/.test(g.querySelector(".group-head h3").textContent) && /JANUARY KRR/.test(g.querySelector(".task-title strong").textContent)),
    "Newest tasks on top: KRR first, its new January brief at the top");
  // Shown per brief: ORG JANUARY section with Static on top and the video below, shared buttons
  await page.select("#tStep", "all");
  const sections = await page.$$eval(".brief-section:not(.solo-section)", a => a.map(s => s.querySelector(".brief-head").textContent.replace(/\s+/g, " ").trim() + " | " + [...s.querySelectorAll("article strong")].map(e => e.textContent).join(" / ")));
  ok(sections.some(s => /^ORG JANUARY 2027 brief written in December 2026 📄 Brief ORG ↗ 0\/2 done \| BRIEF ORG JANUARY KRR \/ VIDEO CTC ORG JANUARY KRR$/.test(s)), "ORG brief section: Static on top, video below -> " + sections.join(" || "));
  ok(sections.some(s => s.startsWith("ADS DECEMBER 2026") && s.endsWith("BRIEF ADS DECEMBER KRR / VIDEO CTC ADS DECEMBER KRR")), "ADS brief section");
  const madeId = (ch, video) => made.find(t => t.channel === ch && /^Video/.test(t.type) === video).id;
  const btnOf = (id, act) => page.evaluateHandle((id, act) => document.querySelector(`[data-tact="${act}"][data-id="${id}"]`), id, act);
  const stages = () => page.evaluate(ids => ids.map(id => state.tasks.find(t => t.id === id).stage).join(","), made.map(t => t.id));
  ok(await (await btnOf(madeId("ORG", false), "advance")).evaluate(b => b.textContent.includes("Static + Video")), "Submit Brief button says it moves Static + Video");
  await (await btnOf(madeId("ORG", false), "advance")).click();
  await page.waitForSelector("#stepLinkModal.show");
  ok(await page.$eval("#stepLinkInput", e => e.value) === "https://docs.google.com/spreadsheets/d/brief-org" && await page.$eval("#stepLinkText", e => e.textContent.includes("one brief for Static + Video")),
    "the brief link from the Monthly Brief is filled in; one brief for Static + Video");
  await page.click("#stepLinkOk");
  await page.waitForFunction(id => state.tasks.find(t => t.id === id).stage === "qcBrief", {}, madeId("ORG", true));
  await (await btnOf(madeId("ADS", true), "advance")).click();
  await page.waitForSelector("#stepLinkModal.show");
  await page.type("#stepLinkInput", "https://docs.google.com/document/d/brief-ads");
  await page.click("#stepLinkOk");
  await page.waitForFunction(id => state.tasks.find(t => t.id === id).stage === "qcBrief", {}, madeId("ADS", false));
  ok(await page.evaluate(ids => ids.map(id => state.tasks.find(t => t.id === id).briefLink).join(), [madeId("ADS", false), madeId("ADS", true)]) === "https://docs.google.com/document/d/brief-ads,https://docs.google.com/document/d/brief-ads",
    "the ADS brief link pasted on the video goes to the ADS static too");
  ok(await (await btnOf(madeId("ORG", false), "advance")).evaluate(b => b.textContent.includes("ORG + ADS")), "QC Brief Approve says ORG + ADS");
  await (await btnOf(madeId("ORG", false), "revise")).click();
  await page.waitForSelector("#reviseModal.show");
  ok(await page.$eval("#reviseToField", e => e.hidden) && await page.$$eval("#reviseChannels input", a => a.map(i => i.value + (i.checked ? "*" : "")).join()) === "ORG*,ADS", "QC Brief revision popup: pick ORG / ADS (clicked one ticked)");
  await page.type("#reviseNote", "Hook ORG kurang kuat");
  await page.click("#reviseOk");
  await page.waitForFunction(id => state.tasks.find(t => t.id === id).stage === "brief", {}, madeId("ORG", false));
  ok(await stages() === "brief,brief,design,shoot", "ORG back to brief, ADS approved -> " + await stages());
  await page.waitForFunction(() => !document.querySelector("#reviseModal.show"));

  // Opening it again marks the ones that already exist (unticked)
  await page.evaluate(() => openBatchForm());
  await page.select("#bfProject", "KRR");
  await page.$eval("#bfMonth", e => { e.value = "2026-12"; e.dispatchEvent(new Event("input")); });
  ok(await page.$$eval("#bfRows .batch-row", a => a.every(r => r.classList.contains("is-dup") && !r.querySelector("[data-bcheck]").checked)), "Monthly Brief: existing tasks marked and unticked");
  await page.click("#batchSaveBtn");
  ok(await page.$eval("#batchFormErr", e => !e.hidden && /at least one/i.test(e.textContent)), "Monthly Brief: nothing ticked is blocked");
  // Makuta: organic only, 3 video/static types, videographer required; Non-Shooting gets its own title
  await page.select("#bfProject", "Makuta");
  ok((await batchTitles()).join() === "BRIEF ORG JANUARY MAKUTA,VIDEO CTC NON-SHOOTING ORG JANUARY MAKUTA,VIDEO CTC ORG JANUARY MAKUTA", "Monthly Brief Makuta: ORG only, distinct titles");
  ok(await page.$eval("#bfVideographerField", e => !e.hidden), "Monthly Brief Makuta: videographer required");
  await page.click("#batchSaveBtn");
  ok(await page.$eval("#batchFormErr", e => !e.hidden && /videographer/i.test(e.textContent)), "Monthly Brief Makuta: saving without a videographer is blocked");
  await page.click("#batchModal .btn-soft");
  ok(await page.evaluate(() => { try { GAS.addTasks([{ title: "BRIEF ORG DEC VTB", project: "VTB", type: "Static" }, { title: "BRIEF DEC VTB", project: "VTB", type: "Static" }]); return false; } catch (e) { return GAS.getTasks().every(t => t.title !== "BRIEF ORG DEC VTB"); } }), "server: one bad task in a batch saves none of them");

  // QC opens the brief (QC Brief, QC CTC) or the result (QC Content) right next to its buttons
  await page.select("#tStep", "qc");
  const qcLinks = await page.evaluate(() => [...document.querySelectorAll("#taskResults article.task")].map(a =>
    state.tasks.find(x => x.id === a.dataset.task).stage + ":" + ((a.querySelector(".link-open") || {}).textContent || "").trim()));
  ok(qcLinks.length > 0 && qcLinks.every(s => /^(qcBrief|qcCut):📄 Open brief|^qcContent:🎨 Open result/.test(s)), "QC steps show the brief or the result next to the buttons -> " + qcLinks.join(", "));
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
  ok(await page.$$eval("#results tbody tr", a => a.length) === 8, "Resources table shows 8 resources");
  ok(await page.$$eval("#results thead th", a => a.map(th => th.textContent.trim()).join()) === "Pin,Title & link,Category,Project,Actions", "Resources columns: no status or deadline");
  ok(await page.evaluate(() => !document.getElementById("status") && !document.getElementById("deadline") && !document.getElementById("fStatus")), "the resource form and filters have no status or deadline");
  // Brief & result links tab: every task with a link, opening the task from its title
  await page.click('[data-ltab="tasks"]');
  const tl = await page.evaluate(() => ({ rows: document.querySelectorAll("#results tbody tr").length, want: state.tasks.filter(t => t.briefLink || t.resultLink).length,
    hidden: getComputedStyle(document.querySelector("#viewLinks .segmented")).display === "none" && getComputedStyle(document.getElementById("fCategory").closest(".field")).display === "none",
    heads: [...document.querySelectorAll("#results thead th")].map(th => th.textContent).join() }));
  ok(tl.rows > 0 && tl.rows === tl.want && tl.heads === "Task,Project,Brief,Result", `Brief & result links tab lists every task with a link (${tl.rows})`);
  ok(tl.hidden, "that tab hides the resource-only filters and view switch");
  await page.$eval("#search", e => { e.value = "event-brief"; e.dispatchEvent(new Event("input")); });
  ok(await page.$$eval("#results tbody tr", a => a.length) === 0, "search finds tasks by their link (the event task was deleted)");
  await page.evaluate(() => resetFilters());
  const tlFirst = await page.$eval("#results .link-task", b => b.dataset.open);
  await page.click("#results .link-task");
  ok(await page.evaluate(id => state.page === "tasks" && !!document.querySelector(`#taskResults [data-task="${id}"]`), tlFirst), "a task's title opens it in Milestones");
  await page.evaluate(() => { showView("links"); showLinkTab("resources"); });
  ok(await page.$$eval("#results thead th", a => a.every(th => th.textContent.trim())), "every table column has a name (incl. Pin)");
  // Sample data follows the app rules: known projects only, Reference -> REFERENCE
  const known = await page.evaluate(() => Object.keys(state.cfg.projects).concat(REFERENCE_PROJECT));
  ok(await page.evaluate(k => state.links.every(l => !l.project || k.includes(l.project)), known), "sample links only use real projects");
  ok(await page.evaluate(() => state.links.filter(l => l.category === "Reference").every(l => l.project === "REFERENCE")), "sample Reference links are in REFERENCE");
  // Next to the sidebar a laptop gets the real table; a tablet or phone gets one card per link
  await page.setViewport({ width: 1300, height: 900 });
  ok(await page.$eval("#results thead", e => getComputedStyle(e).display !== "none"), "laptop (1300px): links show as a table, not cards");
  await page.setViewport({ width: 820, height: 900 });
  ok(await page.$eval("#results thead", e => getComputedStyle(e).display === "none"), "tablet (820px): links show as cards");
  // Table fits without sideways scrolling at every width
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

  /* ---------- 3. Logins and who may do what ---------- */
  console.log("Logins & permissions");
  // Server: tickets, wrong passwords, ending sessions
  const auth = await page.evaluate(() => {
    const err = fn => { try { fn(); return ""; } catch (e) { return e.message; } };
    const hex = t => sha256Bytes(t).map(b => ("0" + (b & 255).toString(16)).slice(-2)).join("");
    const out = {};
    const obi = GAS.login(" Obi ", "obidemo", "test").ticket;
    out.wrong = err(() => GAS.login("obi", "salah"));
    out.unknownUser = err(() => GAS.login("budi", "budidemo"));
    out.ownerWithTeamPassword = err(() => GAS.login("owner", "ownerdemo"));
    out.teamWithOwnerPassword = err(() => GAS.login("obi", "owner"));
    out.otherPassword = err(() => GAS.login("obi", "puputdemo"));
    out.suffixOnly = err(() => GAS.login("obi", "demo"));
    out.faza = GAS.api(GAS.login("faza", "fazademo", "test").ticket, "getInitialData", []).user;
    out.badTicket = err(() => GAS.api("nope", "getLinks", []));
    out.noTicket = err(() => GAS.api("", "deleteLink", ["x"]));
    out.unknownFn = err(() => GAS.api(obi, "getSheet_", []));
    out.ok = Array.isArray(GAS.api(obi, "getLinks", []));
    out.notOwnerAdmin = err(() => GAS.api(obi, "getAdminData", []));
    out.notOwnerViewAs = err(() => GAS.api(obi, "getTasks", [], "alfid"));
    // Only the ticket's hash is stored
    out.hashedOnly = !!mockProps["SESSION_" + hex(obi)] && !JSON.stringify(mockProps).includes(obi);
    // The owner's username is never sent to the page
    const owner = GAS.login("owner", "owner", "test").ticket;
    out.ownerUser = GAS.api(owner, "getInitialData", []).user;
    out.viewAsWrite = err(() => GAS.api(owner, "addLink", [{ title: "x", url: "https://x.com", category: "Other" }], "obi"));
    out.viewAsRead = GAS.api(owner, "getInitialData", [], "alfid").user;
    // 10 wrong passwords lock that account only
    for (let i = 0; i < 10; i++) err(() => GAS.login("riska", "salah"));
    out.lockedRiska = err(() => GAS.login("riska", "riskademo"));
    out.hendraStillOk = !!GAS.login("hendra", "hendrademo").ticket;
    delete mockCache.wrongLogin_riska;
    // A login ends after 30 days, on logout, or when the owner ends it
    const old = GAS.login("puput", "puputdemo").ticket;
    const k = "SESSION_" + hex(old), sess = JSON.parse(mockProps[k]);
    sess.start -= 31 * 864e5;
    mockProps[k] = JSON.stringify(sess);
    out.expired = err(() => GAS.api(old, "getLinks", []));
    out.expiredRemoved = !mockProps[k];
    GAS.api(obi, "logout", []);
    out.afterLogout = err(() => GAS.api(obi, "getLinks", []));
    const wawan = GAS.login("wawan", "wawandemo").ticket;
    const admin = GAS.api(owner, "getAdminData", []);
    out.sessionsListed = admin.sessions.some(x => x.name === "Wawan") && admin.sessions.some(x => x.self && x.name === "Owner");
    out.ended = GAS.api(owner, "endSessions", ["all"]);
    out.wawanEnded = err(() => GAS.api(wawan, "getLinks", []));
    out.ownerKept = Array.isArray(GAS.api(owner, "getLinks", []));
    out.activity = GAS.api(owner, "getAdminData", []).activity.map(e => e.who + ":" + e.action);
    out.failedUnknown = out.activity.includes("(unknown username):Failed login");
    GAS.actAs("owner");
    return out;
  });
  ok(/^LOCKED: Wrong username or password/.test(auth.wrong) && /^LOCKED: Wrong/.test(auth.unknownUser), "server: wrong password / unknown username refused");
  ok(/^LOCKED: Wrong/.test(auth.ownerWithTeamPassword) && /^LOCKED: Wrong/.test(auth.teamWithOwnerPassword), "owner and team passwords are separate");
  ok(/^LOCKED: Wrong/.test(auth.otherPassword) && /^LOCKED: Wrong/.test(auth.suffixOnly), "each account has its own password (username + the secret ending)");
  ok(auth.faza.name === "Kak Faza" && auth.faza.roleName === "Assistant Manager" && auth.faza.all && auth.faza.projects.length === 7, "Kak Faza logs in as Assistant Manager and sees every project");
  ok(/^LOCKED/.test(auth.badTicket) && /^LOCKED/.test(auth.noTicket), "server: calls without a valid login are refused");
  ok(auth.unknownFn === "Unknown action." && auth.ok, "server: only listed actions; a valid login works (username trimmed, any case)");
  ok(/owner/i.test(auth.notOwnerAdmin) && /owner/i.test(auth.notOwnerViewAs), "Admin data and View as are owner only");
  ok(auth.hashedOnly, "only the hash of a login ticket is stored");
  ok(auth.ownerUser.name === "Owner" && auth.ownerUser.role === "owner" && !("key" in auth.ownerUser) && !("username" in auth.ownerUser), "the owner's username is never sent to the page");
  ok(/read-only/.test(auth.viewAsWrite) && auth.viewAsRead.name === "Alfid" && auth.viewAsRead.readOnly, "View as reads as that account and refuses changes");
  ok(/Too many wrong passwords/.test(auth.lockedRiska) && auth.hendraStillOk, "10 wrong passwords lock that account only");
  ok(/ended/.test(auth.expired) && auth.expiredRemoved, "a login older than 30 days ends (and is removed)");
  ok(/^LOCKED/.test(auth.afterLogout), "logout ends the login");
  ok(auth.sessionsListed && auth.ended >= 1 && /^LOCKED/.test(auth.wawanEnded) && auth.ownerKept, "owner sees who is logged in and can log out everyone else (but not themself)");
  ok(auth.activity.includes("Wawan:Login") && auth.activity.includes("Bu Riska:Failed login") && auth.failedUnknown && auth.activity.includes("Owner:Ended logins"),
    "Activity log records logins, failed logins (unknown usernames not written down) and ended logins");

  // Server: who may do what, on the sample data. "Log out everyone else" above also ended this page's
  // own login (another ticket than the test's owner), so log in again first.
  await page.evaluate(() => forgetLogin());
  await loginAs("owner", "owner");
  await page.evaluate(() => loadTestData());
  await page.waitForFunction(() => state.loaded && state.tasks.length > 0);
  const perm = await page.evaluate(() => {
    const err = fn => { try { fn(); return ""; } catch (e) { return e.message; } };
    const as = (u, fn) => { GAS.actAs(u); try { return fn(); } finally { GAS.actAs("owner"); } };
    const find = title => { GAS.actAs("owner"); return GAS.getTasks().find(t => t.title === title); };
    const out = {};
    out.alfidProjects = [...new Set(as("alfid", () => GAS.getTasks()).map(t => t.project))].sort().join();
    out.obiProjects = [...new Set(as("obi", () => GAS.getTasks()).map(t => t.project))].sort().join();
    out.alfidCreate = err(() => as("alfid", () => GAS.addTask({ title: "BRIEF ORG DEC KRR", project: "KRR", type: "Static" })));
    out.obiCreateLux = err(() => as("obi", () => GAS.addTask({ title: "BRIEF ORG DEC LUX", project: "LUX", type: "Static" })));
    out.puputCreateLux = as("puput", () => GAS.addTask({ title: "BRIEF ORG DEC LUX", project: "LUX", type: "Static" })).history[0].by;
    out.gmOrg = err(() => as("puput", () => GAS.addTask({ title: "BRIEF ORG DEC GM", project: "GM", type: "Static" })));
    out.gmAds = as("puput", () => GAS.addTask({ title: "BRIEF ADS DEC GM", project: "GM", type: "Static" })).channel;
    // KRR task waiting at Design (Alfid's step)
    const design = find("BRIEF ORG DECEMBER KRR");
    out.designStage = design.stage;
    const result = { link: "https://drive.google.com/drive/folders/krr-design" };
    out.obiPressDesign = err(() => as("obi", () => GAS.moveTask(design.id, "advance", result)));
    out.wawanPressKrr = err(() => as("wawan", () => GAS.moveTask(design.id, "advance", result)));
    const moved = as("alfid", () => GAS.moveTask(design.id, "advance", result));
    out.alfidPressed = moved.stage + ":" + moved.history[moved.history.length - 1].by;
    out.obiUndoAlfid = err(() => as("obi", () => GAS.moveTask(design.id, "undo")));
    out.alfidUndo = as("alfid", () => GAS.moveTask(design.id, "undo")).stage;
    as("alfid", () => GAS.moveTask(design.id, "advance", result));
    out.alfidPressQc = err(() => as("alfid", () => GAS.moveTask(design.id, "advance")));
    out.hendraQc = as("hendra", () => GAS.moveTask(design.id, "advance")).history.slice(-1)[0].by;
    // Send to Client, QC Client and Run Ads are Kak Faza's (and managerial's), no longer the content writer's
    out.obiSends = err(() => as("obi", () => GAS.moveTask(design.id, "advance")));
    out.fazaSends = as("faza", () => GAS.moveTask(design.id, "advance")).stage;
    out.fazaClient = as("faza", () => GAS.moveTask(design.id, "advance")).history.slice(-1)[0].by;
    out.fazaPost = err(() => as("faza", () => GAS.moveTask(design.id, "advance")));
    out.obiPost = as("obi", () => GAS.moveTask(design.id, "advance")).stage;
    as("obi", () => GAS.moveTask(design.id, "undo"));
    out.fazaCreate = err(() => as("faza", () => GAS.addTask({ title: "BRIEF ORG DEC KRR", project: "KRR", type: "Static" })));
    out.fazaEdit = err(() => as("faza", () => GAS.updateTask(design.id, Object.assign({}, design, { notes: "x" }))));
    out.fazaProjects = [...new Set(as("faza", () => GAS.getTasks()).map(t => t.project))].length;
    const adsTask = find("BRIEF ADS NOVEMBER GTR");
    as("faza", () => GAS.moveTask(adsTask.id, "advance"));
    out.adsStage = as("faza", () => GAS.moveTask(adsTask.id, "advance")).stage;
    out.obiAds = err(() => as("obi", () => GAS.moveTask(adsTask.id, "advance")));
    // Edit / delete: the project's writer and managerial only; a task can't be moved out of their projects
    out.alfidEdit = err(() => as("alfid", () => GAS.updateTask(design.id, Object.assign({}, design, { notes: "x" }))));
    out.obiMoveToLux = err(() => as("obi", () => GAS.updateTask(design.id, Object.assign({}, design, { project: "LUX", title: "BRIEF ORG DEC LUX" }))));
    out.obiEdit = as("obi", () => GAS.updateTask(design.id, Object.assign({}, design, { notes: "edited" }))).notes;
    out.puputDelete = err(() => as("puput", () => GAS.deleteTask(design.id)));
    // Event checklist: the project's writer and designer, not other designers
    const ev = find("EVENT ORG DECEMBER KRR");
    out.alfidTick = as("alfid", () => GAS.setTaskItem(ev.id, "Flyer Cetak", true)).checklist.includes("Flyer Cetak");
    out.ilhamTick = err(() => as("ilham", () => GAS.setTaskItem(ev.id, "Flyer Cetak", false)));
    // Managerial can press every step, also a designer's
    const fix = find("BRIEF ADS NOVEMBER KRR");
    out.riskaAny = fix.stage === "design" && as("riska", () => GAS.moveTask(fix.id, "advance", result)).history.slice(-1)[0].by === "Bu Riska";
    out.activityMoves = mockSheet("Activity").data.filter(r => r[2] === "Moved").map(r => r[1]);
    return out;
  });
  ok(perm.alfidProjects === "KRR,Makuta" && perm.obiProjects === "GTR,KRR,Makuta,VTB", "each account only gets its own projects' tasks -> " + perm.alfidProjects + " / " + perm.obiProjects);
  ok(/content writer/.test(perm.alfidCreate) && /content writer/.test(perm.obiCreateLux) && perm.puputCreateLux === "Puput", "only the project's content writer (or managerial) creates its tasks");
  ok(/ADS only/.test(perm.gmOrg) && perm.gmAds === "ADS", "GM runs ADS only");
  ok(perm.designStage === "design" && /waiting for Alfid/.test(perm.obiPressDesign) && /not found/.test(perm.wawanPressKrr), "Design can't be pressed by the writer or another project's designer");
  ok(perm.alfidPressed === "qcContent:Alfid", "the designer presses Design; History records who");
  ok(/last move/.test(perm.obiUndoAlfid) && perm.alfidUndo === "design", "Undo: whoever made the last move");
  ok(/waiting for QC/.test(perm.alfidPressQc) && perm.hendraQc === "Kak Hendra", "QC steps are managerial's");
  ok(/waiting for Kak Faza/.test(perm.obiSends) && perm.fazaSends === "qcClient" && perm.fazaClient === "Kak Faza", "Send to Client and QC Client are Kak Faza's, not the content writer's");
  ok(/waiting for Obi/.test(perm.fazaPost) && perm.obiPost === "done", "Scheduling Post stays with the content writer");
  ok(perm.adsStage === "ads" && /Musthofa \(via Kak Faza\)/.test(perm.obiAds), "Run Ads (Musthofa) is pressed by Kak Faza -> " + perm.obiAds);
  ok(/content writer/.test(perm.fazaCreate) && /content writer/.test(perm.fazaEdit) && perm.fazaProjects >= 4, "Kak Faza sees every project but does not create or edit tasks");
  ok(/content writer/.test(perm.alfidEdit) && /content writer/.test(perm.obiMoveToLux) && perm.obiEdit === "edited" && /not found/.test(perm.puputDelete), "edit / delete: the project's writer; can't move a task out of their projects");
  ok(perm.alfidTick && /not found/.test(perm.ilhamTick), "Event checklist: the project's designer can tick, others can't");
  ok(perm.riskaAny, "managerial can press any step (here a designer's)");
  ok(perm.activityMoves.includes("Alfid") && perm.activityMoves.includes("Kak Hendra"), "Activity log records each move with the person's name");

  // Page: what each account sees and can press
  await page.evaluate(() => lockApp());
  await page.waitForFunction(() => !localStorage.getItem("makutaTicket"));
  ok(await page.$eval("#lockModal", e => e.classList.contains("show")) && !(await page.evaluate(() => state.links.length)), "Logout shows the login screen and hides the data");
  // A page of its own: nothing of the app (or the last account's name) is visible behind it, on a laptop or a phone
  for (const [w, h] of [[1300, 900], [390, 844]]) {
    await page.setViewport({ width: w, height: h });
    ok(await page.evaluate(() => getComputedStyle(document.querySelector(".app")).display === "none" &&
      document.querySelector(".login-box").getBoundingClientRect().width > 300 && document.documentElement.scrollWidth <= innerWidth),
      `login page at ${w}px: the app is hidden, the form fits`);
  }
  await page.setViewport({ width: 1300, height: 900 });
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  ok(await page.$eval("#lockModal", e => e.classList.contains("show")), "login screen cannot be closed with Esc or a click outside");
  await page.type("#lockUser", "alfid");
  await page.type("#lockInput", "salah");
  await page.click("#lockEye");
  ok(await page.$eval("#lockInput", e => e.type === "text" && e.value === "salah") && await page.$eval("#lockEye", e => e.classList.contains("on")), "eye button shows the password");
  await page.click("#lockEye");
  ok(await page.$eval("#lockInput", e => e.type === "password" && e.value === "salah"), "eye button hides it again (text kept)");
  await page.click("#lockBtn");
  await page.waitForFunction(() => !document.getElementById("lockErr").hidden);
  ok(await page.$eval("#lockErr", e => e.textContent.includes("Wrong username or password")), "wrong password shows an error");
  ok(await page.$eval("#lockInput", e => e.type === "password" && e.value === "") && await page.$eval("#lockUser", e => e.value === "alfid"), "after a wrong try the password is cleared, the username kept");
  // A space a phone keyboard adds after the password does not count
  await page.type("#lockInput", "alfiddemo ");
  await page.click("#lockBtn");
  await page.waitForFunction(() => state.loaded);
  ok(await page.evaluate(() => !!localStorage.getItem("makutaTicket") && localStorage.getItem("makutaPasscode") === null), "login is remembered on this browser (ticket only)");
  await page.evaluate(() => showView("tasks"));
  const alfid = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#taskResults .task")];
    const out = {
      header: document.getElementById("userName").textContent + " / " + document.getElementById("userRole").textContent,
      step: document.getElementById("tStep").value,
      create: [...document.querySelectorAll(".task-create")].every(b => b.hidden),
      admin: document.getElementById("tabAdmin").hidden, sheet: document.getElementById("sheetLink").hidden,
      projects: [...document.querySelectorAll("#tProject option")].map(o => o.value).filter(Boolean).join(),
      mine: cards.length > 0 && cards.every(c => c.querySelector('[data-tact="advance"]')),
    };
    document.getElementById("tStep").value = "all";
    renderTasks();
    out.allButtons = [...document.querySelectorAll("#taskResults .task")].filter(c => c.querySelector('[data-tact="advance"]'))
      .every(c => /Design|Motion/.test(c.querySelector(".ms-current .ms-name").textContent));
    out.waiting = [...document.querySelectorAll("#taskResults .waiting")].map(w => w.textContent).join(" | ");
    out.noEditDelete = !document.querySelector('#taskResults [data-tact="edit"], #taskResults [data-tact="delete"]');
    return out;
  });
  ok(alfid.header === "Alfid / Graphic Designer" && alfid.step === "mine" && alfid.mine, "designer: name in the header, opens on My Tasks (only their steps)");
  ok(alfid.create && alfid.admin && alfid.sheet && alfid.projects === "KRR,Makuta", "designer: no task creation, no Admin, no Google Sheet button, own projects only");
  ok(alfid.allButtons && alfid.noEditDelete, "designer: buttons only on Design / Motion steps, no Edit / Delete");
  ok(/Waiting for QC \(Kak Hendra \/ Bu Riska\)/.test(alfid.waiting) && /\(via Obi\)/.test(alfid.waiting), "other steps show who they wait for -> " + alfid.waiting.slice(0, 120));
  await page.screenshot({ path: `${shots}/designer-tasks.png` });
  // Owner: Admin tab, View as
  await page.evaluate(() => lockApp());
  await loginAs("owner", "owner");
  await page.evaluate(() => showView("admin"));
  await page.waitForFunction(() => document.querySelector("#viewAsUser option") && document.querySelector("#adminActivity li"));
  ok(await page.$eval("#adminSessions", e => e.textContent.includes("This browser")), "Admin: logged-in list shows this browser");
  await page.screenshot({ path: `${shots}/admin.png`, fullPage: true });
  await page.select("#viewAsUser", "puput");
  await page.click("#viewAdmin .btn-accent");
  await page.waitForFunction(() => state.loaded && state.user.name === "Puput");
  ok(await page.evaluate(() => !document.getElementById("viewAsBanner").hidden && document.getElementById("tabAdmin").hidden &&
    !document.querySelector("#taskResults [data-tact]") && getComputedStyle(document.getElementById("submitBtn")).display === "none" &&
    state.tasks.every(t => ["GM", "LUX", "HC"].includes(t.project))), "View as Puput: her projects only, read-only (no buttons, no Submit)");
  await page.click("#viewAsBanner button");
  await page.waitForFunction(() => state.loaded && state.user.name === "Owner" && !state.viewAs);
  ok(await page.evaluate(() => !document.getElementById("tabAdmin").hidden && document.getElementById("viewAsBanner").hidden), "Exit View as goes back to the owner");
  await page.evaluate(() => loadTestData());
  await page.waitForFunction(() => state.loaded && state.links.length > 0);

  /* ---------- 4. Dashboard: Home, sidebar, New menu, link panel ---------- */
  console.log("Dashboard");
  await page.evaluate(() => lockApp());
  // Logging in takes one call to the server: the login answer already holds the data
  await page.evaluate(() => { window.apiCalls = []; window.realApi = GAS.api; GAS.api = (t, fn, ...rest) => (apiCalls.push(fn), realApi(t, fn, ...rest)); });
  await loginAs("obi");
  ok(await page.evaluate(() => { GAS.api = realApi; return apiCalls.length === 0 && state.tasks.length > 0; }), "login loads the app in one call (no second getInitialData)");
  // A move of several tasks writes its activity rows together, all with the right names
  const logged = await page.evaluate(() => {
    GAS.actAs("owner");
    const t = GAS.addTasks([{ title: "BRIEF ORG MARCH VTB", project: "VTB", type: "Static" }, { title: "VIDEO CTC ORG MARCH VTB", project: "VTB", type: "Video (Shooting)" }], "2027-02");
    const before = mockSheet("Activity").data.length;
    GAS.actAs("obi");
    GAS.moveTask(t[0].id, "advance", { link: "https://docs.google.com/document/d/march" });
    const rows = mockSheet("Activity").data.slice(before);
    GAS.actAs("owner");
    t.forEach(x => GAS.deleteTask(x.id));
    return rows.map(r => r[1] + ":" + r[2] + ":" + r[4]).join(" | ");
  });
  ok(logged === "Obi:Moved:BRIEF ORG MARCH VTB | Obi:Moved:VIDEO CTC ORG MARCH VTB", "a move of 2 tasks logs both, by name -> " + logged);
  ok(await page.evaluate(() => state.page === "home" && !document.getElementById("viewHome").hidden && document.getElementById("pageTitle").textContent === "Home"), "after login the app opens on Home");
  const home = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#homeTurn .turn-row")];
    const ids = rows.map(r => r.querySelector("[data-open]").dataset.open);
    const tasks = ids.map(id => state.tasks.find(t => t.id === id));
    return {
      count: rows.length, allMine: tasks.every(isMyStep), allButtons: rows.every(r => r.querySelector("[data-tact]")),
      // Every task waiting for Obi is listed, except Monthly Brief tasks moved together with one already listed
      complete: state.tasks.filter(isMyStep).every(t => ids.includes(t.id) || ids.some(id => linkedTasks(state.tasks.find(o => o.id === id)).includes(t))),
      once: !tasks.some((t, i) => tasks.slice(0, i).some(o => linkedTasks(o).includes(t))),
      stats: [...document.querySelectorAll("#homeStats .home-stat")].map(b => b.dataset.stat).join(),
      mineStat: Number(document.querySelector("#homeStats [data-stat=mine] .stat-n").textContent) === state.tasks.filter(isMyStep).length,
      projects: [...document.querySelectorAll("#homeProjects [data-project-open]")].map(b => b.dataset.projectOpen).join(),
      // Each project row adds up to its active tasks (every active task sits in exactly one stage)
      sums: [...document.querySelectorAll("#homeProjects .proj-row:not(.proj-head)")].every(r => {
        const p = r.querySelector("[data-project-open]").dataset.projectOpen;
        const n = [...r.querySelectorAll(".proj-cell:not([data-label=Late]) .stage-n")].reduce((a, e) => a + Number(e.textContent), 0);
        return n === state.tasks.filter(t => t.project === p && t.stage !== "done").length;
      }),
      hello: document.getElementById("helloTitle").textContent.endsWith("Obi") && document.getElementById("helloText").textContent === "Content Writer · VTB, KRR, Makuta and GTR",
      recent: document.querySelectorAll("#homeRecent li").length, due: !!document.querySelector("#homeDue"),
      sideProjects: [...document.querySelectorAll("#sideProjects [data-project]")].map(b => b.dataset.project).filter(Boolean).join(),
      navTurn: document.getElementById("navTurn").textContent,
    };
  });
  ok(home.count > 0 && home.allMine && home.allButtons && home.complete && home.once, `Home "Your turn": every step waiting for me, with its buttons, linked tasks once (${home.count})`);
  ok(home.hello, "Home greets me and names my role and projects");
  ok(home.stats === "mine,late,soon,client" && home.mineStat, "Home numbers: waiting for me, late, due this week, at client");
  ok(home.projects === "VTB,KRR,Makuta,GTR" && home.sums, "Home Projects table: my projects, every active task counted once per project");
  ok(home.recent > 0 && home.due, "Home shows recent moves and what is due");
  ok(home.sideProjects === "VTB,KRR,Makuta,GTR" && Number(home.navTurn) === await page.evaluate(() => state.tasks.filter(isMyStep).length), "sidebar: my projects only, Milestones shows how many are my turn");
  // A number in the Projects table opens Milestones on that project and stage; a sidebar project opens Milestones on it
  const cellPick = await page.evaluate(() => { const b = document.querySelector("#homeProjects button[data-stat]"); return { stat: b.dataset.stat, project: b.dataset.project, n: Number(b.textContent) }; });
  await page.click(`#homeProjects button[data-stat="${cellPick.stat}"][data-project="${cellPick.project}"]`);
  ok(await page.evaluate(c => state.page === "tasks" && document.getElementById("tStep").value === c.stat && document.getElementById("tProject").value === c.project &&
    document.querySelectorAll("#taskResults [data-task]").length === c.n, cellPick), `a number in the Projects table opens Milestones on that project and stage (${cellPick.project} / ${cellPick.stat})`);
  await page.evaluate(() => showView("home"));
  await page.click('#homeStats [data-stat="client"]');
  ok(await page.evaluate(() => state.page === "tasks" && document.getElementById("tStep").value === "client"), "At client opens Milestones on the tasks at the client");
  await page.evaluate(() => showView("home"));
  await page.click('#homeStats [data-stat="late"]');
  ok(await page.evaluate(() => state.page === "tasks" && document.getElementById("tStep").value === "late"), "Late opens Milestones on the late tasks");
  await page.click('#sideProjects [data-project="KRR"]');
  ok(await page.evaluate(() => document.getElementById("tProject").value === "KRR" && document.querySelector('#sideProjects [data-project="KRR"]').classList.contains("active") &&
    [...document.querySelectorAll("#taskResults .group-head h3")].every(h => /KRR/.test(h.textContent))), "sidebar project opens Milestones on that project (highlighted)");
  // One place marked at a time: the project, not Milestones too; Milestones itself is every project (no "All projects" item)
  const marked = () => page.evaluate(() => [...document.querySelectorAll("#sidebar .active")].map(b => b.id || b.dataset.project).join());
  ok(await marked() === "KRR", "with a project open only that project is marked in the sidebar -> " + await marked());
  ok(await page.evaluate(() => !document.querySelector('#sideProjects [data-project=""]')), "no All projects item (that is Milestones)");
  await page.click("#tabTasks");
  ok(await marked() === "tabTasks" && await page.$eval("#tProject", s => s.value === ""), "Milestones shows every project again and is the only one marked");
  // Pressing my step from Home, then Undo from the message
  await page.evaluate(() => showView("home"));
  const pressed = await page.evaluate(() => {
    // A step without a link to paste (those open the link popup first, tested above)
    const row = [...document.querySelectorAll("#homeTurn .turn-row")].find(r => r.querySelector('[data-tact="advance"]') && !r.querySelector('[data-tact="revise"]') &&
      !state.cfg.linkSteps[state.tasks.find(t => t.id === r.querySelector("[data-open]").dataset.open).stage]);
    const id = row.querySelector("[data-open]").dataset.open;
    const before = state.tasks.find(t => t.id === id).stage;
    row.querySelector('[data-tact="advance"]').click();
    return { id, before };
  });
  await page.waitForFunction(p => state.tasks.find(t => t.id === p.id).stage !== p.before, {}, pressed);
  ok(await page.evaluate(() => !document.querySelector("#homeTurn") || true) && await page.$eval("#toast", e => e.classList.contains("show") && !!e.querySelector(".toast-action")), "a step pressed on Home moves the task; the message offers Undo");
  await page.click("#toast .toast-action");
  await page.waitForFunction(p => state.tasks.find(t => t.id === p.id).stage === p.before, {}, pressed);
  ok(true, "Undo in the message takes the move back");
  // Opening a task from Home jumps to its card in Milestones
  await page.evaluate(id => openTask(id), pressed.id);
  ok(await page.evaluate(id => state.page === "tasks" && !!document.querySelector(`#taskResults [data-task="${id}"].task-flash`), pressed.id), "a task opened from Home is shown and highlighted in Milestones");
  // New menu and the link panel
  await page.click("#newBtn");
  ok(await page.$eval("#newMenu", e => !e.hidden) && await page.$$eval("#newMenu button", b => b.filter(x => !x.hidden).length) === 3, "New menu: Monthly Brief, Single task, Resource");
  // (on the page title: a spot in the list could be a link that opens a new tab)
  await page.click("#pageTitle");
  ok(await page.$eval("#newMenu", e => e.hidden), "New menu closes on a click outside it");
  await page.evaluate(() => newItem("link"));
  ok(await page.evaluate(() => !document.getElementById("viewSubmit").hidden && document.body.classList.contains("drawer-open") && state.page === "tasks"), "Add link opens as a side panel over the page");
  await page.type("#url", "https:\/\/docs.google.com/spreadsheets/d/abc/edit");
  ok(await page.$eval("#category", e => e.value === "Google Spreadsheets"), "pasting a Google Sheets address picks its category");
  await page.keyboard.press("Escape");
  ok(await page.evaluate(() => document.getElementById("viewSubmit").hidden && !document.body.classList.contains("drawer-open")), "Esc closes the side panel");
  await page.evaluate(() => resetForm());
  // Designers: no New button entries for tasks, no Links creation hidden
  await page.evaluate(() => lockApp());
  await loginAs("alfid");
  ok(await page.evaluate(() => [...document.querySelectorAll("#newMenu .task-create")].every(b => b.hidden) && !document.querySelector("#newMenu .link-create").hidden), "designer: New menu has Resource only");
  // Kak Faza: her steps on Home, each with the result to send or post
  await page.evaluate(() => lockApp());
  await loginAs("faza");
  const faza = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#homeTurn .turn-row")];
    return { n: rows.length, stages: [...new Set(rows.map(r => state.tasks.find(t => t.id === r.querySelector("[data-open]").dataset.open).stage))].sort().join(),
      links: rows.every(r => /Open result/.test((r.querySelector(".link-open") || {}).textContent || "")), create: [...document.querySelectorAll("#newMenu .task-create")].every(b => b.hidden),
      hello: document.getElementById("helloText").textContent };
  });
  ok(faza.n > 0 && /^(ads|qcClient|toClient)(,(ads|qcClient|toClient))*$/.test(faza.stages), "Kak Faza's Home: Send to Client, QC Client and Run Ads -> " + faza.stages);
  ok(faza.links && faza.create && faza.hello === "Assistant Manager · every project", "each one has its Open result button; no task creation");
  await page.evaluate(() => lockApp());
  await loginAs("owner", "owner");
  ok(await page.evaluate(() => document.getElementById("turnTitle").textContent === "Late tasks" && document.querySelector("#homeStats [data-stat=active]")), "owner's Home lists late tasks and all active tasks (no steps of their own)");

  // Laptop: the button next to the name shrinks the sidebar to its icons; remembered after a reload
  await page.setViewport({ width: 1300, height: 900 });
  const sideWidth = () => page.$eval("#sidebar", e => Math.round(e.getBoundingClientRect().width));
  ok(await sideWidth() === 248 && await page.$eval("#sideCollapse", b => b.getAttribute("aria-label") === "Collapse the sidebar"), "laptop: sidebar open, with a Collapse button");
  await page.click("#sideCollapse");
  await new Promise(r => setTimeout(r, 300));
  ok(await sideWidth() === 76 && await page.$eval("#tabHome .nav-label", e => getComputedStyle(e).display === "none") &&
    await page.$eval("#sideCollapse", b => b.getAttribute("aria-label") === "Expand the sidebar"), "Collapse: icons only, the button now expands it");
  await page.reload();
  await page.waitForFunction(() => state.loaded);
  ok(await sideWidth() === 76, "the narrow sidebar is remembered after a reload");
  await page.click("#sideCollapse");
  await new Promise(r => setTimeout(r, 300));
  ok(await sideWidth() === 248, "Expand brings the names back");
  await page.setViewport({ width: 820, height: 900 });
  ok(await page.$eval("#sideCollapse", b => getComputedStyle(b).display === "none"), "tablet: no collapse button (the rail is always narrow)");
  await page.setViewport({ width: 1300, height: 900 });
  ok(await page.evaluate(() => !document.querySelector(".preview-banner, .demo-login")), "no demo banner or login note on the page");
  // Due this week counts today to 7 days ahead (late tasks are counted under Late only); no "Good night" greeting
  ok(await page.evaluate(() => { const d = n => dayStr(new Date(Date.now() + n * 864e5)); const t = day => ({ stage: "design", deadline: day });
    return !STEP_GROUPS.soon.test(t(d(-1))) && STEP_GROUPS.soon.test(t(d(0))) && STEP_GROUPS.soon.test(t(d(7))) && !STEP_GROUPS.soon.test(t(d(8))) && STEP_GROUPS.late.test(t(d(-1))); }),
    "Due this week: today to 7 days ahead, late tasks only under Late");
  ok(await page.evaluate(() => [6, 12, 16, 19, 23, 2].map(dayPart).join() === "morning,afternoon,evening,evening,evening,evening"), "greeting: morning, afternoon, evening (never good night)");

  // On a laptop the greeting and every short note sit on one line (no sentence broken off halfway)
  for (const who of ["obi", "faza", "owner"]) {
    await page.evaluate(() => lockApp());
    await loginAs(who, who === "owner" ? "owner" : undefined);
    for (const v of ["home", "links", "links-tasks"]) {
      await page.evaluate(v => { if (v === "links-tasks") { showView("links"); showLinkTab("tasks"); } else { showView(v); if (v === "links") showLinkTab("resources"); } }, v);
      const lines = await page.evaluate(() => [...document.querySelectorAll(".home-hello p, .block-note")].filter(e => e.offsetParent)
        .map(e => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size + ":" + e.textContent.slice(0, 30); }));
      ok(lines.length > 0 && lines.every(l => l.startsWith("1:")), `${who} ${v} at 1300px: notes on one line -> ${lines.join(" | ")}`);
    }
  }
  await page.evaluate(() => showLinkTab("resources"));

  // Layout: no sideways scroll on a phone or tablet, and screenshots for a visual check
  for (const [w, name] of [[1300, "desktop"], [820, "tablet"], [390, "phone"]]) {
    await page.setViewport({ width: w, height: 900 });
    for (const v of ["home", "tasks", "links", "admin", "submit"]) {
      await page.evaluate(v => showView(v), v);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(over <= 0, `${name} ${v}: no horizontal page scroll (${over}px)`);
      await page.screenshot({ path: `${shots}/${name}-${v}.png`, fullPage: v !== "tasks" });
    }
    await page.evaluate(() => closeOverlays());
  }
  // Phone: bottom bar and the slide-in sidebar
  await page.setViewport({ width: 390, height: 844 });
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".bottom-nav")).display === "flex" && getComputedStyle(document.querySelector(".menu-btn")).display !== "none"), "phone: bottom bar and menu button shown");
  await page.evaluate(() => toggleSidebar(true));
  await new Promise(r => setTimeout(r, 300));
  ok(await page.evaluate(() => document.getElementById("sidebar").getBoundingClientRect().left >= 0), "phone: the menu button slides the sidebar in");
  // Phone: Milestones filters fold behind one button that counts the ones in use
  await page.evaluate(() => { showProject("KRR"); });
  ok(await page.evaluate(() => getComputedStyle(document.querySelector("#viewTasks .filters")).display === "none" &&
    document.querySelector("#viewTasks .filter-toggle").textContent === "Filters (1)"), "phone: filters folded, the button says one is in use");
  await page.click("#viewTasks .filter-toggle");
  ok(await page.evaluate(() => getComputedStyle(document.querySelector("#viewTasks .filters")).display !== "none"), "phone: the Filters button opens them");
  await page.evaluate(() => { showView("links"); });
  ok(await page.evaluate(() => !document.body.classList.contains("sidebar-open") && document.querySelector('.bottom-nav [data-nav="links"]').classList.contains("active")), "phone: opening a page closes the sidebar and marks it in the bottom bar");
  await page.setViewport({ width: 1300, height: 900 });
  await page.evaluate(() => { showView("tasks"); document.documentElement.dataset.theme = "dark"; openTaskForm(); });
  await page.type("#tfTitle", "EVENT ORG DECEMBER KRR");
  await page.select("#tfType", "Event Attribute");
  await page.screenshot({ path: `${shots}/dark-form.png` });

  /* ---------- 5. Team & Projects: managerial and the owner add people and projects ---------- */
  console.log("Team & Projects");
  await page.evaluate(() => { document.querySelectorAll(".modal-bg.show").forEach(m => m.classList.remove("show")); document.documentElement.dataset.theme = "light"; });
  const tm = await page.evaluate(() => {
    const err = fn => { try { fn(); return ""; } catch (e) { return e.message; } };
    const out = {};
    const owner = GAS.login("owner", "owner", "test").ticket;
    const hendra = GAS.login("hendra", "hendrademo", "test").ticket;
    const obi = GAS.login("obi", "obidemo", "test").ticket;
    const puput = GAS.login("puput", "puputdemo", "test").ticket;
    const call = (t, fn, ...args) => GAS.api(t, fn, args);
    const team0 = call(owner, "getTeam");
    out.seeded = team0.members.length === 8 && team0.projects.length === 7 && team0.videographers.length === 2 &&
      mockSheet("Team").data[0].join() === "Username,Name,Role,Status,Added,Updated" && mockSheet("Team").data[1][2] === "Managerial" &&
      mockSheet("Projects").data.find(r => r[0] === "Makuta")[6] === "ORG only";
    out.order = call(owner, "getInitialData").taskConfig.projectOrder.join();
    out.seededConfig =JSON.stringify(call(owner, "getInitialData").taskConfig.projects.KRR);
    out.writerRefused = err(() => call(obi, "getTeam"));
    out.ownerRoles = team0.roles.map(r => r.key).join();
    out.managerRoles = call(hendra, "getTeam").roles.map(r => r.key).join();
    out.riskaLocked = call(hendra, "getTeam").members.find(m => m.username === "riska").editable;
    out.managerAddManager = err(() => call(hendra, "saveMember", { username: "dimas", name: "Kak Dimas", role: "manager" }, true));
    out.managerEditManager = err(() => call(hendra, "saveMember", { username: "riska", name: "Bu Riska", role: "assistant" }, false));
    out.managerArchiveManager = err(() => call(hendra, "setMemberActive", "riska", false));
    out.badUsername = err(() => call(hendra, "saveMember", { username: "Di mas", name: "Dimas", role: "designer" }, true));
    out.takenUsername = err(() => call(hendra, "saveMember", { username: "obi", name: "Obi Dua", role: "designer" }, true));
    out.ownerUsername = err(() => call(hendra, "saveMember", { username: "owner", name: "Somebody", role: "designer" }, true));
    out.sameName = err(() => call(hendra, "saveMember", { username: "obi2", name: "obi", role: "designer" }, true));
    out.noRole = err(() => call(hendra, "saveMember", { username: "dimas", name: "Dimas", role: "owner" }, true));
    out.selfArchive = err(() => call(hendra, "setMemberActive", "hendra", false));
    // A new graphic designer: logs in with username + the usual ending, no project yet
    call(hendra, "saveMember", { username: "dimas", name: "Dimas", role: "designer" }, true);
    const dimas = GAS.login(" Dimas ", "dimasdemo", "test");
    out.dimasUser = dimas.data.user.roleName + ":" + dimas.data.user.projects.length;
    // A new project with him as its designer
    out.designerMustBeDesigner = err(() => call(hendra, "saveProject", { code: "BSD", icon: "🏢", writer: "puput", designer: "obi", types: ["Static"], channel: "both" }, true));
    out.badIcon = err(() => call(hendra, "saveProject", { code: "BSD", icon: "BSD", writer: "puput", designer: "dimas", types: ["Static"], channel: "both" }, true));
    out.noTypes = err(() => call(hendra, "saveProject", { code: "BSD", icon: "🏢", writer: "puput", designer: "dimas", types: [], channel: "both" }, true));
    call(hendra, "saveProject", { code: "BSD", icon: "🏢", writer: "puput", designer: "dimas", videographer: "Anno", types: ["Static", "Video (Shooting)"], channel: "both" }, true);
    out.dupCode = err(() => call(hendra, "saveProject", { code: "bsd", icon: "🏢", writer: "puput", designer: "dimas", types: ["Static"], channel: "both" }, true));
    out.referenceCode = err(() => call(hendra, "saveProject", { code: "Reference", icon: "🔖", writer: "puput", designer: "dimas", types: ["Static"], channel: "both" }, true));
    out.dimasProjects = call(dimas.ticket, "getInitialData").user.projects.join();
    out.puputProjects = call(puput, "getInitialData").user.projects.join();
    // The project works like the others: Puput writes, managerial does QC, Dimas designs, Wawan can't
    let t = call(puput, "addTask", { title: "BRIEF ORG DECEMBER BSD", project: "BSD", type: "Static", deadline: "2026-12-20" });
    const v = call(puput, "addTask", { title: "VIDEO CTC ORG DECEMBER BSD", project: "BSD", type: "Video (Shooting)", deadline: "2026-12-20" });
    out.videoGetsVg = v.videographer;
    out.obiCantCreate = err(() => call(obi, "addTask", { title: "BRIEF ORG DECEMBER BSD", project: "BSD", type: "Static" }));
    t = call(puput, "moveTask", t.id, "advance", { link: "https://docs.google.com/document/d/bsd" });
    t = call(hendra, "moveTask", t.id, "advance", {});
    out.atDesign = t.stage + ":" + t.designer;
    out.wawanCantPress = err(() => call(GAS.login("wawan", "wawandemo", "test").ticket, "moveTask", t.id, "advance", { link: "https://drive.google.com/r" }));
    t = call(dimas.ticket, "moveTask", t.id, "advance", { link: "https://drive.google.com/bsd-result" });
    out.afterDesign = t.stage;
    // Names come from the Team sheet: QC, Voice Over and "via" follow a rename
    call(owner, "saveMember", { username: "riska", name: "Bu Riska S", role: "manager" }, false);
    const stages = call(owner, "getInitialData").taskConfig.stages;
    out.qcPerson = stages.find(s => s.key === "qcBrief").person;
    out.voPerson = stages.find(s => s.key === "vo").person;
    call(owner, "saveMember", { username: "riska", name: "Bu Riska", role: "manager" }, false);
    // Someone still set on a project can't be archived or change role
    out.archiveBusy = err(() => call(hendra, "setMemberActive", "dimas", false));
    out.roleBusy = err(() => call(hendra, "saveMember", { username: "dimas", name: "Dimas", role: "writer" }, false));
    // A new designer for the project: its open tasks follow at once
    call(hendra, "saveProject", { code: "BSD", icon: "🏬", writer: "puput", designer: "wawan", videographer: "Anno", types: ["Static", "Video (Shooting)"], channel: "both" }, false);
    out.taskDesignerNow = call(owner, "getTasks").find(x => x.id === v.id).designer;
    out.iconNow = call(owner, "getInitialData").taskConfig.projects.BSD.icon;
    // Archived: logged out now, can't log in again; restored: can
    call(hendra, "setMemberActive", "dimas", false);
    out.dimasSessionEnded = err(() => call(dimas.ticket, "getInitialData"));
    out.dimasCantLogin = err(() => GAS.login("dimas", "dimasdemo", "test"));
    out.notInViewAs = call(owner, "getAdminData", ).users.some(u => u.username === "dimas");
    call(hendra, "setMemberActive", "dimas", true);
    out.dimasBack = !!GAS.login("dimas", "dimasdemo", "test").ticket;
    // A content type the project no longer makes: older tasks can still be edited, new ones can't use it
    call(hendra, "saveProject", { code: "BSD", icon: "🏬", writer: "puput", designer: "wawan", videographer: "Anno", types: ["Static"], channel: "both" }, false);
    out.oldVideoEdit = call(puput, "updateTask", v.id, { title: v.title, project: "BSD", type: v.type, videographer: v.videographer, deadline: "2026-12-21" }).deadline;
    out.newVideo = err(() => call(puput, "addTask", { title: "VIDEO CTC ORG JANUARY BSD", project: "BSD", type: "Video (Shooting)" }));
    // Codes that are words of task titles would make the title read wrongly
    out.reservedCodes = ["ORG", "ads", "December", "Dec", "Video", "B-SD", "B SD"].map(code =>
      err(() => call(hendra, "saveProject", { code, icon: "🏢", writer: "puput", designer: "dimas", types: ["Static"], channel: "both" }, true)));
    // Undo still works for the person who moved, after their name changed
    const u1 = call(puput, "addTask", { title: "BRIEF ORG JANUARY BSD", project: "BSD", type: "Static" });
    call(puput, "moveTask", u1.id, "advance", { link: "https://docs.google.com/document/d/u1" });
    call(owner, "saveMember", { username: "puput", name: "Puput Ayu", role: "writer" }, false);
    out.undoAfterRename = call(puput, "moveTask", u1.id, "undo", {}).stage;
    out.otherCantUndo = (() => { call(puput, "moveTask", u1.id, "advance", { link: "https://docs.google.com/document/d/u1" }); return err(() => call(obi, "moveTask", u1.id, "undo", {})); })();
    call(owner, "saveMember", { username: "puput", name: "Puput", role: "writer" }, false);
    call(puput, "deleteTask", u1.id);
    // Archived project: hidden with its tasks, no new tasks; restored: back
    call(hendra, "setProjectActive", "BSD", false);
    out.archivedIcon = call(owner, "getInitialData").taskConfig.projectIcons.BSD;
    out.hiddenOwner = call(owner, "getTasks").some(x => x.project === "BSD");
    out.hiddenPuput = call(puput, "getInitialData").user.projects.includes("BSD");
    out.notInConfig = "BSD" in call(owner, "getInitialData").taskConfig.projects;
    out.noNewTask = err(() => call(puput, "addTask", { title: "BRIEF ORG JANUARY BSD", project: "BSD", type: "Static" }));
    out.archivedCantMove = err(() => call(hendra, "moveTask", t.id, "advance", {}));
    out.keptInSheet = mockSheet("Tasks").data.filter(r => r[4] === "BSD").length;
    call(hendra, "setProjectActive", "BSD", true);
    out.backTasks = call(owner, "getTasks").filter(x => x.project === "BSD").length;
    // Videographers
    out.vgList = call(hendra, "saveVideographer", "Budi").videographers.map(x => x.name).join();
    out.vgDup = err(() => call(hendra, "saveVideographer", "budi"));
    out.vgBad = err(() => call(hendra, "saveVideographer", "<b>"));
    out.vgInUse = err(() => call(hendra, "setVideographerActive", "Anno", false));
    out.vgPick = call(owner, "addTask", { title: "VIDEO CTC ORG DECEMBER MAKUTA", project: "Makuta", type: "Video (Shooting)", videographer: "Budi" }).videographer;
    out.vgResource = call(owner, "addLink", { title: "Budi cut", url: "https://drive.google.com/budi", category: "CTC-Video [VG-Budi]" }).category;
    call(hendra, "setVideographerActive", "Budi", false);
    out.vgArchivedPick = err(() => call(owner, "addTask", { title: "VIDEO CTC ORG DECEMBER MAKUTA", project: "Makuta", type: "Video (Shooting)", videographer: "Budi" }));
    out.vgConfig = call(owner, "getInitialData").taskConfig.videographers.join();
    // The last managerial account stays
    call(owner, "setMemberActive", "riska", false);
    out.lastManager = err(() => call(owner, "setMemberActive", "hendra", false));
    out.lastManagerRole = err(() => call(owner, "saveMember", { username: "hendra", name: "Kak Hendra", role: "assistant" }, false));
    out.qcAlone = call(owner, "getInitialData").taskConfig.stages.find(s => s.key === "qcCut").person;
    call(owner, "setMemberActive", "riska", true);
    // Every change is in the Activity log
    out.activity = call(owner, "getAdminData").activity.map(e => e.who + ":" + e.action + ":" + (e.project || e.task));
    out.writerApi = [err(() => call(obi, "saveMember", { username: "x1", name: "X One", role: "designer" }, true)), err(() => call(puput, "setProjectActive", "BSD", false))];
    out.viewAsWrite = err(() => GAS.api(owner, "saveVideographer", ["Cici"], "hendra"));
    return out;
  });
  ok(tm.order === "VTB,KRR,Makuta,GTR,GM,HC,LUX", "projects keep the order of the Projects sheet (sent as a list, not only as an object)");
  ok(tm.seeded,"Team sheets are filled the first time with the 8 accounts, 7 projects and 2 videographers (readable in the sheet)");
  ok(tm.seededConfig === JSON.stringify({ writer: "Obi", designer: "Alfid", videographer: "Anno", icon: "🌴", types: ["Static", "Video (Shooting)", "Event Attribute"], orgOnly: false, adsOnly: false }),
    "projects from the sheet are the same as before (KRR: Obi, Alfid, Anno, its types)");
  ok(/managerial and the owner/.test(tm.writerRefused) && tm.writerApi.every(e => /managerial and the owner/.test(e)), "content writers can't open or change Team & Projects");
  ok(tm.ownerRoles === "manager,assistant,writer,designer" && tm.managerRoles === "assistant,writer,designer", "roles: no Owner; managerial can't give the Managerial role");
  ok(tm.riskaLocked === false && /Only the owner/.test(tm.managerAddManager) && /Only the owner/.test(tm.managerEditManager) && /Only the owner/.test(tm.managerArchiveManager),
    "managerial can't add, change or archive another managerial account (only the owner)");
  ok(/small letters/.test(tm.badUsername) && /already taken/.test(tm.takenUsername) && /already taken/.test(tm.ownerUsername) && /already called/.test(tm.sameName) && /choose the role/.test(tm.noRole),
    "new person: username format, taken usernames (also the owner's), unique names, a valid role");
  ok(/own account/.test(tm.selfArchive), "nobody can archive their own account");
  ok(tm.dimasUser === "Graphic Designer:0", "a new person logs in with username + the usual ending (Dimas, designer, no project yet)");
  ok(/graphic designer/.test(tm.designerMustBeDesigner) && /emoji/.test(tm.badIcon) && /content type/.test(tm.noTypes) && /already used/.test(tm.dupCode) && /already used/.test(tm.referenceCode),
    "new project: the right roles, an emoji icon, a content type, a code not used yet (any case, not REFERENCE)");
  ok(tm.dimasProjects === "BSD" && tm.puputProjects.split(",").includes("BSD") && tm.videoGetsVg === "Anno", "the new project is in its writer's and designer's projects; its videographer fills new video tasks");
  ok(/content writer of BSD/.test(tm.obiCantCreate) && tm.atDesign === "design:Dimas" && /not found/.test(tm.wawanCantPress) && tm.afterDesign === "qcContent",
    "the new project's steps: only its writer creates tasks, only its designer presses Design (others don't even see it)");
  ok(tm.qcPerson === "Kak Hendra / Bu Riska S" && tm.voPerson === "Bu Riska S","QC and Voice Over show the current names from the Team sheet");
  ok(/still the graphic designer of BSD/.test(tm.archiveBusy) && /still the graphic designer of BSD/.test(tm.roleBusy), "someone still set on a project can't be archived or change role");
  ok(tm.taskDesignerNow === "Wawan" && tm.iconNow === "🏬", "a new designer for a project: its tasks follow at once");
  ok(tm.reservedCodes.slice(0, 5).every(e => /used in task titles/.test(e)) && tm.reservedCodes.slice(5).every(e => /letters or digits/.test(e)),
    "project codes can't be title words (ORG, ADS, months, VIDEO) or have spaces / dashes");
  ok(tm.undoAfterRename === "brief" && /not found/.test(tm.otherCantUndo), "Undo by the person who moved still works after their name changes");
  ok(tm.archivedIcon === "🏬", "an archived project keeps its emoji (for its links in Resources)");
  ok(/^LOCKED/.test(tm.dimasSessionEnded) && /^LOCKED: Wrong/.test(tm.dimasCantLogin) && !tm.notInViewAs && tm.dimasBack, "archived: logged out at once and can't log in (not in View as); restored: can log in again");
  ok(tm.oldVideoEdit === "2026-12-21" && /has no Video \(Shooting\)/.test(tm.newVideo), "a content type the project no longer makes: older tasks can still be edited, no new ones");
  ok(!tm.hiddenOwner && !tm.hiddenPuput && !tm.notInConfig && /choose the project/.test(tm.noNewTask) && /not found/.test(tm.archivedCantMove) && tm.keptInSheet === 2 && tm.backTasks === 2,
    "archived project: hidden with its tasks (kept in the sheet), no new tasks; restored: back");
  ok(tm.vgList === "Anno,Arif,Budi" && /already in the list/.test(tm.vgDup) && /2 to 30 letters/.test(tm.vgBad) && /still the videographer of/.test(tm.vgInUse) &&
    tm.vgPick === "Budi" && tm.vgResource === "CTC-Video [VG-Budi]" && /choose the videographer/.test(tm.vgArchivedPick) && tm.vgConfig === "Anno,Arif",
    "videographers: added (tasks and Resources use them), no doubles, not archived while a project uses them");
  ok(/only managerial account left/.test(tm.lastManager) && /only managerial account left/.test(tm.lastManagerRole) && tm.qcAlone === "Kak Hendra", "the last managerial account can't be archived or change role");
  ok(["Kak Hendra:Added person:Dimas", "Kak Hendra:Added project:BSD", "Kak Hendra:Archived person:Dimas", "Kak Hendra:Archived project:BSD", "Kak Hendra:Added videographer:Budi", "Owner:Edited person:Bu Riska S"]
    .every(a => tm.activity.includes(a)), "Activity log records every Team & Projects change");
  ok(/read-only/.test(tm.viewAsWrite), "View as can't change the team");

  // The page: Kak Hendra adds a person and a project
  await page.evaluate(() => forgetLogin());
  await loginAs("hendra");
  ok(await page.evaluate(() => !$("tabTeam").hidden && $("tabAdmin").hidden), "managerial sees Team & Projects (not Admin)");
  await page.evaluate(() => showView("team"));
  await page.waitForSelector("#teamResults .team-row");
  ok(await page.evaluate(() => $("pageTitle").textContent === "Team & Projects" && document.querySelectorAll("#teamResults .team-row").length === 9 &&
    [...document.querySelectorAll("#teamResults .team-row")].find(r => r.textContent.includes("Bu Riska")).querySelector(".team-lock") &&
    ![...document.querySelectorAll("#teamResults .team-row")].some(r => /Owner/.test(r.querySelector(".team-role").textContent))),
    "Team tab: everyone (no Owner); managerial accounts say only the owner can change them");
  await page.screenshot({ path: `${shots}/team.png` });
  await page.click("#teamAddBtn");
  ok(await page.evaluate(() => [...$("mfRole").options].map(o => o.value).join() === ",assistant,writer,designer"), "Add person: managerial can't pick Managerial");
  await page.type("#mfName", "Kak Sinta");
  await page.type("#mfUsername", "sinta");
  await page.select("#mfRole", "writer");
  ok(await page.evaluate(() => /Briefs/.test($("mfRoleHelp").textContent)), "Add person: the role says what it does");
  await page.click("#memberSave");
  await page.waitForFunction(() => !$("memberModal").classList.contains("show") && [...document.querySelectorAll("#teamResults .team-row")].some(r => r.textContent.includes("Kak Sinta")));
  ok(true, "Add person from the page");
  await page.click("[data-ttab=projects]");
  ok(await page.evaluate(() => document.querySelectorAll("#teamResults .team-row").length === 8 && !$("vgCard").hidden && $("teamAddBtn").textContent === "+ Add project"), "Projects tab: the projects and the videographers");
  await page.click("#teamAddBtn");
  await page.type("#pfCode", "PIK");
  await page.$eval("#pfIcon", e => e.value = "🌊");
  await page.select("#pfWriter", "sinta");
  await page.select("#pfDesigner", "ilham");
  await page.select("#pfChannel", "org");
  await page.click("#pfTypes input[value='Video (Non-Shooting)']");
  await page.click("#projectSave");
  await page.waitForFunction(() => !$("projectModal").classList.contains("show") && state.cfg.projects.PIK && [...document.querySelectorAll("#sideProjects [data-project]")].some(b => b.dataset.project === "PIK"));
  ok(await page.evaluate(() => JSON.stringify(state.cfg.projects.PIK) === JSON.stringify({ writer: "Kak Sinta", designer: "Ilham", videographer: "", icon: "🌊", types: ["Static", "Video (Non-Shooting)"], orgOnly: true, adsOnly: false })),
    "Add project from the page: the app (sidebar, New task) has it at once");
  await page.screenshot({ path: `${shots}/team-projects.png` });
  // Archive from the page (asks first), hidden until "Show archived"
  await page.click("[data-tact='archive-project'][data-key='PIK']");
  await page.waitForSelector("#confirmModal.show");
  await page.click("#confirmOk");
  await page.waitForFunction(() => !state.cfg.projects.PIK && ![...document.querySelectorAll("#teamResults .team-row")].some(r => r.textContent.includes("PIK")));
  await page.click("#teamArchived");
  ok(await page.evaluate(() => [...document.querySelectorAll("#teamResults .team-row.is-archived")].some(r => r.textContent.includes("PIK") && r.querySelector("[data-tact='restore-project']"))),
    "Archive a project from the page (asks first); Show archived lists it with Restore");
  await page.evaluate(() => { $("teamArchived").checked = false; });
  // A content writer has no Team & Projects
  await page.evaluate(() => forgetLogin());
  await loginAs("obi");
  ok(await page.evaluate(() => $("tabTeam").hidden && (showView("team"), true)), "content writers don't see Team & Projects");

  // Back to the team the other tests use
  await page.evaluate(() => {
    ["Team", "Projects", "Videographers"].forEach(n => { mockSheet(n).data = []; mockSheet(n).save(); });
    mockSheet("Tasks").data = mockSheet("Tasks").data.filter(r => !["BSD", "PIK"].includes(r[4]) && !(r[3] === "VIDEO CTC ORG DECEMBER MAKUTA" && r[8] === "Budi"));
    mockSheet("Tasks").save();
    mockSheet("Links").data = mockSheet("Links").data.filter(r => r[3] !== "Budi cut");
    mockSheet("Links").save();
    PropertiesService.getScriptProperties().deleteProperty("TEAM_SEEDED");
    delete mockCache.team_v1;
    forgetLogin();
  });
  await loginAs("owner", "owner");
  ok(await page.evaluate(() => Object.keys(state.cfg.projects).join() === "VTB,KRR,Makuta,GTR,GM,HC,LUX"), "the team sheets fill again from the start when emptied (test clean-up)");
  // Home: the "Late tasks" count is the same number as the Late card (linked Monthly Brief tasks share a row)
  await page.evaluate(() => showView("home"));
  ok(await page.evaluate(() => parseInt($("turnCount").textContent) === parseInt(document.querySelector('[data-stat="late"] .stat-n').textContent) &&
    [...document.querySelectorAll("#sideProjects [data-project]")].map(b => b.dataset.project).join() === "VTB,KRR,Makuta,GTR,GM,HC,LUX"),
    "Home: Late tasks count = the Late card; the sidebar follows the Projects sheet order");

  /* ---------- 6. Rows copied by hand in the sheet ---------- */
  console.log("Copied rows");
  // A copied row has the same ID: a step was read from the first row and saved into the copy, so the page
  // said "Moved" but a refresh showed the old step again
  const cp = await page.evaluate(() => {
    GAS.actAs("owner");
    const t = GAS.addTask({ title: "BRIEF ADS NOVEMBER KRR", project: "KRR", type: "Static" });
    const tasks = mockSheet("Tasks"), links = mockSheet("Links");
    tasks.data.push(tasks.data.find(r => r[0] === t.id).slice());
    links.data.push(links.data[1].slice());
    const linkId = links.data[1][0];
    const moved = GAS.moveTask(t.id, "advance", { from: "brief", link: "https://example.com/brief" });
    const out = {
      said: moved.stage,
      reread: GAS.getTasks().filter(x => x.createdAt === t.createdAt).map(x => x.id === t.id ? "orig:" + x.stage : "copy:" + x.stage).sort().join(),
      taskIds: new Set(tasks.data.slice(1).map(r => r[0])).size === tasks.data.length - 1,
      linkIds: GAS.getLinks().filter(l => l.id === linkId).length === 1 && new Set(links.data.slice(1).map(r => r[0])).size === links.data.length - 1,
      log: mockSheet("Activity").data.filter(r => r[2] === "Fixed copied row").length,
    };
    // A content type typed by hand with a space keeps the task on its step
    const v = GAS.addTask({ title: "VIDEO CTC ADS NOVEMBER KRR", project: "KRR", type: "Video (Shooting)" });
    const row = tasks.data.find(r => r[0] === v.id);
    row[5] = "video (shooting) ";
    row[10] = "shoot";
    out.typed = GAS.getTasks().find(x => x.id === v.id).stage;
    // An ORG / ADS cell emptied by hand: read from the title, so the task stays at Run Ads
    const a = GAS.addTask({ title: "BRIEF ADS DECEMBER KRR", project: "KRR", type: "Static" });
    const aRow = tasks.data.find(r => r[0] === a.id);
    aRow[6] = "";
    aRow[10] = "ads";
    const aRead = GAS.getTasks().find(x => x.id === a.id);
    out.blankChannel = aRead.channel + ":" + aRead.stage;
    // Clean up
    tasks.data = tasks.data.filter(r => r[1] !== t.createdAt && r[0] !== v.id && r[0] !== a.id);
    tasks.save();
    links.data.pop();
    links.save();
    return out;
  });
  ok(cp.said === "qcBrief" && cp.reread === "copy:brief,orig:qcBrief", "a step on a task whose row was copied stays saved after a refresh (" + cp.reread + ")");
  ok(cp.taskIds && cp.linkIds && cp.log === 2, "copied task and link rows get their own ID, written in the Activity log");
  ok(cp.typed === "shoot", "a content type typed by hand (other case, extra space) keeps the task's step");
  ok(cp.blankChannel === "ADS:ads", "an emptied ORG / ADS cell is read from the title (the task stays at Run Ads)");
  // The page is out of date (the task was moved elsewhere): pressing the step says so and shows the task as it is now
  const stale = await page.evaluate(async () => {
    await reloadData();
    const t = state.tasks.find(x => x.stage === "qcBrief");
    const row = mockSheet("Tasks").data.find(r => r[0] === t.id);
    const was = row[10];
    row[10] = "design";
    await moveTask(t, "advance", {});
    await new Promise(r => setTimeout(r, 300));
    const now = state.tasks.find(x => x.id === t.id).stage;
    row[10] = was;
    mockSheet("Tasks").save();
    await reloadData();
    return { now, toast: $("toast").textContent };
  });
  ok(stale.now === "design" && /already updated/.test(stale.toast), "a step pressed on an out-of-date page reloads the tasks by itself");

  // Apps Script cuts "//" inside template literals as if it started a comment (write "\/\/" instead)
  const js = fs.readFileSync(path.join(__dirname, "..", "apps-script", "JavaScript.html"), "utf8");
  ok(!(js.match(/`[^`]*`/g) || []).some(t => t.includes("//")), "no // inside template literals (Apps Script would cut the line)");
  ok(errors.length === 0, "no JavaScript errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
