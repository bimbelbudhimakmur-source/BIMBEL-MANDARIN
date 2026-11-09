/* Notifikasi pop-up: pesan dari Leader/Admin + pengingat Kaldik (H-3).
   Dipakai semua dashboard. Butuh: window.db (supabase client). */
(function () {
  var S = { role: null, group: null, uid: null, progId: null, busy: false, started: false };

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function todayWIB(offset) {
    var d = new Date(Date.now() + (offset || 0) * 86400000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d); // YYYY-MM-DD
  }
  function fmtTgl(s) { try { return new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return s; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  // Keterangan Kaldik: baris pertama jadi judul, sisanya bisa dibuka (dropdown)
  window.kaldikKet = function (t) {
    var s = String(t == null ? '' : t).trim();
    if (!s) return '—';
    var first = s.split('\n')[0];
    var short = first.length > 48 ? first.slice(0, 48) + '…' : first;
    if (s.length === short.length) return esc(s);
    return '<details class="kd-det"><summary style="cursor:pointer;color:#b01020;font-weight:600;font-size:12px;list-style:revert">' + esc(short)
      + '</summary><div style="margin-top:6px;padding:8px 10px;background:#fff7f8;border:1px solid #fecdd3;border-radius:8px;white-space:pre-wrap;font-size:12px;color:#374151;line-height:1.55">' + esc(s) + '</div></details>';
  };

  function curProgram() {
    try {
      if (S.group === 'guru') return (typeof guruData !== 'undefined' && guruData) ? (guruData.program_id || (guruData.program && guruData.program.id) || null) : null;
      return (typeof activeProgramId !== 'undefined') ? activeProgramId : null;
    } catch (e) { return null; }
  }

  async function init() {
    if (S.started || typeof db === 'undefined') return;
    try {
      var s = await db.auth.getSession();
      var u = s && s.data && s.data.session && s.data.session.user;
      if (!u) return;
      var p = await db.from('profiles').select('role').eq('id', u.id).single();
      if (!p.data) return;
      S.uid = u.id; S.role = p.data.role;
      try { await db.rpc('aktifkan_kelas_terjadwal'); } catch (e) {}
      S.group = (S.role === 'admin' || S.role === 'bendahara' || S.role === 'leader') ? S.role : (String(S.role).indexOf('teacher') === 0 ? 'guru' : null);
      if (!S.group) return;
      S.started = true;
      setTimeout(cek, 3500);
      setTimeout(cek, 9000);
      setInterval(cek, 120000);
    } catch (e) {}
  }

  async function cek() {
    if (!S.started || S.busy || document.getElementById('notifPopup')) return;
    S.busy = true;
    try {
      var items = [];
      var prog = curProgram();
      // 1. Pesan dari leader/admin
      try {
        var since = new Date(Date.now() - 30 * 86400000).toISOString();
        var q = db.from('notifikasi').select('*').in('target', ['semua', S.group]).gte('created_at', since).order('created_at', { ascending: false }).limit(20);
        var r = await q;
        var rows = (r.data || []).filter(function (n) {
          if (n.berlaku_sampai && n.berlaku_sampai < todayWIB()) return false;
          if (S.group === 'guru' && n.program_id && prog && n.program_id !== prog) return false;
          return true;
        });
        if (rows.length) {
          var rd = await db.from('notifikasi_dibaca').select('notif_id').eq('user_id', S.uid).in('notif_id', rows.map(function (n) { return n.id; }));
          var done = {}; (rd.data || []).forEach(function (x) { done[x.notif_id] = 1; });
          rows.filter(function (n) { return !done[n.id]; }).forEach(function (n) {
            items.push({ type: 'pesan', id: n.id, judul: n.judul, pesan: n.pesan, waktu: n.created_at });
          });
        }
      } catch (e) {}
      // 2. Pengingat kaldik H-3
      try {
        var t0 = todayWIB(), t3 = todayWIB(3);
        var kq = db.from('kaldik').select('*').gte('tanggal_mulai', t0).lte('tanggal_mulai', t3).order('tanggal_mulai');
        if (prog) kq = kq.eq('program_id', prog);
        var kr = await kq;
        (kr.data || []).forEach(function (k) {
          var key = 'kaldik_seen_' + S.uid + '_' + k.id + '_' + t0;
          if (ls(key)) return;
          var days = Math.round((new Date(k.tanggal_mulai + 'T00:00:00') - new Date(t0 + 'T00:00:00')) / 86400000);
          items.push({ type: 'kaldik', key: key, judul: k.judul, days: days, tanggal: k.tanggal_mulai, selesai: k.tanggal_selesai, ket: k.keterangan });
        });
      } catch (e) {}
      if (items.length) tampil(items);
    } finally { S.busy = false; }
  }

  function tampil(items) {
    var html = items.map(function (it) {
      if (it.type === 'kaldik') {
        var when = it.days === 0 ? 'HARI INI' : (it.days === 1 ? 'BESOK' : it.days + ' hari lagi');
        return '<div class="nk-kaldik" title="Klik untuk membuka Kaldik" style="cursor:pointer;border:1px solid #fde68a;background:#fffbeb;border-radius:10px;padding:12px 14px;margin-bottom:10px">'
          + '<div style="font-size:11px;font-weight:700;color:#92400e">📅 KALENDER PENDIDIKAN · ' + when + '</div>'
          + '<div style="font-weight:700;font-size:15px;color:#111827;margin:3px 0">' + esc(it.judul) + '</div>'
          + '<div style="font-size:12px;color:#6b7280">' + esc(fmtTgl(it.tanggal)) + (it.selesai && it.selesai !== it.tanggal ? ' s/d ' + esc(fmtTgl(it.selesai)) : '') + '</div>'
          + (it.ket ? '<div style="font-size:12px;color:#6b7280;margin-top:4px;white-space:pre-wrap;max-height:60px;overflow:hidden">' + esc(it.ket) + '</div>' : '')
          + '<div style="font-size:11px;color:#b01020;font-weight:700;margin-top:6px">Lihat di Kaldik →</div></div>';
      }
      return '<div style="border:1px solid #fecdd3;background:#fff1f2;border-radius:10px;padding:12px 14px;margin-bottom:10px">'
        + '<div style="font-size:11px;font-weight:700;color:#9f1239">📢 PEMBERITAHUAN</div>'
        + '<div style="font-weight:700;font-size:15px;color:#111827;margin:3px 0">' + esc(it.judul) + '</div>'
        + '<div style="font-size:13px;color:#374151;white-space:pre-wrap">' + esc(it.pesan || '') + '</div></div>';
    }).join('');
    var ov = document.createElement('div');
    ov.id = 'notifPopup';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:460px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3)">'
      + '<div style="padding:16px 18px;border-bottom:1px solid #e5e7eb;font-weight:800;font-size:16px">🔔 Pemberitahuan (' + items.length + ')</div>'
      + '<div style="padding:14px 18px;overflow:auto">' + html + '</div>'
      + '<div style="padding:12px 18px;border-top:1px solid #e5e7eb;text-align:right"><button id="notifOk" style="background:#b01020;color:#fff;border:0;border-radius:8px;padding:9px 20px;font-weight:700;cursor:pointer">✓ Mengerti</button></div></div>';
    document.body.appendChild(ov);
    var selesai = async function () {
      var ids = [];
      items.forEach(function (it) { if (it.type === 'kaldik') ls(it.key, '1'); else ids.push({ notif_id: it.id, user_id: S.uid }); });
      ov.remove();
      if (ids.length) { try { await db.from('notifikasi_dibaca').upsert(ids, { onConflict: 'notif_id,user_id' }); } catch (e) {} }
    };
    document.getElementById('notifOk').onclick = function () { this.disabled = true; selesai(); };
    ov.querySelectorAll('.nk-kaldik').forEach(function (el) {
      el.onclick = function () { selesai(); try { if (typeof switchTab === 'function') switchTab('kaldik'); } catch (e) {} };
    });
  }

  // ===== Kirim notifikasi (Leader & Admin) =====
  async function openKirim(pre) {
    if (S.role !== 'leader' && S.role !== 'admin') { alert('Hanya Leader/Admin yang bisa mengirim notifikasi.'); return; }
    var old = document.getElementById('notifKirimModal'); if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'notifKirimModal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px';
    var inp = 'width:100%;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit';
    ov.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:520px;width:100%;max-height:90vh;overflow:auto;padding:18px 20px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b style="font-size:16px">🔔 Kirim Notifikasi Pop-up</b><button onclick="document.getElementById(\'notifKirimModal\').remove()" style="border:0;background:none;font-size:18px;cursor:pointer">✕</button></div>'
      + '<label style="font-size:12px;font-weight:700">Kirim ke</label>'
      + '<select id="nkTarget" style="' + inp + ';margin-bottom:10px"><option value="semua">Semua role (Admin, Bendahara, Leader, Guru)</option><option value="guru">Semua Guru</option><option value="admin">Admin</option><option value="bendahara">Bendahara</option></select>'
      + '<label style="font-size:12px;font-weight:700">Judul</label><input id="nkJudul" style="' + inp + ';margin-bottom:10px" maxlength="120">'
      + '<label style="font-size:12px;font-weight:700">Pesan</label><textarea id="nkPesan" rows="4" style="' + inp + ';margin-bottom:10px"></textarea>'
      + '<label style="font-size:12px;font-weight:700">Berlaku sampai (opsional)</label><input id="nkSampai" type="date" style="' + inp + ';margin-bottom:6px">'
      + '<div style="font-size:11px;color:#6b7280;margin-bottom:12px">Notifikasi muncul sekali di dashboard penerima saat mereka membuka/menyegarkan halaman, sampai mereka klik "Mengerti". Untuk guru, hanya guru program yang sedang aktif.</div>'
      + '<button id="nkKirim" style="background:#b01020;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-weight:700;cursor:pointer">📤 Kirim</button>'
      + '<div style="margin-top:18px;border-top:1px solid #e5e7eb;padding-top:10px"><div style="font-size:12px;font-weight:700;margin-bottom:6px">Riwayat terkirim</div><div id="nkRiwayat" style="font-size:12px;color:#6b7280">Memuat...</div></div></div>';
    document.body.appendChild(ov);
    if (pre) { document.getElementById('nkJudul').value = pre.judul || ''; document.getElementById('nkPesan').value = pre.pesan || ''; }
    document.getElementById('nkKirim').onclick = kirim;
    riwayat();
  }

  async function kirim() {
    var judul = document.getElementById('nkJudul').value.trim();
    var pesan = document.getElementById('nkPesan').value.trim();
    var target = document.getElementById('nkTarget').value;
    var sampai = document.getElementById('nkSampai').value || null;
    if (!judul || !pesan) { alert('Judul dan pesan wajib diisi.'); return; }
    var btn = document.getElementById('nkKirim'); btn.disabled = true;
    var prog = (target === 'guru' || target === 'semua') ? curProgram() : null;
    var r = await db.from('notifikasi').insert({ judul: judul, pesan: pesan, target: target, program_id: prog, berlaku_sampai: sampai, created_by: S.uid });
    btn.disabled = false;
    if (r.error) { alert('❌ Gagal mengirim: ' + r.error.message + '\n\nPastikan SQL fitur_notifikasi.sql sudah dijalankan.'); return; }
    alert('✅ Notifikasi terkirim.');
    document.getElementById('nkJudul').value = ''; document.getElementById('nkPesan').value = '';
    riwayat();
  }

  async function riwayat() {
    var el = document.getElementById('nkRiwayat'); if (!el) return;
    var r = await db.from('notifikasi').select('id,judul,target,created_at').order('created_at', { ascending: false }).limit(8);
    if (!r.data || !r.data.length) { el.textContent = 'Belum ada.'; return; }
    el.innerHTML = r.data.map(function (n) {
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid #f3f4f6"><span><b>' + esc(n.judul) + '</b> → ' + esc(n.target) + ' · ' + new Date(n.created_at).toLocaleDateString('id-ID') + '</span><a href="#" data-id="' + n.id + '" class="nkDel" style="color:#dc2626;text-decoration:none">🗑️</a></div>';
    }).join('');
    el.querySelectorAll('.nkDel').forEach(function (a) {
      a.onclick = async function (e) {
        e.preventDefault();
        if (!confirm('Hapus notifikasi ini? (yang belum dibaca tidak akan muncul lagi)')) return;
        await db.from('notifikasi').delete().eq('id', a.getAttribute('data-id'));
        riwayat();
      };
    });
  }

  window.Notif = { openKirim: openKirim, cek: cek, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
