// ============================================================
// TAGIHAN — hitung & terbitkan tagihan pendaftaran / pendaftaran ulang
// Dipakai oleh dashboard Admin (menerbitkan) dan Bendahara (hitung ulang).
// Tarif diambil dari "Setting Biaya" bendahara.
// ============================================================
(function () {
  function periodeSekarang() {
    var w = new Date(Date.now() + 7 * 3600 * 1000);
    return { tahun: w.getUTCFullYear(), semester: (w.getUTCMonth() + 1) >= 7 ? 2 : 1 };
  }
  // Periode aktif = pengaturan di tab Pendaftaran Ulang admin (tahun & semester); kalau belum ada, ikut tanggal sekarang
  async function periodeAktif() {
    try {
      var r = await db.from('daftar_ulang_pengaturan').select('tahun,semester').eq('id', 1).maybeSingle();
      if (r.data && r.data.tahun && r.data.semester) return { tahun: r.data.tahun, semester: r.data.semester };
    } catch (e) {}
    return periodeSekarang();
  }
  // Periode tagihan pendaftaran baru mengikuti TANGGAL JOIN murid (Jan-Jun = Sem 1, Jul-Des = Sem 2)
  function periodeDariTanggal(tgl) {
    var m = /^(\d{4})-(\d{2})/.exec(String(tgl || ''));
    if (!m) return null;
    return { tahun: parseInt(m[1], 10), semester: parseInt(m[2], 10) >= 7 ? 2 : 1 };
  }
  function tingkatDari(namaLevel) { return String(namaLevel || '').replace(/\s*\d+\s*$/, '').trim(); }

  async function muatTarif() {
    var t = { daftar: {}, daftarTK: null, daftarCal: {}, du: {}, duTK: null, duCal: {} };
    var q = await Promise.all([
      db.from('pengaturan_biaya').select('*'),
      db.from('pengaturan_biaya_tk').select('*').limit(1),
      db.from('pengaturan_biaya_calistung').select('*'),
      db.from('pengaturan_biaya_daftar_ulang').select('*'),
      db.from('pengaturan_biaya_daftar_ulang_tk').select('*').limit(1),
      db.from('pengaturan_biaya_daftar_ulang_calistung').select('*')
    ]);
    (q[0].data || []).forEach(function (r) { t.daftar[String(r.jilid)] = r; });
    t.daftarTK = (q[1].data || [])[0] || null;
    (q[2].data || []).forEach(function (r) { t.daftarCal[r.tingkat] = r; });
    (q[3].data || []).forEach(function (r) { t.du[String(r.jilid)] = r; });
    t.duTK = (q[4].data || [])[0] || null;
    (q[5].data || []).forEach(function (r) { t.duCal[r.tingkat] = r; });
    return t;
  }

  // level = { jilid, nama_level }  (jilid null => program non-Mandarin, pakai tingkat dari nama_level)
  function hitung(tarif, jenis, level) {
    var row = null, label, isMandarin = level.jilid !== null && level.jilid !== undefined;
    if (isMandarin) {
      var j = Number(level.jilid);
      label = j === 0 ? 'TK' : 'Jilid ' + j;
      if (jenis === 'pendaftaran') row = j === 0 ? tarif.daftarTK : tarif.daftar[String(j)];
      else row = j === 0 ? tarif.duTK : tarif.du[String(j)];
    } else {
      label = tingkatDari(level.nama_level);
      row = jenis === 'pendaftaran' ? tarif.daftarCal[label] : tarif.duCal[label];
    }
    var n = function (v) { return Number(v || 0); };
    var rincian;
    if (!row) {
      return { label: label || '-', rincian: [], total: 0, catatan: 'Tarif ' + (label || 'level ini') + ' belum diatur di Setting Biaya' };
    }
    if (jenis === 'pendaftaran') {
      rincian = [
        { label: 'Biaya Pendaftaran', jumlah: n(row.biaya_pendaftaran) },
        { label: 'Iuran Bulan Pertama', jumlah: n(row.biaya_bulanan) },
        { label: 'Uang Kas', jumlah: n(row.uang_kas_semester) },
        { label: 'Uang Buku', jumlah: n(row.uang_buku) }
      ];
    } else {
      rincian = [
        { label: 'Biaya Daftar Ulang', jumlah: n(row.biaya_daftar_ulang) },
        { label: 'Iuran Bulanan', jumlah: n(row.iuran_bulanan) },
        { label: 'Uang Kas', jumlah: n(row.kas) },
        { label: 'Uang Buku', jumlah: n(row.biaya_buku) }
      ];
    }
    var total = rincian.reduce(function (s, r) { return s + r.jumlah; }, 0);
    return { label: label, rincian: rincian, total: total, catatan: total === 0 ? 'Tarif ' + label + ' bernilai 0 — cek Setting Biaya' : null };
  }

  // Terbitkan 1 tagihan pendaftaran saat murid resmi masuk kelas. Tidak menimpa tagihan yang sudah Lunas.
  async function terbitkanPendaftaran(siswaId, kelas, ctx) {
    ctx = ctx || {};
    var tarif = ctx.tarif || await muatTarif();
    var p = ctx.periode;
    if (!p) {
      // periode pendaftaran murid (ditentukan admin) > tanggal join > periode aktif
      var sj = await db.from('siswa').select('tanggal_join,periode_daftar_tahun,periode_daftar_semester').eq('id', siswaId).maybeSingle();
      var d = sj.data || {};
      if (d.periode_daftar_tahun && d.periode_daftar_semester) p = { tahun: d.periode_daftar_tahun, semester: d.periode_daftar_semester };
      else p = periodeDariTanggal(ctx.tanggal_join !== undefined ? ctx.tanggal_join : d.tanggal_join) || await periodeAktif();
    }
    var h = hitung(tarif, 'pendaftaran', { jilid: kelas.jilid, nama_level: kelas.nama_level });
    var user = (await db.auth.getUser()).data.user;
    var ada = await db.from('tagihan').select('id,status').eq('siswa_id', siswaId).eq('jenis', 'pendaftaran').eq('tahun', p.tahun).eq('semester', p.semester).maybeSingle();
    if (ada.data && ada.data.status === 'lunas') return { status: 'dilewati', hasil: h };
    var row = {
      siswa_id: siswaId, kelas_id: kelas.id || null, program_id: kelas.program_id || null, jenis: 'pendaftaran',
      tahun: p.tahun, semester: p.semester, level_label: h.label, rincian: h.rincian, total: h.total,
      catatan: h.catatan, dibuat_oleh: user ? user.id : null, updated_at: new Date().toISOString()
    };
    var r = await db.from('tagihan').upsert(row, { onConflict: 'siswa_id,jenis,tahun,semester' });
    if (r.error) throw new Error(r.error.message);
    return { status: 'ok', hasil: h, periode: p };
  }

  // items: [{siswa_id, kelas:{id,program_id}, level:{jilid,nama_level}, catatan}]
  async function terbitkanDaftarUlang(items, periode) {
    var tarif = await muatTarif();
    var user = (await db.auth.getUser()).data.user;
    var ids = items.map(function (i) { return i.siswa_id; });
    var existing = {};
    for (var i = 0; i < ids.length; i += 100) {
      var r = await db.from('tagihan').select('siswa_id,status').eq('jenis', 'daftar_ulang').eq('tahun', periode.tahun).eq('semester', periode.semester).in('siswa_id', ids.slice(i, i + 100));
      if (r.error) throw new Error(r.error.message);
      (r.data || []).forEach(function (x) { existing[x.siswa_id] = x.status; });
    }
    var rows = [], baru = 0, diperbarui = 0, lunas = 0, tanpaTarif = {};
    items.forEach(function (it) {
      if (existing[it.siswa_id] === 'lunas') { lunas++; return; }
      var h = hitung(tarif, 'daftar_ulang', it.level);
      if (!h.total) tanpaTarif[h.label] = true;
      if (existing[it.siswa_id]) diperbarui++; else baru++;
      var cat = [h.catatan, it.catatan].filter(Boolean).join(' · ') || null;
      rows.push({
        siswa_id: it.siswa_id, kelas_id: it.kelas.id || null, program_id: it.kelas.program_id || null, jenis: 'daftar_ulang',
        tahun: periode.tahun, semester: periode.semester, level_label: h.label, rincian: h.rincian, total: h.total,
        catatan: cat, dibuat_oleh: user ? user.id : null, updated_at: new Date().toISOString()
      });
    });
    for (var k = 0; k < rows.length; k += 100) {
      var u = await db.from('tagihan').upsert(rows.slice(k, k + 100), { onConflict: 'siswa_id,jenis,tahun,semester' });
      if (u.error) throw new Error(u.error.message);
    }
    return { baru: baru, diperbarui: diperbarui, lunas: lunas, tanpaTarif: Object.keys(tanpaTarif) };
  }

  // Hitung ulang 1 tagihan 'belum' memakai tarif terbaru (dipakai bendahara)
  async function hitungUlang(row, level) {
    var tarif = await muatTarif();
    var h = hitung(tarif, row.jenis, level);
    var u = await db.from('tagihan').update({ level_label: h.label, rincian: h.rincian, total: h.total, catatan: h.catatan, updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'belum');
    if (u.error) throw new Error(u.error.message);
    return h;
  }

  window.Tagihan = { periodeSekarang: periodeSekarang, periodeAktif: periodeAktif, periodeDariTanggal: periodeDariTanggal, muatTarif: muatTarif, hitung: hitung, terbitkanPendaftaran: terbitkanPendaftaran, terbitkanDaftarUlang: terbitkanDaftarUlang, hitungUlang: hitungUlang };
})();
