// Demo data for the local preview only (never part of the real app): links, and tasks in every project
// at different steps. Each step is pressed by the account whose step it is, so History and the owner's
// Activity log show real names. Change DEMO_VERSION to load it again in browsers that already have it.
const DEMO_VERSION = "links-2";
const DEMO_WRITERS = { VTB: "obi", KRR: "obi", Makuta: "obi", GTR: "obi", GM: "puput", HC: "puput", LUX: "puput" };
const DEMO_DESIGNERS = { VTB: "ilham", KRR: "alfid", Makuta: "alfid", GTR: "wawan", GM: "wawan", HC: "ilham", LUX: "wawan" };
const DEMO_MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
let demoQcTurn = 0;

// Whose button the task's current step is (QC takes turns between Kak Hendra and Bu Riska)
function demoActor(t) {
  if (["qcBrief", "qcCut", "qcContent"].includes(t.stage)) return ["hendra", "riska"][demoQcTurn++ % 2];
  if (["design", "motion"].includes(t.stage)) return DEMO_DESIGNERS[t.project];
  if (["toClient", "qcClient", "ads"].includes(t.stage)) return "faza";
  return DEMO_WRITERS[t.project];
}

// The link a step hands on: one brief per project, month and channel; a new result after every revision
function demoLink(t) {
  if (t.stage === "brief") return `https://docs.google.com/document/d/demo-brief-${(t.project + "-" + (t.workMonth || t.id) + "-" + (t.channel || "x")).toLowerCase()}/edit`;
  if (!["design", "motion"].includes(t.stage)) return "";
  const version = t.history.filter(e => e.link && e.from === t.stage).length + 1;
  return `https://drive.google.com/drive/folders/demo-result-${t.id.toLowerCase()}-v${version}`;
}

function demoTask(id) {
  GAS.actAs("owner");
  return GAS.getTasks().find(t => t.id === id);
}

// "a" = the current step is done / approved, "r:<step>|<note>" = QC sends it back,
// "s:<step>" = the content writer passes a client revision on, "end" = advance until done
function demoMoves(id, moves) {
  moves.forEach(m => {
    if (m === "end") {
      while (demoTask(id).stage !== "done") demoMoves(id, ["a"]);
      return;
    }
    const t = demoTask(id);
    GAS.actAs(demoActor(t));
    const [to, note] = m.slice(2).split("|");
    if (m === "a") GAS.moveTask(id, "advance", demoLink(t) ? { link: demoLink(t) } : {});
    else if (m.startsWith("s:")) GAS.moveTask(id, "assign", { to });
    else GAS.moveTask(id, "revise", { to, note });
  });
}

// "2026-11" plus n months
function demoMonth(n) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// A Monthly Brief made by the project's writer: { "BRIEF ORG": id, "VIDEO ADS": id, "VIDEO NS ORG": id, ... }
function demoMonthly(project, workMonth, types, channels, deadline, videographers = {}) {
  const both = types.filter(t => t.startsWith("Video")).length > 1;
  const list = [];
  channels.forEach(ch => types.forEach(type => {
    const d = new Date(Number(workMonth.slice(0, 4)), Number(workMonth.slice(5, 7)) - 1 + (ch === "ORG" ? 1 : 0), 1);
    const kind = type === "Static" ? "BRIEF" : both && type === "Video (Non-Shooting)" ? "VIDEO CTC NON-SHOOTING" : "VIDEO CTC";
    list.push({ title: `${kind} ${ch} ${DEMO_MONTHS[d.getMonth()]} ${project.toUpperCase()}`, project, type, deadline,
      videographer: videographers[type] || "", notes: "" });
  }));
  GAS.actAs(DEMO_WRITERS[project]);
  const out = {};
  GAS.addTasks(list, workMonth).forEach(t => {
    const key = (t.type === "Static" ? "BRIEF" : t.type === "Video (Non-Shooting)" && both ? "VIDEO NS" : "VIDEO") + " " + t.channel;
    out[key] = t.id;
  });
  return out;
}

function demoSingle(data) {
  GAS.actAs(DEMO_WRITERS[data.project]);
  return GAS.addTask(Object.assign({ notes: "", deadline: "" }, data)).id;
}

