# Makuta Links Center

Website tim konten Makuta: **Milestones** (timeline setiap task konten, dengan link brief dan result-nya) dan **Resources** (link umum project seperti brand guideline dan moodboard). Setiap orang login dengan akunnya sendiri dan hanya bisa menekan langkah yang menjadi tugasnya. Datanya tersimpan permanen di **Google Sheet**, dan website-nya di-host oleh **Google Apps Script**, jadi bisa dibuka dari laptop maupun HP.

## Akun & hak akses
Password tidak ditulis di kode (repo ini publik). Password akun tim = **username + `PASSWORD_SUFFIX`** (Script Properties), owner memakai `OWNER_USERNAME` / `OWNER_PASSWORD`. Tidak ada fitur lupa / ganti password: untuk mengganti, ubah Script Properties.

Tim awal (sekarang diatur di halaman **Team & Projects**, lihat di bawah):

| Username | Nama | Peran | Project |
|---|---|---|---|
| hendra | Kak Hendra | Managerial | semua |
| riska | Bu Riska | Managerial | semua |
| faza | Kak Faza | Assistant Manager | semua |
| obi | Obi | Content Writer | VTB, KRR, Makuta, GTR |
| puput | Puput | Content Writer | GM, HC, LUX |
| alfid | Alfid | Graphic Designer | KRR, Makuta |
| ilham | Ilham | Graphic Designer | VTB, HC |
| wawan | Wawan | Graphic Designer | GTR, GM, LUX |
| (OWNER_USERNAME) | Owner | Owner | semua, plus tab Admin |

- **Content writer:** Drafting Brief (wajib menempelkan link brief), Client Revision, Shooting, CTC, Voice Over, Scheduling Post. Membuat, mengedit, dan menghapus task project-nya.
- **Graphic designer:** Design dan Motion / ToV (wajib menempelkan link result).
- **Kak Faza:** Send to Client, QC Client, Run Ads (Musthofa).
- **Managerial:** semua QC Internal, dan boleh menekan semua langkah. **Owner:** semuanya, plus tab Admin (siapa yang login, activity log, View as).
- Login diingat 30 hari di browser itu. Salah password 10 kali → akun itu terkunci 15 menit.

## Team & Projects (managerial dan owner)
Menu **Team & Projects** di sidebar dipakai untuk menambah orang, project, dan videografer tanpa mengubah kode. Isinya tersimpan di sheet **Team**, **Projects**, dan **Videographers**. Saat pertama kali dibuka, ketiga sheet ini otomatis diisi dengan tim di atas (tercatat di Script Properties `TEAM_SEEDED`).
- **Tab Team:** tambah orang (nama, username, role). Role yang bisa dipilih: Managerial, Assistant Manager, Content Writer, Graphic Designer. Owner tidak tampil dan tidak bisa ditambah. Password orang baru otomatis **username + `PASSWORD_SUFFIX`**, sama seperti yang lain. Username tidak bisa diganti setelah dibuat; nama dan role bisa.
- **Hanya owner** yang bisa menambah, mengubah, atau mengarsipkan akun **Managerial**. Managerial bisa mengatur role lainnya.
- **Archive, bukan hapus.** Orang yang diarsipkan langsung logout dan tidak bisa login lagi, tetapi riwayatnya tetap ada. **Restore** mengembalikannya. Seseorang tidak bisa diarsipkan (atau diganti role-nya) selama masih menjadi content writer / graphic designer sebuah project aktif. Akun sendiri dan Managerial terakhir juga tidak bisa diarsipkan.
- **Tab Projects:** tambah atau edit project: kode (2–12 huruf/angka, tidak bisa diganti setelah dibuat, dan tidak boleh kata yang dipakai di judul task seperti ORG, ADS, VIDEO, atau nama bulan), emoji, Content Writer, Graphic Designer, Videographer (atau dipilih per video), content type, dan ORG + ADS / ORG only / ADS only. Mengganti writer atau designer langsung berlaku ke task yang sedang berjalan. Project yang diarsipkan disembunyikan bersama task-nya (tetap ada di sheet Tasks), dan kembali saat di-**Restore**.
- **Videographers** (di tab Projects): videografer freelance tanpa login, dipakai di project, task video, dan kategori `CTC-Video [VG-Nama]` di Resources.
- Undo mengenali orang dari username-nya, jadi tetap bisa dipakai setelah namanya diganti.
- Nama QC (`Kak Hendra / Bu Riska`), "via Kak Faza", dan Voice Over (selalu akun `riska`) diambil dari sheet Team, jadi ikut berubah kalau namanya diganti.
- Semua perubahan tercatat di Activity. Kalau sheet Team / Projects / Videographers diedit langsung, perubahannya terlihat di aplikasi paling lambat 10 menit; perubahan lewat halaman Team & Projects langsung terlihat.

