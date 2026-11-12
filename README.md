# Makuta Links Center

Website untuk menyimpan semua link pekerjaan di satu tempat. Datanya tersimpan permanen di **Google Sheet**, dan website-nya di-host oleh **Google Apps Script**, jadi bisa dibuka dari laptop maupun HP.

## Isi folder

| Folder / File | Keterangan |
|---|---|
| `apps-script/Code.gs` | Kode server (baca/tulis data ke Google Sheet) |
| `apps-script/Index.html` | Struktur halaman |
| `apps-script/Styles.html` | Tampilan (warna, dark/light mode) |
| `apps-script/JavaScript.html` | Logika halaman (form, filter, pencarian, dll.) |
| `local-preview/preview.html` | Untuk mencoba website secara lokal sebelum setup Google Sheets. Data hanya tersimpan di browser. |
| `local-preview/build-preview.js` | Membuat ulang `preview.html` kalau kode di `apps-script/` diubah: `node build-preview.js` |
| `web/index.html` | Halaman Vercel yang menampilkan aplikasi di alamat makuta-links-center.vercel.app |
| `tests/` | Tes otomatis (Chrome headless) untuk semua alur dan tombol. Lihat bagian **Tes otomatis**. |

> **`apps-script/` adalah sumber utama.** `preview.html` dibuat dari file-file itu, jadi jangan edit `preview.html` langsung — edit `apps-script/`, lalu jalankan `node build-preview.js`.

## Mencoba di lokal
Buka `local-preview/preview.html` langsung di browser. Datanya tersimpan di browser itu saja (bukan di Google Sheet) dan mulai kosong. Tombol **Clear all data** di banner ungu mengosongkan semuanya.

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

### 4. Beri izin (authorize) dan buat sheet-nya
1. Di editor, buka **Code.gs**. Di toolbar atas, pada dropdown fungsi pilih **getInitialData** → klik **Run**.
2. Muncul "Authorization required" → **Review permissions** → pilih akun pribadimu.
3. Muncul "Google hasn't verified this app" → klik **Advanced → Go to Makuta Links Center (unsafe)** → **Allow**. (Ini normal, karena aplikasinya buatan kamu sendiri. Izin yang diminta: Google Sheets dan Google Calendar untuk reminder deadline.)
4. Tunggu sampai **Execution log** menulis "Execution completed".
5. Kembali ke tab spreadsheet: sekarang ada sheet **Links** dan **Tasks** dengan judul kolom (masih kosong). Sheet bawaan "Sheet1" boleh dihapus (klik kanan tab → Delete).

### 5. Deploy sebagai Web App
1. Di Apps Script, klik **Deploy → New deployment**.
2. Klik ikon roda gigi di samping "Select type" → pilih **Web app**.
3. Isi:
   - Description: `v1`
   - Execute as: **Me (email pribadimu)**
   - Who has access: **Only myself** (supaya hanya kamu yang bisa membuka)
4. Klik **Deploy**. (Kalau diminta authorize lagi, ulangi langkah 4.2–4.3.)
5. Salin **Web app URL** (berakhiran `/exec`). Inilah alamat website kamu: **bookmark** URL ini, dan buka juga di HP (login akun pribadi yang sama) kalau mau.

### 6. Pasang tombol Quick Save (opsional, sangat disarankan)
1. Buka Web app URL → klik **Quick Save Button**.
2. Tampilkan bookmarks bar (Ctrl + Shift + B), lalu drag tombol **+ Save to Makuta** ke bookmarks bar.
3. Saat sedang membuka Figma / Canva / Google Drive / dll., klik bookmark itu → form terbuka dengan link & judul sudah terisi.

### 7. Cek cepat setelah setup
- [ ] Submit 1 link percobaan dengan deadline 3 hari lagi → muncul popup ceklis hijau.
- [ ] Buka Google Sheet → sheet **Links** berisi link tadi.
- [ ] Buka Google Calendar → ada event `[MAKUTA] Due in 2 days: ...` dan `[MAKUTA] Due tomorrow: ...` jam 09:00.
- [ ] Tab **All Links** → link muncul; coba Edit, Pin, lalu Delete (event di Calendar ikut terhapus).
- [ ] Klik **Export to Excel** → file `.xlsx` terunduh.
- [ ] Tab **Milestones** → buat 1 task → sheet **Tasks** berisi task tadi; coba klik tombol step-nya, lalu Delete.
- [ ] Klik **Open Google Sheet** → spreadsheet terbuka.

---