// Spreads a task's history over the past "ago" days, so the dates are not all "now"
function demoBackdate(id, ago) {
  const sheet = mockSheet("Tasks");
  const row = sheet.data.find(r => r[0] === id);
  const history = JSON.parse(row[15]);
  const start = Date.now() - ago * 864e5;
  const gap = ago * 864e5 * 0.85 / Math.max(1, history.length - 1);
  history.forEach((h, i) => h.at = new Date(start + i * gap + (i % 3) * 2 * 36e5).toISOString());
  row[1] = history[0].at;
  row[2] = history[history.length - 1].at;
  row[15] = JSON.stringify(history);
  sheet.save();
}

function loadDemoData() {
  ["Links", "Tasks", "Activity"].forEach(name => { mockSheet(name).data = []; mockSheet(name).save(); });
  demoQcTurn = 0;
  const day = n => Utilities.formatDate(new Date(Date.now() + n * 864e5));
  const now = demoMonth(0), last = demoMonth(-1);
  const S = "Static", VS = "Video (Shooting)", VN = "Video (Non-Shooting)";
  const ago = {};
  const backdate = (ids, days) => Object.values(ids).forEach(id => ago[id] = days);

  // Resources: anyone logged in can add them
  [
    ["obi", { title: "KRR Content Calendar", url: "https://docs.google.com/spreadsheets/d/demo-krr/edit", category: "Google Spreadsheets", project: "KRR", purpose: "Instagram feeds, month by month" }],
    ["obi", { title: "VTB Competitor Analysis Deck", url: "https://docs.google.com/presentation/d/demo-vtb/edit", category: "Google Slide", project: "VTB", pinned: true, purpose: "Market & competitor mapping" }],
    ["alfid", { title: "Makuta Raw Footage", url: "https://drive.google.com/drive/folders/demo-makuta-footage", category: "Drive Folder", project: "Makuta", purpose: "Every shooting, sorted by month" }],
    ["puput", { title: "LUX Brand Guideline", url: "https://drive.google.com/drive/folders/demo-lux", category: "Drive Folder", project: "LUX", purpose: "Logo, colours and fonts" }],
    ["puput", { title: "GM Ads Copy Bank", url: "https://docs.google.com/document/d/demo-gm/edit", category: "Google Docs", project: "GM", purpose: "Headlines and CTAs for the ads" }],
    ["wawan", { title: "GTR Key Visual", url: "https://www.figma.com/file/demo-gtr", category: "Other", project: "GTR", purpose: "Main visual for the campaign" }],
    ["ilham", { title: "HC Moodboard", url: "https://pinterest.com/demo-hc", category: "Reference", project: "REFERENCE", purpose: "Visual references for HC" }],
  ].forEach(([who, link]) => { GAS.actAs(who); GAS.addLink(link); });

  // Last month: finished work
  const luxOld = demoMonthly("LUX", last, [S, VN, VS], ["ORG", "ADS"], day(-20));
  Object.values(luxOld).forEach(id => demoMoves(id, ["end"]));
  backdate(luxOld, 40);
  const krrOld = demoMonthly("KRR", last, [S, VS], ["ADS"], day(-18));
  demoMoves(krrOld["BRIEF ADS"], ["a", "a", "a", "a", "a", "r:|Client: harga promo di slide 3 diganti", "s:design", "end"]);
  demoMoves(krrOld["VIDEO ADS"], ["end"]);
  backdate(krrOld, 38);

  // KRR (Obi · Alfid): briefs approved, design and CTC under way, an exhibition coming up
  const krr = demoMonthly("KRR", now, [S, VS], ["ORG", "ADS"], day(10));
  demoMoves(krr["BRIEF ADS"], ["a"]);
  demoMoves(krr["BRIEF ORG"], ["a"]);
  demoMoves(krr["BRIEF ADS"], ["a"]);          // QC Brief approves all four together
  demoMoves(krr["VIDEO ADS"], ["a"]);          // one shooting for both videos
  demoMoves(krr["BRIEF ADS"], ["a"]);
  demoMoves(krr["VIDEO ADS"], ["a", "a"]);
  backdate(krr, 8);
  const krrEvent = demoSingle({ title: `EVENT ORG ${DEMO_MONTHS[Number(demoMonth(1).slice(5)) - 1]} KRR`, project: "KRR", type: "Event Attribute", deadline: day(12), notes: "Pameran KRR di mall, booth 2x3 m" });
  demoMoves(krrEvent, ["a", "a", "a"]);
  GAS.actAs("alfid");
  GAS.setTaskItem(krrEvent, "Countdown H-5", true);
  ago[krrEvent] = 5;
  const krrFlyer = demoSingle({ title: "FLYER KRR", project: "KRR", type: "Collateral", item: "Flyer", deadline: day(7) });
  demoMoves(krrFlyer, ["a", "a"]);
  ago[krrFlyer] = 3;

  // VTB (Obi · Ilham): the client asked for a revision; a video waits at QC Client
  const vtb = demoMonthly("VTB", now, [S, VS], ["ORG", "ADS"], day(8));
  demoMoves(vtb["BRIEF ADS"], ["a"]);
  demoMoves(vtb["BRIEF ORG"], ["a"]);
  demoMoves(vtb["BRIEF ADS"], ["a"]);
  demoMoves(vtb["VIDEO ADS"], ["a"]);
  demoMoves(vtb["BRIEF ADS"], ["a", "a", "a", "r:|Client: ganti headline promo cicilan", "s:design"]);
  demoMoves(vtb["VIDEO ADS"], ["a", "a", "a", "a", "a"]);
  backdate(vtb, 10);

  // GTR (Obi · Wawan): a voice over is waiting, the ADS static is ready to run
  const gtr = demoMonthly("GTR", now, [S, VN], ["ORG", "ADS"], day(5));
  demoMoves(gtr["BRIEF ADS"], ["a"]);
  demoMoves(gtr["BRIEF ORG"], ["a"]);
  demoMoves(gtr["BRIEF ADS"], ["a"]);
  demoMoves(gtr["VIDEO ADS"], ["a"]);
  demoMoves(gtr["BRIEF ADS"], ["a", "a", "a", "a"]);
  demoMoves(gtr["BRIEF ORG"], ["a"]);
  backdate(gtr, 9);

  // Makuta (Obi · Alfid, organic only): this month's briefs wait for QC
  const makuta = demoMonthly("Makuta", now, [S, VN, VS], ["ORG"], day(14), { [VS]: "Arif", [VN]: "Anno" });
  demoMoves(makuta["BRIEF ORG"], ["a"]);
  backdate(makuta, 3);

  // GM (Puput · Wawan, ADS only): QC sent the design back, the shooting is planned
  const gm = demoMonthly("GM", now, [S, VS], ["ADS"], day(6));
  demoMoves(gm["BRIEF ADS"], ["a", "a", "a", "r:design|Warna CTA kurang kontras"]);
  backdate(gm, 7);
  const gmEvent = demoSingle({ title: `EVENT ADS ${DEMO_MONTHS[Number(now.slice(5)) - 1]} GM`, project: "GM", type: "Event Attribute", deadline: day(20), notes: "Grand opening showroom" });
  ago[gmEvent] = 1;

  // HC (Puput · Ilham, ADS only): just started
  const hc = demoMonthly("HC", now, [S, VS], ["ADS"], day(15));
  backdate(hc, 1);
  const hcBanner = demoSingle({ title: "ROLL-UP BANNER HC", project: "HC", type: "Collateral", item: "Roll-up Banner", deadline: day(9) });
  demoMoves(hcBanner, ["a"]);
  ago[hcBanner] = 2;

  // LUX (Puput · Wawan): videos in CTC, the ADS static is with Kak Faza
  const lux = demoMonthly("LUX", now, [S, VN, VS], ["ORG", "ADS"], day(11));
  demoMoves(lux["BRIEF ADS"], ["a"]);
  demoMoves(lux["BRIEF ORG"], ["a"]);
  demoMoves(lux["BRIEF ADS"], ["a"]);
  demoMoves(lux["VIDEO ADS"], ["a"]);
  demoMoves(lux["BRIEF ADS"], ["a", "a"]);
  demoMoves(lux["VIDEO NS ADS"], ["a"]);
  backdate(lux, 6);

  Object.keys(ago).forEach(id => demoBackdate(id, ago[id]));
  GAS.actAs("owner");
  try { localStorage.setItem(PREVIEW_KEY + ":version", DEMO_VERSION); } catch (e) {}
}