## Isi folder

| Folder / File | Keterangan |
|---|---|
| `apps-script/Code.gs` | Kode server (baca/tulis data ke Google Sheet) |
| `apps-script/Index.html` | Struktur halaman |
| `apps-script/Styles.html` | Tampilan (warna, dark/light mode) |
| `apps-script/JavaScript.html` | Logika halaman (form, filter, pencarian, dll.) |
| `local-preview/preview.html` | Untuk mencoba website secara lokal sebelum setup Google Sheets. Data hanya tersimpan di browser. |
| `local-preview/build-preview.js` | Membuat ulang `preview.html` kalau kode di `apps-script/` diubah: `node build-preview.js` |
| `apps-script/appsscript.json` | Pengaturan project Apps Script (zona waktu Jakarta, V8, Web app: Execute as Me, akses Anyone) |
| `.clasp.json` | Script ID project Apps Script, dipakai clasp untuk mengirim kode |
| `.github/workflows/apps-script.yml` | Otomatis: tes → kirim kode ke Apps Script → update Web app, setiap push ke GitHub |
| `web/index.html` | Halaman Vercel yang menampilkan aplikasi di alamat makuta-links-center.vercel.app |
| `tests/` | Tes otomatis (Chrome headless) untuk semua alur dan tombol. Lihat bagian **Tes otomatis**. |

> **`apps-script/` adalah sumber utama.** `preview.html` dibuat dari file-file itu, jadi jangan edit `preview.html` langsung — edit `apps-script/`, lalu jalankan `node build-preview.js`.

## Mencoba di lokal
Buka `local-preview/preview.html` langsung di browser. Isinya data demo yang tersimpan di browser itu saja (bukan di Google Sheet). Login demo: password = username + `demo` (contoh `obi` / `obidemo`), owner `owner` / `owner`. Demo yang dipublikasikan ada di https://biyooshi.github.io/Makuta-Links-Center/ (dibuat dengan `node local-preview/build-preview.js v2 <file>`, branch `gh-pages`).

### Tes otomatis
Jalankan setiap kali selesai mengubah kode, untuk memastikan tidak ada yang rusak:
```
cd tests
npm install      (sekali saja)
npm test
```
Tes ini otomatis membuat ulang `preview.html`, lalu membukanya di Chrome tanpa tampilan dan mengecek semua alur: setiap project × content type × ORG/ADS sampai Done, revisi (QC Internal & client, warna merah/hijau), Undo, Delete, Edit, checklist Event Attribute, videographer, Links, serta tampilan di HP. Hasil akhirnya harus `0 failed`. Data contoh untuk tes ada di `tests/fixtures.js` (hanya dipakai tes, tidak pernah masuk ke aplikasi). Screenshot tersimpan di `tests/screenshots/`. Tes ini tidak menyentuh data preview milikmu (berjalan di profil Chrome terpisah).

---

## Setup di Google Drive pribadi (sekali saja, ±15 menit)

> Yang di-copy ke Apps Script hanya 4 file di folder `apps-script/`. Folder `local-preview/` dan `tests/` tidak perlu diupload.
> Data di `local-preview/preview.html` tidak ikut pindah. Google Sheet mulai kosong.

### 0. Pastikan memakai akun Google pribadi
1. Paling aman: buka **Chrome profile** yang hanya login ke akun pribadi, atau jendela **Incognito** (Ctrl + Shift + N) lalu login akun pribadi saja.
2. Kalau di satu browser login lebih dari satu akun (pribadi + kantor), Apps Script sering salah akun atau muncul error "Sorry, unable to open the file at present".
3. Cek foto profil di kanan atas Google Drive: harus akun pribadi.