## GitHub & Vercel
- Kode disimpan di GitHub: https://github.com/Biyooshi/Makuta-Links-Center
- Alamat aplikasi: **https://makuta-links-center.vercel.app**. Vercel tidak menjalankan aplikasinya; `web/index.html` hanya menampilkan Web app Apps Script (`/exec`) di dalam halaman Vercel (iframe), jadi alamat di browser tetap `vercel.app`. Data tetap di Google Sheet.
- Supaya bisa ditampilkan di Vercel, `doGet` di `Code.gs` memakai `setXFrameOptionsMode(ALLOWALL)`.
- Harus login akun Google pribadi di browser yang sama. Kalau halaman Vercel kosong/error (biasanya karena browser memblokir cookie pihak ketiga, misalnya di Incognito), buka langsung URL `/exec`, atau izinkan cookie untuk `makuta-links-center.vercel.app`.
- Kalau Web app URL berubah (membuat *New deployment* baru, bukan *New version*), ganti `APP_URL` di `web/index.html`, lalu push ke GitHub. Vercel otomatis memperbarui.
- Mengubah kode di GitHub **tidak** otomatis mengubah Apps Script. Kode tetap perlu di-paste ke Apps Script (lihat di bawah).

## Kalau nanti kode diubah / di-update
1. Paste kode baru ke file yang sesuai di Apps Script → Save.
2. **Deploy → Manage deployments** → klik ikon pensil → Version: **New version** → **Deploy**.
3. URL website **tetap sama**, tidak perlu bookmark ulang.

> Tanpa langkah 2, website tetap menjalankan kode versi lama.

> Kalau update-nya butuh izin baru (misalnya akses **Google Calendar** untuk reminder deadline), Google akan minta **Authorize access** lagi. Cara paling gampang: di editor Apps Script pilih fungsi `getInitialData` → klik **Run** → ikuti langkah authorize seperti di Setup langkah 4.

## Reminder deadline (Google Calendar)
- Setiap link yang punya **Deadline** otomatis dibuatkan 2 event di Google Calendar utama kamu: **H-2** dan **H-1**, jam **09:00**, dengan notifikasi popup.
- Judul event diawali `[MAKUTA]`, contoh: `[MAKUTA] Due in 2 days: GTR Competitor Analysis Deck (GTR)` dan `[MAKUTA] Due tomorrow: ...`.
- Kalau deadline/judul/status diubah, reminder lama dihapus dan dibuat ulang. Kalau status jadi **Done** atau link dihapus, reminder-nya ikut dihapus.
- Reminder yang waktunya sudah lewat tidak dibuat (contoh: deadline diisi besok sore → hanya H-1 kalau belum lewat jam 09:00 hari ini).
- Jam mengikuti time zone project Apps Script (**Project Settings → Time zone**), pastikan diset ke `(GMT+07:00) Jakarta` (Setup langkah 2).

## Milestones (timeline pekerjaan konten)
Tab **Milestones** berisi setiap task konten, dikelompokkan per project, lengkap dengan timeline step-nya. Datanya tersimpan di sheet **Tasks** (dibuat otomatis). Untuk sementara Milestones terpisah dari Links Center.

- **+ New Task** → isi judul, project, content type, deadline.
  - Format judul: `[BRIEF / VIDEO CTC / EVENT] [ORG / ADS] [BULAN] [PROJECT]`, contoh `BRIEF ADS NOVEMBER KRR`, `VIDEO CTC ORG NOVEMBER VTB`, atau `EVENT ORG DECEMBER KRR`.
  - **ORG / ADS dibaca dari judul** (wajib salah satu). Project otomatis terpilih kalau kodenya ada di judul. Kalau judul bilang VIDEO CTC tapi content type Static (atau sebaliknya), form memberi peringatan.
  - Content type per project:

    | Project | Content type | Catatan |
    |---|---|---|
    | 🏙️ VTB | Static, Video (Shooting) | |
    | 🌴 KRR | Static, Video (Shooting), Event Attribute | Event Attribute hanya untuk KRR (pameran / event) |
    | 👑 Makuta | Static, Video (Shooting), Video (Non-Shooting) | Organic only (wajib ORG) |
    | 🏡 GTR | Static, Video (Non-Shooting) | Video Shooting masih pending |

  - **Graphic Designer otomatis** dari project (VTB = Ilham, KRR = Alfid, Makuta = Alfid, GTR = Wawan).
  - **Videographer:** VTB, KRR, dan GTR otomatis **Anno**; Arif hanya bisa dipilih lewat **Edit**. **Makuta tidak punya videographer tetap**, jadi setiap task video Makuta **wajib memilih** Anno atau Arif saat dibuat.
  - **Event Attribute (KRR):** satu task berisi semua kebutuhan pameran/event: **Countdown H-5, Countdown H-2, Countdown D-Day, Flyer Cetak, Video Reels Pameran**. Alurnya sama dengan Static. Kolom deadline berubah jadi **Event Date (D-Day)** dan wajib diisi; tanggal countdown dihitung mundur dari tanggal itu (contoh event 20 Des → H-5 = 15 Des, H-2 = 18 Des). Di kartu task ada checklist untuk mencentang setiap item yang sudah selesai.
