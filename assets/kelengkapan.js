// ============================================================
// KELENGKAPAN DATA — pelacak kekurangan pendataan murid & guru
// Dipakai bersama oleh dashboard Admin dan Leader.
// ============================================================
(function () {
  var state = { murid: [], guru: [], totalMurid: 0, totalGuru: 0, tab: 'murid', opts: null };

  function kosong(v) { return v === null || v === undefined || String(v).trim() === '' || String(v).trim() === '-'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function aktifEnr(s) { var l = s.enrollment || []; for (var i = 0; i < l.length; i++) if (l[i].is_active) return l[i]; return null; }
  function gajiAda(g) { var p = g.pengaturan_gaji; if (Array.isArray(p)) p = p[0]; return !!p && p.gaji_per_kelas !== null && p.gaji_per_kelas !== undefined; }

  async function hitung(programId, isMandarin) {
    // murid yang masih menunggu PLACEMENT tidak dihitung
    var plIds = [];
    try {
      var pl = await db.from('placement').select('siswa_id').eq('status', 'menunggu');
      plIds = (pl.data || []).map(function (x) { return x.siswa_id; });
    } catch (e) {}

    var sr = await db.from('siswa')
      .select('*, enrollment(id,is_active,kelas:kelas_id(kode_kelas,jilid,nama_level,program_id))')
      .eq('status', true).order('nomor_induk');
    if (sr.error) throw new Error(sr.error.message);

    var murid = [];
    var semuaMurid = (sr.data || []).filter(function (s) { return plIds.indexOf(s.id) < 0; });
    semuaMurid = semuaMurid.filter(function (s) {
      var ae = aktifEnr(s);
      if (!ae) return true; // murid aktif tanpa kelas: tampil di semua program supaya tidak terlewat
      return !programId || (ae.kelas && ae.kelas.program_id === programId);
    });
    semuaMurid.forEach(function (s) {
      var ae = aktifEnr(s), wajib = [], saran = [];
      if (kosong(s.telepon_ortu)) wajib.push('HP Orang Tua');
      if (kosong(s.tanggal_lahir)) wajib.push('Tanggal Lahir');
      if (kosong(s.tempat_lahir)) wajib.push('Tempat Lahir');
      if (kosong(s.alamat)) wajib.push('Alamat');
      if (kosong(s.tanggal_join)) wajib.push('Tanggal Join');
      if (!ae) wajib.push('Belum punya kelas');
      if (kosong(s.telepon)) saran.push('HP Murid');
      if (isMandarin && kosong(s.nama_mandarin)) saran.push('Nama Mandarin');
      murid.push({ id: s.id, nomor_induk: s.nomor_induk, nama: s.nama_lengkap, kelas: ae && ae.kelas ? ae.kelas.kode_kelas : '—', wajib: wajib, saran: saran });
    });

    var gq = db.from('guru').select('*, pengaturan_gaji(gaji_per_kelas,persentase_bagi_hasil), kelas(id,is_active)').eq('is_active', true).order('nomor_induk');
    if (programId) gq = gq.eq('program_id', programId);
    var gr = await gq;
    if (gr.error) throw new Error(gr.error.message);
    var guru = (gr.data || []).map(function (g) {
      var wajib = [], saran = [];
      if (kosong(g.nomor_induk)) wajib.push('No. Induk');
      if (kosong(g.telepon)) wajib.push('HP');
      if (kosong(g.tanggal_join)) wajib.push('Tanggal Join');
      if (!g.profile_id) wajib.push('Akun login');
      if (!gajiAda(g)) wajib.push('Pengaturan gaji');
      var jml = (g.kelas || []).filter(function (k) { return k.is_active; }).length;
      if (!jml) saran.push('Belum punya kelas aktif');
      return { id: g.id, nomor_induk: g.nomor_induk || '—', nama: g.nama_lengkap, kelas: g.kode_guru || '—', wajib: wajib, saran: saran };
    });

    state.murid = murid; state.guru = guru;
    state.totalMurid = murid.length; state.totalGuru = guru.length;
    return state;
  }

  function jumlahBelumLengkap() {
    return state.murid.filter(function (x) { return x.wajib.length; }).length + state.guru.filter(function (x) { return x.wajib.length; }).length;
  }

  async function perbaruiBadge(opts) {
    try {
      await hitung(opts.programId, opts.isMandarin);
      var el = document.getElementById(opts.badgeId), n = jumlahBelumLengkap();
      if (el) { el.textContent = n; el.style.display = n ? '' : 'none'; }
    } catch (e) { console.warn('kelengkapan badge:', e.message); }
  }

  async function render(rootId, opts) {
    state.opts = opts;
    var root = document.getElementById(rootId);
    root.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280">⏳ Memeriksa kelengkapan data...</div>';
    try { await hitung(opts.programId, opts.isMandarin); }
    catch (e) { root.innerHTML = '<div style="padding:30px;color:#dc2626">Gagal memuat: ' + esc(e.message) + '</div>'; return; }
    var b = document.getElementById(opts.badgeId), n = jumlahBelumLengkap();
    if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
    root.innerHTML =
      '<div id="klSummary" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px"></div>'
      + '<div style="display:flex;gap:6px;margin-bottom:12px;border-bottom:2px solid #f3d6e0">'
      + '<button class="btn btn-primary" id="klTab_murid" style="border-radius:8px 8px 0 0" onclick="Kelengkapan.tab(\'murid\')">👨‍🎓 Murid</button>'
      + '<button class="btn btn-secondary" id="klTab_guru" style="border-radius:8px 8px 0 0" onclick="Kelengkapan.tab(\'guru\')">👩‍🏫 Guru</button></div>'
      + '<div class="toolbar">'
      + '<input class="search-input" id="klSearch" placeholder="🔍 Cari nama / no. induk..." oninput="Kelengkapan.tabel()">'
      + '<select class="filter-select" id="klMode" onchange="Kelengkapan.tabel()"><option value="wajib">Kurang data WAJIB</option><option value="semua">Semua yang kurang (termasuk disarankan)</option><option value="lengkap">Sudah lengkap</option></select>'
      + '<select class="filter-select" id="klField" onchange="Kelengkapan.tabel()"><option value="">Semua kekurangan</option></select>'
      + '<button class="btn btn-secondary" onclick="Kelengkapan.csv()">📥 Unduh CSV</button></div>'
      + '<div class="table-wrap"><table class="table"><thead><tr><th>No. Induk</th><th>Nama</th><th id="klThKelas">Kelas</th><th>Yang kurang</th><th>Aksi</th></tr></thead><tbody id="klBody"></tbody></table></div>'
      + '<div style="font-size:12px;color:#6b7280;margin-top:8px"><span style="color:#dc2626">■ Merah</span> = wajib dilengkapi. <span style="color:#b45309">■ Kuning</span> = disarankan. Murid yang masih menunggu PLACEMENT tidak ikut dihitung.</div>';
    tab(state.tab);
  }

  function ringkasan() {
    function kartu(judul, list, total) {
      var lengkap = list.filter(function (x) { return !x.wajib.length; }).length;
      var pct = total ? Math.round(lengkap * 100 / total) : 100, bg = pct === 100 ? '#dcfce7' : (pct >= 80 ? '#fef3c7' : '#fee2e2'), fg = pct === 100 ? '#16a34a' : (pct >= 80 ? '#b45309' : '#dc2626');
      return '<div style="background:' + bg + ';color:' + fg + ';border-radius:10px;padding:12px 18px;min-width:200px"><div style="font-size:22px;font-weight:700">' + pct + '%</div><div style="font-size:12px;font-weight:600">' + judul + ' lengkap</div><div style="font-size:12px">' + lengkap + ' dari ' + total + ' · ' + (total - lengkap) + ' belum lengkap</div></div>';
    }
    document.getElementById('klSummary').innerHTML = kartu('Data Murid', state.murid, state.totalMurid) + kartu('Data Guru', state.guru, state.totalGuru);
  }

  function tab(nama) {
    state.tab = nama;
    ['murid', 'guru'].forEach(function (n) { document.getElementById('klTab_' + n).className = 'btn ' + (n === nama ? 'btn-primary' : 'btn-secondary'); });
    document.getElementById('klThKelas').textContent = nama === 'murid' ? 'Kelas' : 'Kode Guru';
    var list = nama === 'murid' ? state.murid : state.guru, set = {};
    list.forEach(function (x) { x.wajib.concat(x.saran).forEach(function (f) { set[f] = true; }); });
    document.getElementById('klField').innerHTML = '<option value="">Semua kekurangan</option>' + Object.keys(set).sort().map(function (f) { return '<option value="' + esc(f) + '">' + esc(f) + '</option>'; }).join('');
    ringkasan();
    tabel();
  }

  function terfilter() {
    var list = state.tab === 'murid' ? state.murid : state.guru;
    var q = (document.getElementById('klSearch').value || '').toLowerCase();
    var mode = document.getElementById('klMode').value, fld = document.getElementById('klField').value;
    return list.filter(function (x) {
      if (q && String(x.nama).toLowerCase().indexOf(q) < 0 && String(x.nomor_induk).toLowerCase().indexOf(q) < 0) return false;
      var semua = x.wajib.concat(x.saran);
      if (mode === 'wajib' && !x.wajib.length) return false;
      if (mode === 'semua' && !semua.length) return false;
      if (mode === 'lengkap' && semua.length) return false;
      if (fld && semua.indexOf(fld) < 0) return false;
      return true;
    });
  }

  function tabel() {
    var rows = terfilter(), body = document.getElementById('klBody');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#16a34a">✅ Tidak ada data yang kurang pada filter ini</td></tr>'; return; }
    var edit = state.tab === 'murid' ? state.opts.onEditMurid : state.opts.onEditGuru;
    body.innerHTML = rows.map(function (x) {
      var chips = x.wajib.map(function (f) { return '<span style="display:inline-block;margin:2px;padding:2px 8px;border-radius:10px;background:#fee2e2;color:#dc2626;font-size:12px">' + esc(f) + '</span>'; }).join('')
        + x.saran.map(function (f) { return '<span style="display:inline-block;margin:2px;padding:2px 8px;border-radius:10px;background:#fef3c7;color:#b45309;font-size:12px">' + esc(f) + '</span>'; }).join('');
      if (!chips) chips = '<span style="color:#16a34a">✅ Lengkap</span>';
      var aksi = edit ? '<button class="btn btn-secondary btn-sm" onclick="Kelengkapan.edit(\'' + x.id + '\')">✏️ Lengkapi</button>'
        : '<span style="font-size:12px;color:#9ca3af">' + esc(state.tab === 'murid' ? state.opts.catatanMurid || '' : state.opts.catatanGuru || '') + '</span>';
      return '<tr><td style="font-family:monospace">' + esc(x.nomor_induk) + '</td><td><strong>' + esc(x.nama) + '</strong></td><td style="font-family:monospace">' + esc(x.kelas) + '</td><td>' + chips + '</td><td>' + aksi + '</td></tr>';
    }).join('');
  }

  function edit(id) { var fn = state.tab === 'murid' ? state.opts.onEditMurid : state.opts.onEditGuru; if (fn) fn(id); }

  function csv() {
    var rows = terfilter();
    var lines = [['No. Induk', 'Nama', state.tab === 'murid' ? 'Kelas' : 'Kode Guru', 'Kurang (wajib)', 'Kurang (disarankan)']];
    rows.forEach(function (x) { lines.push([x.nomor_induk, x.nama, x.kelas, x.wajib.join('; '), x.saran.join('; ')]); });
    var txt = lines.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }));
    a.download = 'kelengkapan-data-' + state.tab + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  window.Kelengkapan = { render: render, perbaruiBadge: perbaruiBadge, tab: tab, tabel: tabel, edit: edit, csv: csv, _hitung: hitung, _state: state };
})();