### 1. Buat Google Sheet
1. Buka https://drive.google.com → **+ New → Google Sheets → Blank spreadsheet** (boleh di dalam folder pilihanmu).
2. Ganti nama spreadsheet (kiri atas, "Untitled spreadsheet") menjadi **Makuta Links Center**.
3. Klik **File → Settings** → **Time zone**: pilih **(GMT+07:00) Jakarta** → **Save settings**.

### 2. Buka Apps Script
1. Di spreadsheet tadi, klik menu **Extensions → Apps Script**. Tab baru terbuka.
2. Ganti nama project (kiri atas, "Untitled project") menjadi **Makuta Links Center** → **Rename**.
3. Klik ikon roda gigi **Project Settings** (menu kiri):
   - Centang **Enable Chrome V8 runtime** (biasanya sudah tercentang).
   - **Time zone**: pilih **(GMT+07:00) Jakarta**.
4. Kembali ke **Editor** (ikon `< >` di menu kiri).

### 3. Masukkan kode (4 file)
1. File **Code.gs** sudah ada → klik, hapus semua isinya (Ctrl + A, Delete), lalu paste isi `apps-script/Code.gs`.
2. Klik tombol **+** di samping "Files" → **HTML** → ketik nama `Index` (tanpa .html) → Enter → hapus isi bawaannya → paste isi `apps-script/Index.html`.
3. Ulangi: **+ → HTML** → `Styles` → paste isi `apps-script/Styles.html`.
4. Ulangi: **+ → HTML** → `JavaScript` → paste isi `apps-script/JavaScript.html`.
5. Klik ikon **Save** (Ctrl + S). Tidak boleh ada tulisan error merah.

> Nama file harus persis: `Code`, `Index`, `Styles`, `JavaScript` (huruf besar/kecil berpengaruh).
> Pastikan seluruh isi file ter-copy: buka file aslinya (misalnya di Notepad / VS Code) → Ctrl + A → Ctrl + C. Cek bahwa baris terakhir di Apps Script sama dengan baris terakhir file aslinya.

### 4. Beri izin (authorize), buat sheet, dan pasang password
1. Di editor, buka **Code.gs**. Di toolbar atas, pada dropdown fungsi pilih **setup** → klik **Run**.
2. Muncul "Authorization required" → **Review permissions** → pilih akun pribadimu.
3. Muncul "Google hasn't verified this app" → klik **Advanced → Go to Makuta Links Center (unsafe)** → **Allow**. (Ini normal, karena aplikasinya buatan kamu sendiri. Izin yang diminta: Google Sheets, dan Google Calendar untuk menghapus reminder deadline lama dari versi sebelumnya.)
4. Tunggu sampai **Execution log** menulis "Execution completed".
5. Kembali ke tab spreadsheet: sekarang ada sheet **Links**, **Tasks**, dan **Activity** dengan judul kolom (masih kosong). Sheet bawaan "Sheet1" boleh dihapus (klik kanan tab → Delete).
6. Pasang password: di Apps Script klik **Project Settings** (ikon roda gigi) → scroll ke **Script Properties** → **Add script property**, tambahkan tiga ini → **Save script properties**:
   - `PASSWORD_SUFFIX`: akhiran password akun tim (password = username + akhiran ini).
   - `OWNER_USERNAME`: username owner (tidak pernah tampil di aplikasi; di mana-mana tertulis "Owner").
   - `OWNER_PASSWORD`: password owner.
   - Mengganti password: ubah value-nya di Script Properties (tidak perlu deploy ulang). Yang sudah login tetap masuk sampai logout atau 30 hari; owner bisa mengeluarkan semua orang di tab **Admin → Log out everyone else**.

### 5. Deploy sebagai Web App
1. Di Apps Script, klik **Deploy → New deployment**.
2. Klik ikon roda gigi di samping "Select type" → pilih **Web app**.
3. Isi:
   - Description: `v1`
   - Execute as: **Me (email pribadimu)**
   - Who has access: **Anyone** (wajib, supaya bisa tampil di halaman Vercel; datanya tetap dikunci login dari langkah 4)