- Step yang dilalui otomatis menyesuaikan:
  - Static: Drafting Brief (Obi) → QC Internal: Brief (Kak Hendra / Bu Riska) → Design → QC Internal: Content → Send to Client (Kak Faza) → QC Client → Scheduling Post (ORG, Obi via Meta Business Suite) / Run Ads (ADS, Musthofa)
  - Video (Shooting): … → QC Internal: Brief → **Shooting (Obi & videographer)** → CTC → **QC Internal: CTC** → Motion / ToV (designer) → QC Internal: Content → …
  - Video (Non-Shooting): … → QC Internal: Brief → **Voice Over (Bu Riska)** → CTC → QC Internal: CTC → Motion / ToV → …
  - Graphic designer baru mengerjakan ToV setelah CTC di-approve QC Internal.
- Tombol di tiap task:
  - Step biasa → tombol "… Done →" untuk lanjut ke step berikutnya.
  - Step QC Internal → **Approve** atau **Request Revision** (pilih step yang harus revisi + catatan). Revisi langsung ke orangnya; setelah dikerjakan, task langsung kembali ke QC berikutnya (revisi CTC → QC CTC → designer → QC Content).
  - **QC Client → Request Revision** selalu kembali ke **Obi** dulu (step "Client Revision"). Obi lalu klik **Send to Videographer (CTC)** atau **Send to Graphic Designer** (Motion / ToV / design). Setelah dikerjakan → QC Internal → Kak Faza → QC Client lagi.
  - Selama revisi berjalan, step dari titik revisi sampai QC yang meminta revisi berwarna **merah**. Setelah QC itu approve lagi, timeline kembali hijau. Step "Client Revision" tetap tampil di timeline sebagai catatan.
  - **Undo** membatalkan langkah terakhir kalau salah klik. **History** menampilkan semua langkah + tanggal + catatan revisi.
- Nama orang, emoji, content type, dan organic only per project diatur di bagian atas `Code.gs` (`PROJECTS`, `VIDEOGRAPHERS`, `STAGES`). Edit di sana kalau tim berubah, lalu deploy **New version**.
- Di sheet **Tasks**, kolom **Current Step** dan **Revisions** hanya untuk dibaca; perubahan step dilakukan lewat tombol di website (kolom **History** dan **Checklist** jangan diedit manual).

## Tentang data di Google Sheet
- Data ada di sheet **Links**. Kamu boleh melihat/mengedit langsung di sana, tapi:
  - Jangan ubah **baris 1 (judul kolom)** dan kolom **ID**.
  - Kolom **Status** sebaiknya salah satu dari: Draft, In Progress, In Review, Revision, Done (huruf besar/kecil tidak masalah).
  - Kolom **Category** untuk CTC-Video berisi sumber editornya, contoh `CTC-Video [VG-Arif]` atau `CTC-Video [VG-Anno]`.
  - Link dengan kategori **Reference** selalu masuk project **REFERENCE** (diisi otomatis dan dikunci di form). Nama project REFERENCE tidak bisa dipakai untuk kategori lain.
  - Kolom **Reminder IDs** dipakai untuk menghapus/memperbarui event di Google Calendar — jangan diubah manual.
  - Kolom **Deadline** formatnya `yyyy-mm-dd` (contoh `2026-11-20`).
  - Kolom **Related Links**: satu link per baris, format `Label | https://link`.
- Teks disimpan sebagai teks biasa, jadi nilai seperti `001`, `50%`, atau `12/11` tidak akan diubah otomatis oleh Google Sheets.
- Kalau sheet **Links** terhapus atau dikosongkan, website akan membuatnya lagi (dengan judul kolom) secara otomatis.

## Troubleshooting
- **"Sorry, unable to open the file at present"** → biasanya karena login lebih dari 1 akun Google di browser. Buka URL-nya di jendela Incognito / profil Chrome yang hanya login ke akun pemilik.
- **Export to Excel tidak mengunduh apa-apa** → butuh koneksi internet (library Excel dimuat saat tombol diklik). Alternatif: buka Google Sheet → File → Download → Microsoft Excel.
- **Quick Save membuka URL yang berakhiran `/dev`** → buka popup Quick Save Button lagi dari URL `/exec`, lalu pasang ulang bookmark-nya.
- **Perubahan kode tidak muncul** → pastikan sudah membuat **New version** di Manage deployments (lihat bagian update).
