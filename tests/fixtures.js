// Sample links & tasks used only by test.js (injected into preview.html, never part of the app).
// Every item follows the app rules: real projects, allowed content types, KRR-only Event Attribute.
// Spreads a demo task's history over the past "ago" days, so the dates are not all "today"
function backdateTask(id, ago) {
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

function loadTestData() {
  const day = n => Utilities.formatDate(new Date(Date.now() + n * 864e5));
  // Start from empty, so old preview data never mixes with the demo
  ["Links", "Tasks"].forEach(name => { mockSheet(name).data = []; mockSheet(name).save(); });
  [
    { title: "GTR Competitor Analysis Deck", url: "https://docs.google.com/presentation/d/demo-gtr/edit", category: "Google Slide", project: "GTR", status: "In Review", deadline: day(1), purpose: "Market & competitor mapping for client pitch", pinned: true,
      versions: [{ label: "Part 2", url: "https://docs.google.com/presentation/d/demo-gtr-2/edit" }] },
    { title: "KRR Content Calendar", url: "https://docs.google.com/spreadsheets/d/demo-krr/edit", category: "Google Spreadsheets", project: "KRR", status: "Done", deadline: day(-3), purpose: "Instagram feeds for November" },
    { title: "Makuta Caption Bank December", url: "https://docs.google.com/document/d/demo-makuta/edit", category: "Google Docs", project: "Makuta", status: "Revision", deadline: day(-1), purpose: "Caption drafts for December organic posts" },
    { title: "VTB Teaser Cut", url: "https://drive.google.com/file/d/demo-vtb/view", category: "CTC-Video [VG-Anno]", project: "VTB", status: "In Progress", deadline: day(5), purpose: "30s CTC teaser for Reels" },
    { title: "Makuta Reels CTC December", url: "https://drive.google.com/file/d/demo-makuta-reels/view", category: "CTC-Video [VG-Arif]", project: "Makuta", status: "In Review", deadline: day(4), purpose: "CTC for the December shooting video" },
    { title: "KRR Exhibition Assets", url: "https://drive.google.com/drive/folders/demo-krr-event", category: "Drive Folder", project: "KRR", status: "In Progress", deadline: day(8), purpose: "Flyer, countdown posts and reels for the KRR exhibition" },
    { title: "Moodboard references", url: "https://pinterest.com/demo-board", category: "Reference", project: "REFERENCE", status: "Draft", purpose: "Visual references for December content" },
  ].forEach(l => GAS.addLink(l));
  // Tasks: each content type a project makes, for ADS (November) and ORG (December).
  // VTB & KRR: Static + Video (Shooting). GTR: Static + Video (Non-Shooting). Makuta: organic only, all types,
  // videographer chosen per video. KRR also has an Event Attribute task for its exhibition.
  // [task, days ago it was created, moves]: "a" = advance, "r:<step>|<note>" = QC asks for a revision
  // (QC Client always goes back to Obi), "s:<step>" = Obi passes a client revision on
  const S = "Static", VS = "Video (Shooting)", VN = "Video (Non-Shooting)";
  const a = n => Array(n).fill("a");
  [
    // VTB
    [{ title: "BRIEF ADS NOVEMBER VTB", project: "VTB", type: S, deadline: "2026-11-18", notes: "Carousel 5 slide: promo cicilan" }, 6, a(3)],
    [{ title: "VIDEO CTC ADS NOVEMBER VTB", project: "VTB", type: VS, deadline: "2026-11-14" }, 9, a(8)],
    [{ title: "BRIEF ORG DECEMBER VTB", project: "VTB", type: S, deadline: "2026-12-04" }, 3, a(1)],
    [{ title: "VIDEO CTC ORG DECEMBER VTB", project: "VTB", type: VS, deadline: "2026-12-09" }, 4, a(2)],
    // KRR
    [{ title: "BRIEF ADS NOVEMBER KRR", project: "KRR", type: S, deadline: "2026-11-16" }, 7, [...a(5), "r:|Client: harga promo di slide 3 diganti", "s:design"]],
    [{ title: "VIDEO CTC ADS NOVEMBER KRR", project: "KRR", type: VS, deadline: "2026-11-13" }, 10, [...a(8), "r:|Client: ganti musik dan potong durasi jadi 30 detik"]],
    [{ title: "BRIEF ORG DECEMBER KRR", project: "KRR", type: S, deadline: "2026-12-03" }, 5, ["a", "r:brief|Tambahkan USP lokasi di slide 2", "a", "a"]],
    [{ title: "VIDEO CTC ORG DECEMBER KRR", project: "KRR", type: VS, deadline: "2026-12-11" }, 3, a(3)],
    [{ title: "EVENT ORG DECEMBER KRR", project: "KRR", type: "Event Attribute", deadline: "2026-12-20", notes: "Pameran KRR di mall, booth 2x3 m" }, 4, a(2), ["Countdown H-5", "Flyer Cetak"]],
    // Makuta (organic only)
    [{ title: "BRIEF ORG DECEMBER MAKUTA", project: "Makuta", type: S, deadline: "2026-12-01", notes: "Single image: ucapan Hari Ibu" }, 12, [...a(5), "r:|Client: ganti foto utama", "s:design", ...a(4)]],
    [{ title: "VIDEO CTC ORG DECEMBER MAKUTA", project: "Makuta", type: VS, videographer: "Arif", deadline: "2026-12-10" }, 5, a(4)],
    [{ title: "VIDEO CTC ORG DECEMBER MAKUTA", project: "Makuta", type: VN, videographer: "Anno", deadline: "2026-12-15" }, 2, a(1)],
    // GTR
    [{ title: "BRIEF ADS NOVEMBER GTR", project: "GTR", type: S, deadline: "2026-11-10" }, 8, a(4)],
    [{ title: "VIDEO CTC ADS NOVEMBER GTR", project: "GTR", type: VN, deadline: "2026-11-07" }, 14, a(10)],
    [{ title: "BRIEF ORG DECEMBER GTR", project: "GTR", type: S, deadline: "2026-12-06" }, 6, [...a(5), "r:|Client: logo diperbesar", "s:design", "a"]],
    [{ title: "VIDEO CTC ORG DECEMBER GTR", project: "GTR", type: VN, deadline: "2026-12-14" }, 7, [...a(4), "r:video|Transisi kurang smooth di detik 10-15", "a"]],
  ].forEach(([data, ago, moves, ticked = []]) => {
    let t = GAS.addTask(Object.assign({ notes: "" }, data));
    moves.forEach(m => {
      const [to, note] = m.slice(2).split("|");
      t = m === "a" ? GAS.moveTask(t.id, "advance")
        : m.startsWith("s:") ? GAS.moveTask(t.id, "assign", { to })
        : GAS.moveTask(t.id, "revise", { to, note });
    });
    ticked.forEach(item => GAS.setTaskItem(t.id, item, true));
    backdateTask(t.id, ago);
  });
  loadData();
  toast("Test data loaded");
}