4. Klik **Deploy**. (Kalau diminta authorize lagi, ulangi langkah 4.2–4.3.)
5. Buka URL-nya → login → aplikasi terbuka.
6. Salin **Web app URL** (berakhiran `/exec`). Inilah alamat website kamu: **bookmark** URL ini, dan buka juga di HP (login akun pribadi yang sama) kalau mau.

### 6. Cek cepat setelah setup
- [ ] Login sebagai owner → tab **Resources** → **+ New → Resource** → simpan 1 link percobaan → sheet **Links** berisi link tadi; coba Edit, Pin, lalu Delete.
- [ ] Klik **Export to Excel** → file `.xlsx` terunduh.
- [ ] Tab **Milestones** → buat 1 task → sheet **Tasks** berisi task tadi; klik **Submit Brief for QC**, tempel link brief → task pindah ke QC; lalu Delete.
- [ ] Tab **Admin** → sesi login dan Activity tercatat.
- [ ] Klik **Sheet** di sidebar → spreadsheet terbuka.

---

## GitHub & Vercel
- Kode disimpan di GitHub: https://github.com/Biyooshi/Makuta-Links-Center
- Alamat aplikasi: **https://makuta-links-center.vercel.app**. Vercel tidak menjalankan aplikasinya; `web/index.html` hanya menampilkan Web app Apps Script (`/exec`) di dalam halaman Vercel (iframe), jadi alamat di browser tetap `vercel.app`. Data tetap di Google Sheet.
- Supaya bisa ditampilkan di Vercel, `doGet` di `Code.gs` memakai `setXFrameOptionsMode(ALLOWALL)`, dan Web app diatur **Who has access: Anyone**. Akses "Only myself" tidak bisa dipakai di Vercel (Google menolak dengan error 401 karena cookie login diblokir di dalam halaman lain).
- Karena itu aplikasi dikunci **login per akun** (Setup langkah 4.6): server menolak semua baca/tulis data tanpa login yang sah, dan hanya menyimpan hash tiket login di Script Properties. Tidak perlu login Google untuk membukanya.
- Kalau Web app URL berubah (membuat *New deployment* baru, bukan *New version*), ganti `APP_URL` di `web/index.html`, lalu push ke GitHub. Vercel otomatis memperbarui.

## Update otomatis (GitHub → Apps Script → Vercel)
Setiap push ke branch `main` yang mengubah `apps-script/`, `tests/`, atau pengaturan deploy:
1. **GitHub Actions** menjalankan semua tes (`tests/`).
2. Kalau semua lulus, kode di `apps-script/` dikirim ke Apps Script dengan **clasp** dan deployment Web app yang sama dinaikkan ke versi baru. URL `/exec` tetap sama. Kalau ada tes yang gagal, Apps Script **tidak** diubah.
3. **Vercel** otomatis memperbarui dirinya sendiri dari GitHub.

Hasilnya bisa dilihat di tab **Actions** di GitHub (centang hijau = sudah live).

- **Jangan edit kode langsung di editor Apps Script**: push berikutnya akan menimpanya. Semua perubahan lewat repo ini. Data di Google Sheet dan password di Script Properties tidak tersentuh.
- Perubahan dicoba dulu di branch `v2` (demo di GitHub Pages, tidak men-deploy apa pun); `main` hanya diperbarui saat siap live.
- Izin login clasp disimpan di **GitHub → Settings → Secrets and variables → Actions** dengan nama `CLASPRC_JSON` (isi file `C:\Users\<nama>\.clasprc.json` setelah `npx @google/clasp@2.4.2 login`).
- Kalau deploy gagal dengan error login / `invalid_grant` (misalnya izin dicabut atau password Google diganti): jalankan lagi `npx @google/clasp@2.4.2 login` di laptop, lalu ganti isi secret `CLASPRC_JSON` dengan isi file `.clasprc.json` yang baru.
- Mencabut akses: https://myaccount.google.com/permissions → hapus akses "clasp".
- Deploy manual dari laptop (kalau perlu): `npx @google/clasp@2.4.2 push --force` lalu `npx @google/clasp@2.4.2 deploy --deploymentId <Deployment ID> --description "manual"`.

## Kalau nanti kode diubah / di-update (cara manual, tanpa GitHub)
1. Paste kode baru ke file yang sesuai di Apps Script → Save.
2. **Deploy → Manage deployments** → klik ikon pensil → Version: **New version** → **Deploy**.
3. URL website **tetap sama**, tidak perlu bookmark ulang.

> Tanpa langkah 2, website tetap menjalankan kode versi lama.

> Kalau update-nya butuh izin baru, Google akan minta **Authorize access** lagi. Cara paling gampang: di editor Apps Script pilih fungsi `setup` → klik **Run** → ikuti langkah authorize seperti di Setup langkah 4.

## Reminder deadline (Google Calendar)
Resources tidak lagi punya status dan deadline (alur kerja ada di Milestones), jadi tidak ada reminder baru. Reminder `[MAKUTA]` dari versi lama dihapus saat link-nya diedit atau dihapus; yang lain hilang sendiri setelah tanggalnya lewat.

## Milestones (timeline pekerjaan konten)
Tab **Milestones** berisi setiap task konten, dikelompokkan per project, lengkap dengan timeline step-nya. Datanya tersimpan di sheet **Tasks** (dibuat otomatis). Halaman **Home** merangkum task yang menunggu kamu, jumlah task per project per tahap, deadline 7 hari ke depan, dan update terbaru.

- **Link brief dan result:** saat **Submit Brief for QC**, content writer wajib menempelkan link brief (satu link untuk Static + Video satu channel di Monthly Brief). Saat **Design Done** / **Motion / ToV Done**, designer wajib menempelkan link result (setelah revisi, link terakhir sudah terisi). Nama langkah Drafting Brief / Design / Motion di timeline bisa diklik untuk membukanya, dan tombol **Open brief** / **Open result** muncul di samping tombol langkah. Kolom sheet: **Brief Link** dan **Result Link**; setiap link juga tercatat di History. Semua link ini terkumpul di **Resources → Brief & result links**.

- **+ Monthly Brief** (cara utama) → pilih project dan **Working Month** (bulan brief dikerjakan), semua task bulan itu dibuat sekaligus dengan judul otomatis.
  - Brief yang dikerjakan di suatu bulan: **ORG untuk bulan berikutnya, ADS untuk bulan itu sendiri**. Contoh dikerjakan November → `BRIEF ORG DECEMBER KRR`, `VIDEO CTC ORG DECEMBER KRR`, `BRIEF ADS NOVEMBER KRR`, `VIDEO CTC ADS NOVEMBER KRR`. Diatur di `BRIEF_MONTHS_AHEAD` (`Code.gs`).
  - Isinya semua content type project (kecuali Event Attribute) untuk ORG dan ADS (Makuta: ORG saja). Task yang sudah ada ditandai **Already exists** dan tidak dibuat lagi; judul dan centang masih bisa diubah.
  - Satu **link brief per channel** (spreadsheet ORG dan spreadsheet ADS terpisah), otomatis masuk ke semua task di channel itu. **Deadline (all tasks)** mengisi semua task, bisa diubah satu per satu.
  - Di Milestones, task-nya tampil per **section** (project + channel + bulan): Static di atas, Video di bawah, masing-masing dengan timeline sendiri.
  - Step yang dikerjakan bersama cukup diklik **sekali**: **Drafting Brief** (Static + Video satu channel), **QC Internal: Brief** (brief ORG + ADS sekaligus; Request Revision → centang ORG / ADS yang revisi, yang tidak dicentang otomatis di-approve), dan **Shooting** (satu shooting per bulan untuk video ORG + ADS). Setelah itu tiap task jalan sendiri. **Undo** pada langkah bersama membatalkannya untuk semua task yang ikut bergerak.
- **+ Single Task** → satu task saja (misalnya Event Attribute): isi judul, project, content type, deadline.
  - Format judul: `[BRIEF / VIDEO CTC / EVENT] [ORG / ADS] [BULAN] [PROJECT]`, contoh `BRIEF ADS NOVEMBER KRR`, `VIDEO CTC ORG NOVEMBER VTB`, atau `EVENT ORG DECEMBER KRR`.
  - **ORG / ADS dibaca dari judul** (wajib salah satu). Project otomatis terpilih kalau kodenya ada di judul. Kalau judul bilang VIDEO CTC tapi content type Static (atau sebaliknya), form memberi peringatan.
  - Content type per project:

    | Project | Content type | Catatan |
    |---|---|---|
    | 🏙️ VTB | Static, Video (Shooting) | |
    | 🌴 KRR | Static, Video (Shooting), Event Attribute | Event Attribute hanya untuk KRR (pameran / event) |
    | 👑 Makuta | Static, Video (Shooting), Video (Non-Shooting) | Organic only (wajib ORG) |
    | 🏡 GTR | Static, Video (Non-Shooting) | Video Shooting masih pending |
    | 🏢 GM | Static, Video (Shooting), Event Attribute | ADS only (wajib ADS) |
    | 🏥 HC | Static, Video (Shooting), Event Attribute | ADS only (wajib ADS) |
    | 💎 LUX | Static, Video (Non-Shooting), Video (Shooting), Event Attribute | ORG + ADS |

  - **Content writer dan graphic designer otomatis** dari project (lihat tabel **Akun & hak akses**).
  - **Videographer:** VTB, KRR, dan GTR otomatis **Anno**; GM, HC, dan LUX otomatis **Arif**; videographer lain hanya bisa dipilih lewat **Edit**. **Makuta tidak punya videographer tetap**, jadi setiap task video Makuta **wajib memilih** Anno atau Arif saat dibuat.
  - **Event Attribute (KRR):** satu task berisi semua kebutuhan pameran/event: **Countdown H-5, Countdown H-2, Countdown D-Day, Flyer Cetak, Video Reels Pameran**. Alurnya sama dengan Static. Kolom deadline berubah jadi **Event Date (D-Day)** dan wajib diisi; tanggal countdown dihitung mundur dari tanggal itu (contoh event 20 Des → H-5 = 15 Des, H-2 = 18 Des). Di kartu task ada checklist untuk mencentang setiap item yang sudah selesai.
  - **Collateral (semua project):** kebutuhan cetak, merchandise, dan website sesuai permintaan client. Satu task untuk satu item: T-Banner, T-Banner Mini, Banner General, Neon Box, Billboard, Flyer, Brosur, Landing Page, Website, Signboard, X Banner, Roll-up Banner, Product Knowledge, Umbul-umbul, Kipas, Topi. Buat lewat **+ Single Task**, pilih **Item**, dan judul terisi otomatis (contoh **FLYER KRR**). Tidak perlu ORG / ADS. Alurnya sama dengan Static dan selesai di **QC Client** (**Approved by Client**), tanpa Scheduling Post / Run Ads. Item tersimpan di kolom **Item** sheet Tasks. Daftar item bisa diubah di `COLLATERAL_ITEMS` (Code.gs).
- Step yang dilalui otomatis menyesuaikan:
  - Static: Drafting Brief (content writer) → QC Internal: Brief (Kak Hendra / Bu Riska) → Design → QC Internal: Content → Send to Client (Kak Faza) → QC Client (ditekan Kak Faza) → Scheduling Post (ORG, content writer via Meta Business Suite) / Run Ads (ADS, Musthofa, ditekan Kak Faza)
  - Video (Shooting): … → QC Internal: Brief → **Shooting (Obi & videographer)** → CTC → **QC Internal: CTC** → Motion / ToV (designer) → QC Internal: Content → …
  - Video (Non-Shooting): … → QC Internal: Brief → **Voice Over (Bu Riska)** → CTC → QC Internal: CTC → Motion / ToV → …
  - Graphic designer baru mengerjakan ToV setelah CTC di-approve QC Internal.
- Tombol di tiap task:
  - Step biasa → tombol "… Done →" untuk lanjut ke step berikutnya.
  - Step QC Internal → **Approve** atau **Request Revision** (pilih step yang harus revisi + catatan). Revisi langsung ke orangnya; setelah dikerjakan, task langsung kembali ke QC berikutnya (revisi CTC → QC CTC → designer → QC Content).
  - **QC Client → Request Revision** selalu kembali ke **Obi** dulu (step "Client Revision"). Obi lalu klik **Send to Videographer (CTC)** atau **Send to Graphic Designer** (Motion / ToV / design). Setelah dikerjakan → QC Internal → Kak Faza → QC Client lagi.
  - Selama revisi berjalan, step dari titik revisi sampai QC yang meminta revisi berwarna **merah**. Setelah QC itu approve lagi, timeline kembali hijau. Step "Client Revision" tetap tampil di timeline sebagai catatan.
  - **Undo** membatalkan langkah terakhir kalau salah klik. **History** menampilkan semua langkah + tanggal + catatan revisi.
- Task yang sudah selesai tetap tampil (abu-abu, di bawah, tidak bisa di-Edit; step terakhir **Live on Ads / Scheduled / Posted** tetap hijau) selama 30 hari setelah selesai (`RECENT_DONE_DAYS` di `JavaScript.html`). Setelah itu hanya tampil lewat filter **Show → Done / All tasks**.
- Filter Milestones: **Show** (Active, My Tasks, Late, Due in 7 days, Done, All, atau per tahap), **Project**, **Month**, dan pencarian (ketik ORG, ADS, Collateral, Event Attribute, nama orang, dll.).
- Orang, project (emoji, content type, ORG / ADS), dan videografer diatur di halaman **Team & Projects**. Langkah-langkah timeline ada di `STAGE_LIST` (`Code.gs`).
- Di sheet **Tasks**, kolom **Current Step** dan **Revisions** hanya untuk dibaca; perubahan step dilakukan lewat tombol di website (kolom **History** dan **Checklist** jangan diedit manual). Kolom **Work Month** dan **For Month** diisi oleh Monthly Brief dan menghubungkan task-task satu bulan; jangan diubah manual. Task lama yang dibuat satu per satu (misalnya `BRIEF ORG DES KRR`) otomatis diubah sekali ke format Monthly Brief saat aplikasi pertama dibuka setelah update: judul dirapikan (`BRIEF ORG DECEMBER KRR`) dan Work Month diisi. Event Attribute dan judul di luar format tidak diubah. Hasilnya tercatat di Script Properties `UPGRADED_MONTHLY_BRIEF`.

## Tentang data di Google Sheet
- Resources ada di sheet **Links**. Kamu boleh melihat/mengedit langsung di sana, tapi:
  - Jangan ubah **baris 1 (judul kolom)** dan kolom **ID**.
  - Kolom **Status** dan **Deadline** hanya berisi data lama; aplikasi tidak memakainya lagi.
  - Kolom **Category** untuk CTC-Video berisi sumber editornya, contoh `CTC-Video [VG-Arif]` atau `CTC-Video [VG-Anno]`.
  - Link dengan kategori **Reference** selalu masuk project **REFERENCE** (diisi otomatis dan dikunci di form). Nama project REFERENCE tidak bisa dipakai untuk kategori lain.
  - Kolom **Reminder IDs** dipakai untuk menghapus reminder lama di Google Calendar — jangan diubah manual.
  - Kolom **Related Links**: satu link per baris, format `Label | https://link`.
- Teks disimpan sebagai teks biasa, jadi nilai seperti `001`, `50%`, atau `12/11` tidak akan diubah otomatis oleh Google Sheets.
- Kalau sheet **Links** terhapus atau dikosongkan, website akan membuatnya lagi (dengan judul kolom) secara otomatis.
- Sheet **Activity** mencatat setiap login dan perubahan (siapa, kapan, apa). Owner melihatnya di tab **Admin**.
- Sheet **Team**, **Projects**, dan **Videographers** diisi lewat halaman Team & Projects. Kolom **Username** / **Code** / **Name** (kolom pertama) jangan diubah manual: task dan login memakainya.

## Troubleshooting
- **"Sorry, unable to open the file at present"** → biasanya karena login lebih dari 1 akun Google di browser. Buka URL-nya di jendela Incognito / profil Chrome yang hanya login ke akun pemilik.
- **Export to Excel tidak mengunduh apa-apa** → butuh koneksi internet (library Excel dimuat saat tombol diklik). Alternatif: buka Google Sheet → File → Download → Microsoft Excel.
- **Perubahan kode tidak muncul** → pastikan sudah membuat **New version** di Manage deployments (lihat bagian update).
- **Login menulis "The accounts are not set up yet"** → `PASSWORD_SUFFIX`, `OWNER_USERNAME`, atau `OWNER_PASSWORD` belum diisi di Script Properties (Setup langkah 4.6).
