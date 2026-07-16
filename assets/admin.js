// ============================================
// BMM ADMIN DASHBOARD — admin.js v3
// ============================================

var allMurid = [], allGuru = [], allKelas = [], allSiswaRR = [], allKelasRR = [], hanteiMap = {};
var selectedMurid = new Set(), selectedGuru = new Set(), selectedKelas = new Set();
var editingMuridId = null, editingGuruId = null, editingKelasId = null;
var tahunAjaranId = null;
var currentKelasDetailId = null;

// Helper: tampilkan jilid 0 sebagai "TK"
function jilidLabel(j) { return (j === 0 || j === '0') ? 'TK' : j; }
function kelasLevelLabel(k) {
  if (k.jilid !== null && k.jilid !== undefined) return 'Jilid ' + jilidLabel(k.jilid);
  return k.nama_level || '';
}

// ============================================
// INIT
// ============================================
(async function() {
  try {
    // Inject modal kelas detail
    if (!document.getElementById('modalKelasDetail')) {
      document.body.insertAdjacentHTML('beforeend',
        '<div class="modal-overlay hidden" id="modalKelasDetail">'
        + '<div class="modal-box" style="max-width:640px">'
        + '<div class="modal-header">'
        + '<span class="modal-title" id="kelasDetailTitle">Detail Kelas</span>'
        + '<button class="modal-close" onclick="closeModal(\'modalKelasDetail\')">✕</button>'
        + '</div>'
        + '<div id="kelasDetailContent"></div>'
        + '</div></div>'
      );
    }

    var s = (await db.auth.getSession()).data.session;
    if (!s) { window.location.replace('../index.html'); return; }

    var p = (await db.from('profiles').select('nama_lengkap,role').eq('id',s.user.id).single()).data;
    if (!p || p.role !== 'admin') { await db.auth.signOut(); window.location.replace('../index.html'); return; }

    document.getElementById('headerName').textContent = p.nama_lengkap;
    document.getElementById('logoutBtn').addEventListener('click', async function() {
      await db.auth.signOut(); window.location.replace('../index.html');
    });
    document.querySelectorAll('.sidebar-item').forEach(function(i) {
      i.addEventListener('click', function() { switchTab(i.dataset.tab); });
    });

    var ta = (await db.from('tahun_ajaran').select('id').eq('is_active',true).maybeSingle()).data;
    tahunAjaranId = ta ? ta.id : null;
    document.getElementById('da_tanggalJoin').value = new Date().toISOString().split('T')[0];

    await populateGuruDropdowns();
    await populateProgramDropdownKelas();
    await initProgramSwitcherAdmin();
    await loadStats();
    await loadKelasHariIni();
    setupStatCardClicks();
    await loadAndApplySysSettings();
  } catch(e) { console.error('Init error:', e); }
})();

// ============================================
// PROGRAM SWITCHER (header)
// ============================================
var PROGRAM_FILTER_KEY = 'bmm_active_program_id';
var activeProgramId = null;

function isMandarinActive() {
  var prog = programListAdmin.find(function(p){ return p.id === activeProgramId; });
  // Default true kalau belum ketauan (misal program list belum kemuat)
  return !prog || prog.kode === 'MANDARIN';
}

function currentProgramPrefix() {
  var prog = programListAdmin.find(function(p){ return p.id === activeProgramId; });
  return (prog && prog.kode !== 'MANDARIN' && prog.prefix_kelas) ? prog.prefix_kelas + '-' : '';
}

async function initProgramSwitcherAdmin() {
  if (!programListAdmin.length) await populateProgramDropdownKelas();
  var progs = programListAdmin;
  if (!progs.length) { document.getElementById('programSwitcherLabel').textContent = 'Tidak ada program'; return; }
  var saved = localStorage.getItem(PROGRAM_FILTER_KEY);
  var found = progs.find(function(p){return p.id===saved;});
  activeProgramId = found ? found.id : progs[0].id;
  localStorage.setItem(PROGRAM_FILTER_KEY, activeProgramId);

  var currentProg = progs.find(function(p){return p.id===activeProgramId;});
  document.getElementById('programSwitcherLabel').textContent = currentProg ? currentProg.nama : '—';

  document.getElementById('programSwitcherMenu').innerHTML = progs.map(function(p) {
    return '<div onclick="switchActiveProgramAdmin(\''+p.id+'\')" style="padding:10px 16px;cursor:pointer;font-size:13px;font-weight:600;'+(p.id===activeProgramId?'background:#fdf2f4;color:#b01020':'color:#374151')+'" onmouseover="this.style.background=\'#fdf2f4\'" onmouseout="this.style.background=\''+(p.id===activeProgramId?'#fdf2f4':'white')+'\'">'
      +(p.id===activeProgramId?'✓ ':'')+p.nama+'</div>';
  }).join('');

  document.addEventListener('click', function(e) {
    var wrap = document.getElementById('programSwitcherWrap');
    if (wrap && !wrap.contains(e.target)) document.getElementById('programSwitcherMenu').style.display = 'none';
  });
}

function toggleProgramSwitcherMenu() {
  var menu = document.getElementById('programSwitcherMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

async function switchActiveProgramAdmin(programId) {
  if (programId === activeProgramId) { document.getElementById('programSwitcherMenu').style.display = 'none'; return; }
  activeProgramId = programId;
  localStorage.setItem(PROGRAM_FILTER_KEY, programId);
  document.getElementById('programSwitcherMenu').style.display = 'none';
  await initProgramSwitcherAdmin();
  await populateGuruDropdowns();
  await loadStats();
  await loadKelasHariIni();
  var activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return;
  var tabName = activeTab.id.replace('tab-', '');
  if (tabName === 'kelas')    await loadKelas();
  if (tabName === 'murid')   await loadMurid();
  if (tabName === 'guru')    await loadGuruAdmin();
  if (tabName === 'register') await loadPendaftaran();
  if (tabName === 'reregister') await loadRR();
  if (tabName === 'kaldik') await loadKaldik();
  if (tabName === 'approval-status') await loadApprovalStatus();
}

// ============================================
// SYSTEM SETTINGS CHECK
// ============================================
var sysSettings = {};
async function loadAndApplySysSettings() {
  var { data } = await db.from('system_settings').select('key,value');
  sysSettings = {};
  (data || []).forEach(function(r){ sysSettings[r.key] = r.value === 'true'; });
  applyTambahKelasToggle();
}

function applyTambahKelasToggle() {
  var btn = document.querySelector('[onclick="openModalTambahKelas()"]');
  if (!btn) return;
  if (sysSettings['admin_tambah_kelas']) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor  = 'pointer';
    btn.title = '';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.4';
    btn.style.cursor  = 'not-allowed';
    btn.title = 'Fitur belum diaktifkan oleh Leader';
  }
}

// ============================================
// STAT CARDS CLICKABLE
// ============================================
function setupStatCardClicks() {
  var cards = [
    { id:'statAktif',    tab:'murid',    filterFn: function(){ setTimeout(function(){ document.getElementById('filterStatusMurid').value='true'; filterMurid(); },50); } },
    { id:'statBerhenti', tab:'murid',    filterFn: function(){ setTimeout(function(){ document.getElementById('filterStatusMurid').value='false'; filterMurid(); },50); } },
    { id:'statPending',  tab:'register', filterFn: null },
    { id:'statKelas',    tab:'kelas',    filterFn: null }
  ];
  cards.forEach(function(c) {
    var el = document.getElementById(c.id);
    if (!el) return;
    var card = el.closest('.stat-card');
    if (!card) return;
    card.style.cursor = 'pointer';
    card.style.transition = 'all 0.15s';
    card.addEventListener('mouseenter', function(){ card.style.transform='translateY(-3px)'; card.style.boxShadow='0 6px 20px rgba(194,24,91,0.18)'; card.style.borderLeft='4px solid var(--pink)'; });
    card.addEventListener('mouseleave', function(){ card.style.transform=''; card.style.boxShadow=''; card.style.borderLeft=''; });
    card.addEventListener('click', function() {
      switchTab(c.tab);
      if (c.filterFn) c.filterFn();
    });
  });
}

// ============================================
// TAB
// ============================================
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(function(c){c.classList.remove('active');});
  document.querySelectorAll('.sidebar-item').forEach(function(i){i.classList.remove('active');});
  document.getElementById('tab-'+tab).classList.add('active');
  document.querySelector('[data-tab="'+tab+'"]').classList.add('active');
  if (tab==='register')   loadPendaftaran();
  if (tab==='reregister') loadRR();
  if (tab==='kelas')      loadKelas();
  if (tab==='murid')      loadMurid();
  if (tab==='approval-status') loadApprovalStatus();
  if (tab==='guru')       loadGuruAdmin();
  if (tab==='kaldik')     loadKaldik();
  if (tab==='pengaturan-wa') loadWaGroupLink();
}

// ============================================
// STATS
// ============================================
async function loadStats() {
  try {
    var qPending = db.from('pendaftaran').select('*',{count:'exact',head:true}).eq('status','pending');
    var qKelas = db.from('kelas').select('*',{count:'exact',head:true}).eq('is_active',true);
    if (activeProgramId) { qPending = qPending.eq('program_id', activeProgramId); qKelas = qKelas.eq('program_id', activeProgramId); }

    var cAktif, cBerhenti;
    if (activeProgramId) {
      var { data: enrData } = await db.from('enrollment')
        .select('siswa_id, siswa:siswa_id(status), kelas:kelas_id(program_id)')
        .eq('is_active', true);
      var scoped = (enrData||[]).filter(function(e){ return e.kelas && e.kelas.program_id === activeProgramId; });
      cAktif = scoped.filter(function(e){ return e.siswa && e.siswa.status; }).length;
      cBerhenti = scoped.filter(function(e){ return e.siswa && !e.siswa.status; }).length;
    }

    var r = await Promise.all([
      activeProgramId ? Promise.resolve({count: cAktif}) : db.from('siswa').select('*',{count:'exact',head:true}).eq('status',true),
      activeProgramId ? Promise.resolve({count: cBerhenti}) : db.from('siswa').select('*',{count:'exact',head:true}).eq('status',false),
      qPending,
      qKelas
    ]);
    document.getElementById('statAktif').textContent    = r[0].count !== null ? r[0].count : 0;
    document.getElementById('statBerhenti').textContent = r[1].count !== null ? r[1].count : 0;
    document.getElementById('statPending').textContent  = r[2].count !== null ? r[2].count : 0;
    document.getElementById('statKelas').textContent    = r[3].count !== null ? r[3].count : 0;
  } catch(e) { console.error('loadStats:',e); }
}

// ============================================
// KELAS HARI INI + KELAS BERLANGSUNG SEKARANG
// (khusus program Mandarin — program lain nggak
// pakai jadwal jam yang presisi buat fitur ini)
// ============================================
function renderKelasCard(k, st, cnt) {
  var border=st==='ongoing'?'var(--gold)':st==='selesai'?'#E5E7EB':'var(--border)';
  var bg=st==='ongoing'?'var(--gold-light)':st==='selesai'?'#FAFAFA':'var(--white)';
  var op=st==='selesai'?'0.65':'1';
  var jamLbl=k.sesi==='sore'?'16:00–17:45':'18:00–19:45';
  var kodeG=k.guru?k.guru.kode_guru:'?';
  var namaG=k.guru?k.guru.nama_lengkap:'—';
  var badge=st==='ongoing'?'<span style="background:var(--pink);color:white;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700">🔴 Berlangsung</span>':st==='upcoming'&&k.sesi==='sore'?'<span class="badge badge-yellow" style="font-size:10px">🕓 Nanti Sore</span>':st==='upcoming'&&k.sesi==='malam'?'<span class="badge badge-blue" style="font-size:10px">🌙 Nanti Malam</span>':'<span class="badge badge-gray" style="font-size:10px">✓ Selesai</span>';
  var sesiB=k.sesi==='sore'?'<span class="badge badge-yellow" style="font-size:10px">Sore</span>':'<span class="badge badge-blue" style="font-size:10px">Malam</span>';
  return '<div style="border:1.5px solid '+border+';border-radius:12px;padding:16px;background:'+bg+';opacity:'+op+';cursor:pointer;transition:all 0.2s" '
    +'onclick="viewKelasStudents(\''+k.id+'\',\''+k.kode_kelas+'\')" '
    +'onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 6px 20px rgba(194,24,91,0.15)\'" '
    +'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">'
    +'<div style="font-family:monospace;font-size:16px;font-weight:700;color:var(--pink)">'+k.kode_kelas+'</div>'+badge+'</div>'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">'
    +'<div style="width:28px;height:28px;border-radius:50%;background:var(--pink-light);color:var(--pink);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">'+kodeG+'</div>'
    +'<div><div style="font-size:12px;font-weight:600;color:var(--text)">'+namaG+'</div>'
    +'<div style="font-size:11px;color:var(--text-2)">'+kelasLevelLabel(k)+'</div></div></div>'
    +'<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:10px">'
    +'<div>'+sesiB+'<span style="margin-left:6px;font-size:12px;color:var(--text-2)">⏰ '+jamLbl+'</span></div>'
    +'<div><span style="font-size:18px;font-weight:700;color:var(--text)">'+cnt+'</span><span style="font-size:11px;color:var(--text-2)"> murid aktif</span></div>'
    +'</div>'
    +'<div style="text-align:center;margin-top:8px;font-size:11px;color:var(--text-2)">👥 Klik untuk lihat murid</div>'
    +'</div>';
}

async function loadKelasHariIni() {
  try {
    var wrapOngoing = document.getElementById('wrapKelasOngoing');
    var wrapHariIni = document.getElementById('wrapKelasHariIni');
    if (!isMandarinActive()) {
      if (wrapOngoing) wrapOngoing.style.display = 'none';
      if (wrapHariIni) wrapHariIni.style.display = 'none';
      return;
    }
    if (wrapOngoing) wrapOngoing.style.display = '';
    if (wrapHariIni) wrapHariIni.style.display = '';

    var now  = new Date();
    var hari = now.getDay();
    var jam  = now.getHours()*60+now.getMinutes();
    var namaHari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var hariLabelEl = document.getElementById('hariIniLabel');
    if (hariLabelEl) hariLabelEl.textContent = namaHari[hari]+', '+now.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});

    var clockEl = document.getElementById('ongoingClock');
    if (clockEl) clockEl.textContent = 'Update terakhir: '+now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});

    var hb = null;
    if (hari===1||hari===3||hari===5) hb='135';
    else if (hari===2||hari===4||hari===6) hb='246';

    var el = document.getElementById('kelasHariIni');
    var elOngoing = document.getElementById('kelasOngoing');

    if (!hb) {
      if (el) el.innerHTML='<div style="text-align:center;padding:32px;color:var(--text-2)"><div style="font-size:32px">🌙</div><div style="font-weight:600;margin-top:8px">Tidak ada kelas hari Minggu</div></div>';
      if (elOngoing) elOngoing.innerHTML='<div style="text-align:center;padding:24px;color:var(--text-2);width:100%">Tidak ada kelas berlangsung</div>';
      return;
    }

    var kelas = (await db.from('kelas')
      .select('*, guru:guru_id(nama_lengkap,kode_guru), enrollment(id,is_active,siswa:siswa_id(status))')
      .eq('hari_belajar',hb).eq('is_active',true).eq('program_id', activeProgramId).order('sesi')).data || [];

    if (!kelas.length) {
      if (el) el.innerHTML='<div style="text-align:center;padding:32px;color:var(--text-2)">Tidak ada kelas terjadwal hari ini</div>';
      if (elOngoing) elOngoing.innerHTML='<div style="text-align:center;padding:24px;color:var(--text-2);width:100%">Tidak ada kelas berlangsung</div>';
      return;
    }

    function getSt(sesi) {
      if (sesi==='sore')  return (jam>=960&&jam<=1065)?'ongoing':jam<960?'upcoming':'selesai';
      if (sesi==='malam') return (jam>=1080&&jam<=1185)?'ongoing':jam<1080?'upcoming':'selesai';
      return 'upcoming';
    }

    var htmlAll = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">';
    var htmlOngoing = '';
    var ongoingCount = 0;
    for (var i=0; i<kelas.length; i++) {
      var k=kelas[i];
      var cnt=0; if(k.enrollment){for(var j=0;j<k.enrollment.length;j++){if(k.enrollment[j].is_active&&k.enrollment[j].siswa&&k.enrollment[j].siswa.status)cnt++;}}
      var st=getSt(k.sesi);
      var cardHtml = renderKelasCard(k, st, cnt);
      htmlAll += cardHtml;
      if (st==='ongoing') {
        htmlOngoing += '<div style="min-width:240px;flex:0 0 auto">'+cardHtml+'</div>';
        ongoingCount++;
      }
    }
    htmlAll += '</div>';
    if (el) el.innerHTML = htmlAll;
    if (elOngoing) {
      elOngoing.innerHTML = ongoingCount>0 ? htmlOngoing
        : '<div style="text-align:center;padding:24px;color:var(--text-2);width:100%"><div style="font-size:28px">😴</div>Tidak ada kelas yang sedang berlangsung saat ini</div>';
    }
  } catch(e) { console.error('loadKelasHariIni:',e); }
}

// Auto-refresh kelas berlangsung tiap 1 menit
setInterval(function(){
  if (document.getElementById('tab-dashboard') && document.getElementById('tab-dashboard').classList.contains('active')) {
    loadKelasHariIni();
  }
}, 60000);

// ============================================
// VIEW STUDENTS PER KELAS (dashboard + data kelas)
// ============================================
async function viewKelasStudents(kelasId, kelasKode) {
  currentKelasDetailId = kelasId;
  document.getElementById('kelasDetailTitle').textContent = '👥 Murid Kelas '+kelasKode;
  document.getElementById('kelasDetailContent').innerHTML = '<div style="text-align:center;padding:20px">⏳ Memuat...</div>';
  document.getElementById('modalKelasDetail').classList.remove('hidden');
  try {
    // Ambil semua enrollment (aktif + nonaktif)
    var res = await db.from('enrollment')
      .select('*, siswa:siswa_id(nomor_induk,nama_lengkap,nama_mandarin,telepon,status)')
      .eq('kelas_id', kelasId);
    var all = res.data || [];

    var aktif    = all.filter(function(e){ return e.is_active; });
    var riwayat  = all.filter(function(e){ return !e.is_active && !e.has_determination; });

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
      +'<div style="font-size:13px;color:var(--text-2)"><strong>'+(aktif.length + riwayat.length)+'</strong> murid terdaftar'
      +(riwayat.length ? ' <span style="color:#9ca3af;font-size:11px">('+aktif.length+' aktif, '+riwayat.length+' riwayat)</span>' : '')
      +'</div>'
      +'<button class="btn btn-primary btn-sm" onclick="closeModal(\'modalKelasDetail\');openModalDaftarAdmin(\''+kelasId+'\')">➕ Tambah Siswa</button>'
      +'</div>';

    if (!aktif.length && !riwayat.length) {
      html += '<div style="text-align:center;padding:30px;color:var(--text-2)">Belum ada murid di kelas ini</div>';
    } else {
      html += '<table class="table"><thead><tr><th>No. Induk</th><th>Nama Indonesia</th><th>Nama Mandarin</th><th>HP</th><th>Status</th></tr></thead><tbody>';

      // Murid aktif
      aktif.forEach(function(e) {
        var s = e.siswa; if (!s) return;
        html += '<tr>'
          +'<td style="font-family:monospace">'+(s.nomor_induk||'—')+'</td>'
          +'<td><strong>'+s.nama_lengkap+'</strong></td>'
          +'<td style="color:#6b7280">'+(s.nama_mandarin||'—')+'</td>'
          +'<td>'+(s.telepon||'—')+'</td>'
          +'<td><span class="badge badge-green">Aktif</span></td>'
          +'</tr>';
      });

      // Riwayat (pindah tanpa penentuan)
      riwayat.forEach(function(e) {
        var s = e.siswa; if (!s) return;
        var label = s.status
          ? '<span style="font-size:11px;background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:10px">↗ Pindah Kelas</span>'
          : '<span class="badge badge-red">Nonaktif</span>';
        html += '<tr style="opacity:0.5;background:#f9fafb">'
          +'<td style="font-family:monospace;color:#9ca3af">'+(s.nomor_induk||'—')+'</td>'
          +'<td style="color:#9ca3af">'+s.nama_lengkap+'</td>'
          +'<td style="color:#9ca3af">'+(s.nama_mandarin||'—')+'</td>'
          +'<td style="color:#9ca3af">'+(s.telepon||'—')+'</td>'
          +'<td>'+label+'</td>'
          +'</tr>';
      });

      html += '</tbody></table>';
    }
    document.getElementById('kelasDetailContent').innerHTML = html;
  } catch(e) {
    document.getElementById('kelasDetailContent').innerHTML = '<div style="color:var(--pink)">Error: '+e.message+'</div>';
  }
}

// ============================================
// PENDAFTARAN
// ============================================
async function loadPendaftaran() {
  try {
    var status = document.getElementById('filterStatusDaftar').value;
    var q = db.from('pendaftaran').select('*, kelas:kelas_dipilih(kode_kelas,jilid)').order('created_at',{ascending:false});
    if (activeProgramId) q=q.eq('program_id',activeProgramId);
    if (status) q=q.eq('status',status);
    var data = (await q).data || [];
    var showMandarin = isMandarinActive();
    var thM = document.getElementById('thNamaMandarinDaftar');
    if (thM) thM.style.display = showMandarin ? '' : 'none';
    var tbody = document.getElementById('tablePendaftaran');
    if (!data.length) { tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280">Tidak ada data pendaftaran</td></tr>'; return; }
    var html='';
    for (var i=0;i<data.length;i++) {
      var d=data[i];
      var sb=d.status==='pending'?'<span class="badge badge-yellow">Pending</span>':d.status==='approved'?'<span class="badge badge-green">Disetujui</span>':'<span class="badge badge-red">Ditolak</span>';
      var ab=d.status==='pending'?'<button class="btn btn-success btn-sm" onclick="proseskan(\''+d.id+'\',\'approved\')">✓</button> <button class="btn btn-danger btn-sm" onclick="proseskan(\''+d.id+'\',\'rejected\')">✗</button>':'';
      html += '<tr>'
        +'<td><strong>'+(d.nama_lengkap||'')+'</strong></td>'
        +(showMandarin ? '<td style="color:#6b7280">'+(d.nama_mandarin||'—')+'</td>' : '')
        +'<td>'+(d.created_at?new Date(d.created_at).toLocaleDateString('id-ID'):'—')+'</td>'
        +'<td style="font-family:monospace">'+(d.kelas?d.kelas.kode_kelas:'—')+'</td>'
        +'<td>'+sb+'</td>'
        +'<td><button class="btn-icon" onclick="showDetailDaftar(\''+d.id+'\')">👁</button> '+ab+'</td></tr>';
    }
    tbody.innerHTML=html;
  } catch(e) { console.error('loadPendaftaran:',e); }
}

async function showDetailDaftar(id) {
  try {
    var d=(await db.from('pendaftaran').select('*, kelas:kelas_dipilih(kode_kelas,jilid)').eq('id',id).single()).data;
    if(!d) return;

    // Get signed URL for bukti bayar
    var fileHtml = '<div style="color:#9ca3af;font-size:12px">Tidak ada file</div>';
    if (d.bukti_bayar_url) {
      try {
        var signed = await db.storage.from('bukti-bayar').createSignedUrl(d.bukti_bayar_url, 300);
        if (signed.data && signed.data.signedUrl) {
          fileHtml = '<a href="'+signed.data.signedUrl+'" target="_blank" class="btn btn-secondary btn-sm">👁 Lihat Bukti Bayar</a>';
        }
      } catch(fe) { fileHtml = '<span style="color:#9ca3af">Error load file</span>'; }
    }

    document.getElementById('detailDaftarContent').innerHTML =
      '<div class="modal-row"><span class="modal-label">Nama Indonesia</span><span class="modal-value"><strong>'+(d.nama_lengkap||'')+'</strong></span></div>'
      +(isMandarinActive() ? '<div class="modal-row"><span class="modal-label">Nama Mandarin</span><span class="modal-value">'+(d.nama_mandarin||'—')+'</span></div>' : '')
      +'<div class="modal-row"><span class="modal-label">HP Murid</span><span class="modal-value">'+(d.telepon||'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">HP Orang Tua</span><span class="modal-value">'+(d.telepon_ortu||'')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Tempat Lahir</span><span class="modal-value">'+(d.tempat_lahir||'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Tgl Lahir</span><span class="modal-value">'+(d.tanggal_lahir?new Date(d.tanggal_lahir).toLocaleDateString('id-ID'):'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Alamat</span><span class="modal-value">'+(d.alamat||'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Kelas Dipilih</span><span class="modal-value" style="font-family:monospace">'+(d.kelas?d.kelas.kode_kelas:'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Bukti Bayar</span><span class="modal-value">'+fileHtml+'</span></div>';

    document.getElementById('detailDaftarAksi').innerHTML = d.status==='pending'
      ? '<button class="btn btn-success" onclick="proseskan(\''+d.id+'\',\'approved\');closeModal(\'modalDetailDaftar\')">✓ Setujui</button>'
        +'<button class="btn btn-danger" onclick="proseskan(\''+d.id+'\',\'rejected\');closeModal(\'modalDetailDaftar\')">✗ Tolak</button>'
      : '';
    document.getElementById('modalDetailDaftar').classList.remove('hidden');
  } catch(e) { console.error('showDetailDaftar:',e); }
}

async function proseskan(id, status) {
  if (!confirm('Yakin '+(status==='approved'?'menyetujui':'menolak')+' pendaftaran ini?')) return;
  try {
    var regData=(await db.from('pendaftaran').select('*').eq('id',id).single()).data;
    var userId=(await db.auth.getUser()).data.user.id;
    await db.from('pendaftaran').update({status,diproses_oleh:userId,waktu_proses:new Date().toISOString()}).eq('id',id);
    if (status==='approved'&&regData) {
      var dup=(await db.from('siswa').select('id,status').ilike('nama_lengkap',regData.nama_lengkap)).data||[];
      var aktif=dup.filter(function(x){return x.status;});
      if (aktif.length>0) {
        if (!confirm('⚠️ Murid "'+regData.nama_lengkap+'" sudah aktif terdaftar!\nApakah ini murid berbeda? OK=lanjutkan, Batal=batalkan')) return;
      }
      var pfx=currentProgramPrefix()+'S';
      var cnt=(await db.from('siswa').select('*',{count:'exact',head:true}).ilike('nomor_induk',pfx+'%')).count||0;
      var noInduk=pfx+String(cnt+1).padStart(4,'0');
      var sr=await db.from('siswa').insert({
        nomor_induk:noInduk,nama_lengkap:regData.nama_lengkap,nama_mandarin:regData.nama_mandarin||null,
        tempat_lahir:regData.tempat_lahir,tanggal_lahir:regData.tanggal_lahir,alamat:regData.alamat,
        telepon:regData.telepon,telepon_ortu:regData.telepon_ortu,
        tanggal_join:new Date().toISOString().split('T')[0],status:true
      }).select().single();
      if (sr.data&&regData.kelas_dipilih) {
        await db.from('enrollment').insert({siswa_id:sr.data.id,kelas_id:regData.kelas_dipilih,tahun_ajaran_id:tahunAjaranId,is_active:true});
      }
      alert('✅ Murid didaftarkan! No. Induk: '+noInduk);
    }
    await loadPendaftaran(); await loadStats();
  } catch(e) { console.error('proseskan:',e); alert('Error: '+e.message); }
}

function openModalDaftarAdmin(presetKelasId) {
  ['da_namaIndo','da_namaMandarin','da_hpMurid','da_hpOrtu','da_tempatLahir','da_alamat'].forEach(function(id){document.getElementById(id).value='';});
  ['da_tanggalLahir'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('da_tanggalJoin').value=new Date().toISOString().split('T')[0];
  document.getElementById('da_namaMandarinWrap').style.display = isMandarinActive() ? '' : 'none';
  populateKelasSelect('da_kelas').then(function() {
    if (presetKelasId) document.getElementById('da_kelas').value=presetKelasId;
  });
  document.getElementById('modalDaftarAdmin').classList.remove('hidden');
}

async function simpanDaftarAdmin() {
  var namaIndo=document.getElementById('da_namaIndo').value.trim();
  var hpOrtu=document.getElementById('da_hpOrtu').value.trim();
  var kelasId=document.getElementById('da_kelas').value;
  if (!namaIndo||!hpOrtu||!kelasId) { alert('Lengkapi field wajib!'); return; }
  try {
    var dup=(await db.from('siswa').select('id,status').ilike('nama_lengkap',namaIndo)).data||[];
    var aktif=dup.filter(function(x){return x.status;});
    var nonAktif=dup.filter(function(x){return !x.status;});
    if (aktif.length>0) { alert('⚠️ Murid "'+namaIndo+'" sudah AKTIF terdaftar!\nCek tab Data Murid.'); return; }
    if (nonAktif.length>0) { if(!confirm('⚠️ Ditemukan murid "'+namaIndo+'" yang TIDAK AKTIF.\nApakah ini murid berbeda?\n• OK → Daftar baru\n• Batal → Aktifkan murid lama via toggle')) return; }
    var pfx=currentProgramPrefix()+'S';
    var cnt=(await db.from('siswa').select('*',{count:'exact',head:true}).ilike('nomor_induk',pfx+'%')).count||0;
    var noInduk=pfx+String(cnt+1).padStart(4,'0');
    var sr=await db.from('siswa').insert({
      nomor_induk:noInduk,nama_lengkap:namaIndo,
      nama_mandarin:document.getElementById('da_namaMandarin').value.trim()||null,
      telepon:document.getElementById('da_hpMurid').value.trim()||null,
      telepon_ortu:hpOrtu,
      tempat_lahir:document.getElementById('da_tempatLahir').value.trim()||null,
      tanggal_lahir:document.getElementById('da_tanggalLahir').value||null,
      alamat:document.getElementById('da_alamat').value.trim()||null,
      tanggal_join:document.getElementById('da_tanggalJoin').value||new Date().toISOString().split('T')[0],
      status:true
    }).select().single();
    if (sr.data) await db.from('enrollment').insert({siswa_id:sr.data.id,kelas_id:kelasId,tahun_ajaran_id:tahunAjaranId,is_active:true});
    closeModal('modalDaftarAdmin');
    alert('✅ Murid didaftarkan! No. Induk: '+noInduk);
    await loadStats();
    // Refresh kelas detail if open
    if (currentKelasDetailId===kelasId) viewKelasStudents(kelasId, '');
  } catch(e) { console.error('simpanDaftarAdmin:',e); alert('Error: '+e.message); }
}

// ============================================
// RE-REGISTER — hanya murid AKTIF, fix enrollment
// ============================================
async function loadRR() {
  try {
    // Load semua kelas aktif untuk dropdown penempatan
    var kelasResQ = db.from('kelas')
      .select('id,kode_kelas,jilid,is_active,program_id,enrollment(id,is_active)')
      .eq('is_active', true)
      .order('jilid').order('kode_kelas');
    if (typeof activeProgramId !== 'undefined' && activeProgramId) kelasResQ = kelasResQ.eq('program_id', activeProgramId);
    var kelasRes = await kelasResQ;
    allKelasRR = kelasRes.data || [];

    // Load semua siswa aktif beserta enrollment
    var res = await db.from('siswa')
      .select('*, enrollment(is_active,kelas:kelas_id(id,kode_kelas,jilid,program_id,guru:guru_id(nama_lengkap)))')
      .eq('status',true).order('nomor_induk');
    var siswaAll = res.data || [];
    if (typeof activeProgramId !== 'undefined' && activeProgramId) {
      siswaAll = siswaAll.filter(function(s){
        var ae=null;
        if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
        return ae && ae.kelas && ae.kelas.program_id===activeProgramId;
      });
    }
    allSiswaRR = siswaAll;

    // Load hantei (判定) dari tabel penilaian_perilaku — ambil kolom hantei
    // Kita load semua hantei yang ada, map by siswa_id (ambil yg terbaru)
    var hanteiRes = await db.from('penilaian_perilaku')
      .select('siswa_id, hantei, semester, updated_at')
      .not('hantei', 'is', null)
      .order('updated_at', { ascending: false });
    hanteiMap = {};
    (hanteiRes.data || []).forEach(function(h) {
      if (!hanteiMap[h.siswa_id]) hanteiMap[h.siswa_id] = h.hantei;
    });

    renderRR(allSiswaRR);

    // Populate filter kelas
    var kelasSet = {};
    allSiswaRR.forEach(function(s) {
      var ae=null;
      if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
      if (ae && ae.kelas) kelasSet[ae.kelas.kode_kelas] = true;
    });
    var kelasOpts = '<option value="">Semua Kelas</option>';
    Object.keys(kelasSet).sort().forEach(function(k) {
      kelasOpts += '<option value="'+k+'">'+k+'</option>';
    });
    var fk = document.getElementById('filterKelasRR');
    if (fk) fk.innerHTML = kelasOpts;
  } catch(e) { console.error('loadRR:',e); }
}

function renderRR(list) {
  var tbody=document.getElementById('tableRR');
  var showPenentuan = isMandarinActive();
  var thP = document.getElementById('thPenentuanRR');
  if (thP) thP.style.display = showPenentuan ? '' : 'none';
  if (!list.length) { tbody.innerHTML='<tr><td colspan="'+(showPenentuan?6:5)+'" style="text-align:center;padding:40px;color:#6b7280">Belum ada murid aktif</td></tr>'; return; }
  var html='';
  for (var i=0;i<list.length;i++) {
    var s=list[i];
    var ae=null;
    if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
    var kelas=ae?ae.kelas:null;
    var currentJilid=kelas?kelas.jilid:(s.tingkat_jilid||1);
    var nm=s.nama_mandarin?' <span style="color:#9ca3af;font-size:12px">'+s.nama_mandarin+'</span>':'';

    // Hantei badge dari guru
    var hantei = hanteiMap ? (hanteiMap[s.id] || '') : '';
    var hanteiCell;
    if (hantei === '\u5347\u73ED') {
      hanteiCell = '<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:#dcfce7;color:#16a34a;font-weight:700;font-size:13px">\u5347\u73ED Naik</span>';
    } else if (hantei === '\u7559\u73ED') {
      hanteiCell = '<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:#fee2e2;color:#dc2626;font-weight:700;font-size:13px">\u7559\u73ED Tetap</span>';
    } else {
      hanteiCell = '<span style="color:#9ca3af;font-size:12px">Belum ditentukan</span>';
    }

    // Filter kelas berdasarkan hantei
    var kelasList = allKelasRR || [];
    var filteredKelas;
    if (hantei === '\u5347\u73ED') {
      filteredKelas = kelasList.filter(function(k){ return k.jilid === currentJilid+1; });
    } else if (hantei === '\u7559\u73ED') {
      filteredKelas = kelasList.filter(function(k){ return k.jilid === currentJilid; });
    } else {
      filteredKelas = kelasList;
    }

    var kelasOpts = '<option value="">-- Pilih Kelas --</option>';
    filteredKelas.forEach(function(k){
      var cnt = k.enrollment ? k.enrollment.filter(function(e){return e.is_active;}).length : 0;
      kelasOpts += '<option value="'+k.id+'">'+k.kode_kelas+' ('+cnt+' murid)</option>';
    });

    var kelasDropdown = '<select onchange="assignKelasInline(\'' + s.id + '\',this)" style="font-size:12px;padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;min-width:140px">' + kelasOpts + '</select>';

    html += '<tr>'
      +'<td style="font-family:monospace">'+s.nomor_induk+'</td>'
      +'<td><strong>'+s.nama_lengkap+'</strong>'+nm+'</td>'
      +'<td style="font-family:monospace">'+(kelas?kelas.kode_kelas:'\u2014')+'</td>'
      +'<td><span class="badge badge-green">Aktif</span></td>'
      +(showPenentuan ? '<td>'+hanteiCell+'</td>' : '')
      +'<td>'+kelasDropdown+'</td>'
      +'</tr>';
  }
  tbody.innerHTML=html;
}

async function assignKelasInline(siswaId, selectEl) {
  var kelasId = selectEl.value;
  if (!kelasId) return;
  if (!confirm('Pindahkan murid ke kelas ' + selectEl.options[selectEl.selectedIndex].text + '?')) {
    selectEl.value = ''; return;
  }
  try {
    // Cek apakah murid ini punya penentuan (hantei) sebelum dipindah
    var hasDetermination = false;
    var { data: hanteiCheck } = await db.from('penilaian_perilaku')
      .select('hantei').eq('siswa_id', siswaId).not('hantei','is',null).limit(1);
    if (hanteiCheck && hanteiCheck.length > 0) hasDetermination = true;

    // Nonaktifkan enrollment lama, set flag has_determination
    var upRes = await db.from('enrollment')
      .update({ is_active: false, has_determination: hasDetermination })
      .eq('siswa_id', siswaId).eq('is_active', true);
    if (upRes.error) throw new Error(upRes.error.message);

    // Buat enrollment baru
    var insRes = await db.from('enrollment').insert({
      siswa_id: siswaId, kelas_id: kelasId,
      tahun_ajaran_id: tahunAjaranId, is_active: true
    });
    if (insRes.error) throw new Error(insRes.error.message);

    // Clear hantei — proses penempatan sudah selesai
    await db.from('penilaian_perilaku').update({ hantei: null }).eq('siswa_id', siswaId);

    alert('✅ Penempatan kelas berhasil! Murid telah dipindahkan.');
    await loadRR();
    await loadStats();
  } catch(e) { alert('Error: '+e.message); selectEl.value=''; }
}

function filterRR() {
  var q=document.getElementById('searchRR').value.toLowerCase();
  var st=document.getElementById('filterStatusRR').value;
  var kl=document.getElementById('filterKelasRR').value;
  renderRR(allSiswaRR.filter(function(s){
    var mq=s.nama_lengkap.toLowerCase().indexOf(q)>=0||(s.nama_mandarin||'').toLowerCase().indexOf(q)>=0;
    var ms=st===''||String(s.status)===st;
    var ae=null;
    if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
    var mk=kl===''||(ae&&ae.kelas&&ae.kelas.kode_kelas===kl);
    return mq&&ms&&mk;
  }));
}

async function openPenempatan(siswaId, nama, currentJilid, tipe) {
  var targets=[];
  if (tipe==='sheng') {
    targets=[currentJilid+1,currentJilid+2].filter(function(j){return j>=1&&j<=12;});
    document.getElementById('penempatanTitle').textContent='升 Naik — Pilih Kelas Baru';
    document.getElementById('penempatanSub').textContent=nama+' (Jilid '+jilidLabel(currentJilid)+') → naik ke jilid '+targets.join(' atau ');
  } else {
    targets=[currentJilid];
    document.getElementById('penempatanTitle').textContent='留 Tetap — Pilih Kelas';
    document.getElementById('penempatanSub').textContent=nama+' (Jilid '+jilidLabel(currentJilid)+') → tetap jilid '+jilidLabel(currentJilid);
  }
  if (!targets.length) { alert('Tidak ada jilid tersedia!'); return; }
  var kelas=(await db.from('kelas')
    .select('*, guru:guru_id(nama_lengkap), enrollment(id,is_active)')
    .in('jilid',targets).eq('is_active',true)).data||[];
  var html='';
  if (kelas.length) {
    for (var i=0;i<kelas.length;i++) {
      var k=kelas[i];
      var hariL=k.hari_belajar==='135'?'Sen·Rab·Jum':'Sel·Kam·Sab';
      var cnt=k.enrollment?k.enrollment.filter(function(e){return e.is_active;}).length:0;
      var total=k.enrollment?k.enrollment.length:0;
      html += '<div class="kelas-option" onclick="assignKelas(\''+siswaId+'\',\''+k.id+'\',this)">'
        +'<div><div style="font-family:monospace;font-weight:700;color:var(--pink)">'+k.kode_kelas+'</div>'
        +'<div style="font-size:12px;color:var(--text-2)">'+(k.guru?k.guru.nama_lengkap:'—')+' · '+kelasLevelLabel(k)+' · '+hariL+'</div></div>'
        +'<div style="text-align:right"><div style="font-size:13px;font-weight:600">'+cnt+'/'+total+'</div><div style="font-size:11px;color:var(--text-2)">murid</div></div>'
        +'</div>';
    }
  } else { html='<div style="text-align:center;padding:30px;color:var(--text-2)">Tidak ada kelas tersedia</div>'; }
  document.getElementById('penempatanList').innerHTML=html;
  document.getElementById('modalPenempatan').classList.remove('hidden');
}

async function assignKelas(siswaId, kelasId, el) {
  if (!confirm('Pindahkan murid ke kelas ini?')) return;
  try {
    // Nonaktifkan enrollment lama
    var upRes = await db.from('enrollment').update({is_active:false}).eq('siswa_id',siswaId).eq('is_active',true);
    if (upRes.error) throw new Error('Update enrollment: '+upRes.error.message);
    // Insert enrollment baru
    var insRes = await db.from('enrollment').insert({siswa_id:siswaId,kelas_id:kelasId,tahun_ajaran_id:tahunAjaranId,is_active:true});
    if (insRes.error) throw new Error('Insert enrollment: '+insRes.error.message);
    closeModal('modalPenempatan');
    alert('✅ Penempatan kelas berhasil!');
    await loadRR();
    await loadKelas();
    await loadStats();
  } catch(e) { console.error('assignKelas:',e); alert('Error: '+e.message); }
}

// ============================================
// DATA KELAS — tanpa kolom Status, row klikable
// ============================================
async function loadKelas() {
  try {
    var isMandarin = isMandarinActive();
    var jilidFilterEl = document.getElementById('filterJilidKelas');
    var tingkatFilterEl = document.getElementById('filterTingkatKelas');
    jilidFilterEl.style.display = isMandarin ? '' : 'none';
    tingkatFilterEl.style.display = isMandarin ? 'none' : '';

    var gf=document.getElementById('filterGuruKelas').value;
    var jf=jilidFilterEl.value;
    var tf=tingkatFilterEl.value;
    var q=db.from('kelas').select('*, guru:guru_id(id,nama_lengkap,kode_guru), enrollment(id,is_active,has_determination)').order('kode_kelas');
    if (activeProgramId) q=q.eq('program_id',activeProgramId);
    if (gf) q=q.eq('guru_id',gf);
    if (isMandarin && jf) q=q.eq('jilid',jf);
    if (!isMandarin && tf) q=q.like('nama_level',tf+'%');
    allKelas=(await q).data||[];
    renderKelas(allKelas);
  } catch(e) { console.error('loadKelas:',e); }
}

function renderKelas(list) {
  // Update thead to remove Status column
  var thead = document.querySelector('#tableKelas').closest('table').querySelector('thead tr');
  if (thead && thead.querySelectorAll('th').length === 8) {
    // Remove the Status th (index 6)
    thead.querySelectorAll('th')[6].remove();
  }

  var thJilid = document.getElementById('thJilidKelas');
  if (thJilid) {
    var progNow = programListAdmin.find(function(p){ return p.id === activeProgramId; });
    thJilid.textContent = (progNow && progNow.kode === 'CALISTUNG') ? 'Tingkat' : 'Jilid';
  }

  var tbody=document.getElementById('tableKelas');
  if (!list.length) { tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280">Belum ada kelas</td></tr>'; return; }
  var html='';
  for (var i=0;i<list.length;i++) {
    var k=list[i];
    var hari = (k.hari_belajar==='135') ? 'Sen·Rab·Jum' : (k.hari_belajar==='246') ? 'Sel·Kam·Sab' : (k.hari_belajar || '—');
    var jam = (k.sesi==='sore') ? '16:00–17:45' : (k.sesi==='malam') ? '18:00–19:45' : (k.sesi || '');
    var cnt   = k.enrollment ? k.enrollment.filter(function(e){ return e.is_active; }).length : 0;
    var total = k.enrollment ? k.enrollment.filter(function(e){ return !e.has_determination; }).length : 0;
    var muridCell = '<strong>'+cnt+'</strong>/<span style="color:#9ca3af">'+total+'</span>';
    html += '<tr>'
      +'<td><input type="checkbox" class="row-checkbox chk-kelas" value="'+k.id+'" onchange="updateBulkKelas()"></td>'
      +'<td><span class="table-link" onclick="viewKelasStudents(\''+k.id+'\',\''+k.kode_kelas+'\')"><strong style="font-family:monospace">'+k.kode_kelas+'</strong></span></td>'
      +'<td>'+(k.guru?k.guru.nama_lengkap:'—')+'</td>'
      +'<td>'+(k.jilid===null||k.jilid===undefined ? (k.nama_level || '—') : 'Jilid '+jilidLabel(k.jilid))+'</td>'
      +'<td>'+hari+'<br><small style="color:#6b7280">'+jam+'</small></td>'
      +'<td>'+muridCell+'</td>'
      +'<td style="display:flex;gap:4px">'
      +'<button class="btn btn-secondary btn-sm" onclick="viewKelasStudents(\''+k.id+'\',\''+k.kode_kelas+'\')">👥</button>'
      +'<button class="btn btn-secondary btn-sm" onclick="openEditKelas(\''+k.id+'\')">✏️</button>'
      +'<button class="btn btn-danger btn-sm" onclick="deleteKelas(\''+k.id+'\',\''+k.kode_kelas+'\')">🗑️</button>'
      +'</td></tr>';
  }
  tbody.innerHTML=html;
}

function openModalTambahKelas() {
  if (!sysSettings['admin_tambah_kelas']) {
    alert('❌ Fitur tambah kelas belum diaktifkan oleh Leader.');
    return;
  }
  editingKelasId=null;
  document.getElementById('modalKelasTitle').textContent='Tambah Kelas Baru';
  document.getElementById('mk_program').value='';
  ['mk_guru','mk_jilid','mk_hari','mk_sesi'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('mk_guru').innerHTML='<option value="">-- Pilih Program dulu --</option>';
  document.getElementById('mk_jilid_wrap').style.display='';
  document.getElementById('mk_kodePreview').textContent='Kode akan muncul otomatis';
  document.getElementById('modalKelas').classList.remove('hidden');
}

async function openEditKelas(id) {
  editingKelasId=id;
  var k=null; for(var i=0;i<allKelas.length;i++){if(allKelas[i].id===id){k=allKelas[i];break;}}
  if(!k) return;
  document.getElementById('modalKelasTitle').textContent='Edit Kelas';
  document.getElementById('mk_program').value=k.program_id||'';
  await onProgramKelasChange();
  document.getElementById('mk_guru').value=k.guru_id||'';
  document.getElementById('mk_jilid').value = (k.jilid === 0 || k.jilid === '0') ? 'TK' : (k.jilid||'');
  if (k.nama_level) {
    var parts = k.nama_level.split(' '); // "TK A 1" -> ["TK","A","1"]
    document.getElementById('mk_tk_tingkat').value = parts.slice(0,2).join(' '); // "TK A"
    document.getElementById('mk_tk_nomor').value = parts[2] || '';
  }
  var prog = programListAdmin.find(function(p){ return p.id === k.program_id; });
  var isMandarin = prog && prog.kode === 'MANDARIN';
  if (isMandarin) {
    document.getElementById('mk_hari').value=k.hari_belajar;
    document.getElementById('mk_sesi').value=k.sesi;
  } else {
    document.getElementById('mk_sesi_text').value=k.sesi||'';
  }
  updateKodePreview();
  document.getElementById('modalKelas').classList.remove('hidden');
}

var HARI_DEFAULT_NONMANDARIN = 'Senin-Jumat';

function updateKodePreview() {
  var gs=document.getElementById('mk_guru');
  var opt=gs.options[gs.selectedIndex];
  var kg=opt?opt.dataset.kode||'':'';
  var programId=document.getElementById('mk_program').value;
  var prog=programListAdmin.find(function(p){ return p.id===programId; });
  var isMandarin = prog && prog.kode === 'MANDARIN';
  var isCalistung = prog && prog.kode === 'CALISTUNG';
  var prefix = prog ? (prog.prefix_kelas ? prog.prefix_kelas+'-' : '') : '';
  var jilid=document.getElementById('mk_jilid').value;
  var tkTingkat=document.getElementById('mk_tk_tingkat').value;
  var tkNomor=document.getElementById('mk_tk_nomor').value;
  var hari, sesi, jam;
  if (isMandarin) {
    hari=document.getElementById('mk_hari').value;
    sesi=document.getElementById('mk_sesi').value;
    jam=sesi==='sore'?'16.00':sesi==='malam'?'18.00':'';
  } else {
    sesi=document.getElementById('mk_sesi_text').value.trim();
  }
  var levelReady = isMandarin ? !!jilid : (isCalistung ? (tkTingkat && tkNomor) : true);
  var wajibLengkap = isMandarin ? (programId && kg && hari && sesi && levelReady) : (programId && kg && sesi && levelReady);
  if (!wajibLengkap) { document.getElementById('mk_kodePreview').textContent='Lengkapi semua field'; return; }
  var levelSegment = isMandarin ? jilid : (isCalistung ? (tkTingkat.replace(' ','')+tkNomor) : '');
  var kode;
  if (isMandarin) {
    kode = levelSegment ? (prefix+kg+'-'+levelSegment+'-'+hari+'-'+jam) : (prefix+kg+'-'+hari+'-'+jam);
  } else {
    kode = levelSegment ? (prefix+kg+'-'+levelSegment+'-'+sesi) : (prefix+kg+'-'+sesi);
  }
  document.getElementById('mk_kodePreview').textContent=kode;
}

async function simpanKelas() {
  var programId=document.getElementById('mk_program').value;
  var prog=programListAdmin.find(function(p){ return p.id===programId; });
  var isMandarin = prog && prog.kode === 'MANDARIN';
  var isCalistung = prog && prog.kode === 'CALISTUNG';
  var prefix = prog ? (prog.prefix_kelas ? prog.prefix_kelas+'-' : '') : '';
  var gs=document.getElementById('mk_guru'); var guruId=gs.value;
  var opt=gs.options[gs.selectedIndex]; var kg=opt?opt.dataset.kode||'':'';
  var jilidRaw=document.getElementById('mk_jilid').value;
  var isTK = jilidRaw === 'TK';
  var jilidDB = isMandarin ? (isTK ? 0 : parseInt(jilidRaw)) : null;
  var jilidDisplay = isTK ? 'TK' : jilidRaw;
  var tkTingkat=document.getElementById('mk_tk_tingkat').value;
  var tkNomor=document.getElementById('mk_tk_nomor').value;
  var namaLevel = isCalistung ? (tkTingkat+' '+tkNomor) : null;

  var hari, sesi, jamMulai, jamSelesai;
  if (isMandarin) {
    hari=document.getElementById('mk_hari').value;
    sesi=document.getElementById('mk_sesi').value;
    jamMulai=sesi==='sore'?'16:00:00':'18:00:00'; jamSelesai=sesi==='sore'?'17:45:00':'19:45:00';
  } else {
    hari = HARI_DEFAULT_NONMANDARIN;
    sesi = document.getElementById('mk_sesi_text').value.trim();
    jamMulai = null; jamSelesai = null;
  }

  if (!programId||!guruId||!sesi) { alert('Lengkapi semua field!'); return; }
  if (isMandarin && (!hari||!jilidRaw)) { alert('Lengkapi semua field!'); return; }
  if (isCalistung && (!tkTingkat||!tkNomor)) { alert('Lengkapi semua field!'); return; }

  var levelSegment = isMandarin ? jilidDisplay : (isCalistung ? (tkTingkat.replace(' ','')+tkNomor) : '');
  var kodeKelas;
  if (isMandarin) {
    var jam=sesi==='sore'?'16.00':'18.00';
    kodeKelas = levelSegment ? (prefix+kg+'-'+levelSegment+'-'+hari+'-'+jam) : (prefix+kg+'-'+hari+'-'+jam);
  } else {
    kodeKelas = levelSegment ? (prefix+kg+'-'+levelSegment+'-'+sesi) : (prefix+kg+'-'+sesi);
  }
  try {
    if (editingKelasId) {
      var er=(await db.from('kelas').update({guru_id:guruId,jilid:jilidDB,nama_level:namaLevel,hari_belajar:hari,sesi:sesi,jam_mulai:jamMulai,jam_selesai:jamSelesai,program_id:programId}).eq('id',editingKelasId)).error;
      if(er){alert('Error: '+er.message);return;} alert('✅ Kelas diupdate!');
    } else {
      var er2=(await db.from('kelas').insert({kode_kelas:kodeKelas,guru_id:guruId,jilid:jilidDB,nama_level:namaLevel,hari_belajar:hari,sesi:sesi,jam_mulai:jamMulai,jam_selesai:jamSelesai,tahun_ajaran_id:tahunAjaranId,program_id:programId})).error;
      if(er2){alert('Error: '+er2.message);return;} alert('✅ Kelas '+kodeKelas+' ditambahkan!');
    }
    closeModal('modalKelas'); await loadKelas(); await loadStats();
  } catch(e){console.error('simpanKelas:',e);alert('Error: '+e.message);}
}

async function deleteKelas(id,kode) {
  if(!confirm('Hapus kelas '+kode+'?')) return;
  try {
    // Cek apakah kelas ini masih ada murid aktif
    var enrollAktif=(await db.from('enrollment').select('id').eq('kelas_id',id).eq('is_active',true)).data||[];
    if (enrollAktif.length>0) {
      alert('⚠️ Kelas "'+kode+'" tidak bisa dihapus!\nMasih ada '+enrollAktif.length+' murid aktif di kelas ini.\n\nPindahkan murid-murid tersebut terlebih dahulu.');
      return;
    }
    // Cek riwayat pendaftaran yang mereferensikan kelas ini
    var pendaftaranTerkait=(await db.from('pendaftaran').select('id').eq('kelas_dipilih',id)).data||[];
    if (pendaftaranTerkait.length>0) {
      if (!confirm('⚠️ Kelas "'+kode+'" memiliki '+pendaftaranTerkait.length+' riwayat pendaftaran terkait.\nMenghapus kelas ini akan ikut menghapus riwayat pendaftaran tersebut.\n\nLanjutkan?')) return;
      var erPnd=(await db.from('pendaftaran').delete().eq('kelas_dipilih',id)).error;
      if (erPnd) { alert('❌ Gagal menghapus riwayat pendaftaran: '+erPnd.message); return; }
    }
    // Hapus enrollment non-aktif yang masih nyantol
    var erEnr=(await db.from('enrollment').delete().eq('kelas_id',id)).error;
    if (erEnr) { alert('❌ Gagal menghapus data enrollment: '+erEnr.message); return; }
    var erKelas=(await db.from('kelas').delete().eq('id',id)).error;
    if (erKelas) { alert('❌ Gagal menghapus kelas: '+erKelas.message); return; }
    await loadKelas(); await loadStats();
  } catch(e) { console.error('deleteKelas:',e); alert('Error: '+e.message); }
}

function updateBulkKelas(){
  document.querySelectorAll('.chk-kelas:checked').forEach(function(c){selectedKelas.add(c.value);});
  document.querySelectorAll('.chk-kelas:not(:checked)').forEach(function(c){selectedKelas.delete(c.value);});
  var bar=document.getElementById('bulkBarKelas');
  if(selectedKelas.size>0){bar.classList.add('show');document.getElementById('bulkCountKelas').textContent=selectedKelas.size+' kelas dipilih';}
  else bar.classList.remove('show');
}
function toggleAllKelas(cb){document.querySelectorAll('.chk-kelas').forEach(function(c){c.checked=cb.checked;cb.checked?selectedKelas.add(c.value):selectedKelas.delete(c.value);});updateBulkKelas();}
async function bulkDeleteKelas(){
  if(!confirm('Hapus '+selectedKelas.size+' kelas?')) return;
  var gagal=[], berhasil=0;
  for(var id of selectedKelas){
    var k=allKelas.find(function(x){return x.id===id;});
    var kode=k?k.kode_kelas:id;
    var enrollAktif=(await db.from('enrollment').select('id').eq('kelas_id',id).eq('is_active',true)).data||[];
    if (enrollAktif.length>0) { gagal.push(kode+' (masih ada murid aktif)'); continue; }
    var pendaftaranTerkait=(await db.from('pendaftaran').select('id').eq('kelas_dipilih',id)).data||[];
    if (pendaftaranTerkait.length>0) await db.from('pendaftaran').delete().eq('kelas_dipilih',id);
    await db.from('enrollment').delete().eq('kelas_id',id);
    var er=(await db.from('kelas').delete().eq('id',id)).error;
    if (er) { gagal.push(kode+' ('+er.message+')'); continue; }
    berhasil++;
  }
  if (gagal.length) alert('Berhasil hapus '+berhasil+' kelas.\n\nGagal:\n'+gagal.join('\n'));
  clearSelectKelas();await loadKelas();await loadStats();
}
function clearSelectKelas(){selectedKelas.clear();document.querySelectorAll('.chk-kelas').forEach(function(c){c.checked=false;});document.getElementById('checkAllKelas').checked=false;document.getElementById('bulkBarKelas').classList.remove('show');}

// ============================================
// DATA MURID — toggle status + fix enrollment
// ============================================
async function loadMurid() {
  try {
    var res=await db.from('siswa').select('*, enrollment(is_active,kelas:kelas_id(kode_kelas,jilid,nama_level,program_id))').order('nomor_induk');
    var list=res.data||[];
    if (activeProgramId) {
      list = list.filter(function(s){
        var ae=null;
        if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
        return ae && ae.kelas && ae.kelas.program_id===activeProgramId;
      });
    }
    allMurid=list; filterMurid();
  } catch(e){console.error('loadMurid:',e);}
}

function renderMurid(list) {
  var tbody=document.getElementById('tableMurid');
  var showMandarin = isMandarinActive();
  var thMandarin = document.getElementById('thNamaMandarinMurid');
  if (thMandarin) thMandarin.style.display = showMandarin ? '' : 'none';
  if(!list.length){tbody.innerHTML='<tr><td colspan="'+(showMandarin?7:6)+'" style="text-align:center;padding:40px;color:#6b7280">Belum ada murid</td></tr>';return;}
  var html='';
  for(var i=0;i<list.length;i++){
    var s=list[i];
    var ae=null;
    if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
    var kelas=ae?ae.kelas:null;
    html += '<tr>'
      +'<td><input type="checkbox" class="row-checkbox chk-murid" value="'+s.id+'" onchange="updateBulkMurid()"></td>'
      +'<td>'+s.nomor_induk+'</td>'
      +'<td><span class="table-link" onclick="showDetailMurid(\''+s.id+'\')">'+s.nama_lengkap+'</span></td>'
      +(showMandarin ? '<td style="color:#6b7280">'+(s.nama_mandarin||'—')+'</td>' : '')
      +'<td style="font-family:monospace">'+(kelas?kelas.kode_kelas:'—')+'</td>'
      +'<td>'
      +'<label class="toggle"><input type="checkbox" '+(s.status?'checked':'')+' onchange="updateStatusMurid(\''+s.id+'\',this.checked)"><span class="toggle-slider"></span></label>'
      +'<span style="margin-left:6px;font-size:11px;color:'+(s.status?'var(--green)':'#9ca3af')+'">'+(s.status?'Aktif':'Nonaktif')+'</span>'
      +'</td>'
      +'<td style="display:flex;gap:4px">'
      +'<button class="btn-icon" onclick="showDetailMurid(\''+s.id+'\')">👁</button>'
      +'<button class="btn btn-secondary btn-sm" onclick="openEditMurid(\''+s.id+'\')">✏️</button>'
      +'<button class="btn btn-danger btn-sm" onclick="deleteMurid(\''+s.id+'\',\''+s.nama_lengkap.replace(/'/g,"'")+'\')">🗑️</button>'
      +'</td></tr>';
  }
  tbody.innerHTML=html;
}

async function updateStatusMurid(id, active) {
  try {
    await db.from('siswa').update({status:active}).eq('id',id);
    // Sync enrollment: kalau nonaktif → nonaktifkan semua enrollment aktif
    if (!active) {
      await db.from('enrollment').update({is_active:false}).eq('siswa_id',id).eq('is_active',true);
    }
    await loadMurid(); await loadStats();
  }
  catch(e) { alert('Error: '+e.message); }
}

function filterMurid() {
  var isMandarin = isMandarinActive();
  var jilidFilterEl = document.getElementById('filterJilidMurid');
  var tingkatFilterEl = document.getElementById('filterTingkatMurid');
  jilidFilterEl.style.display = isMandarin ? '' : 'none';
  tingkatFilterEl.style.display = isMandarin ? 'none' : '';

  var q=document.getElementById('searchMurid').value.toLowerCase();
  var st=document.getElementById('filterStatusMurid').value;
  var jl=jilidFilterEl.value;
  var tk=tingkatFilterEl.value;
  renderMurid(allMurid.filter(function(s){
    var mq=s.nama_lengkap.toLowerCase().indexOf(q)>=0||s.nomor_induk.toLowerCase().indexOf(q)>=0||(s.nama_mandarin||'').toLowerCase().indexOf(q)>=0;
    var ms=st===''||String(s.status)===st;
    var ae=null; if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
    var mj = isMandarin ? (jl===''||String(ae&&ae.kelas?ae.kelas.jilid:'')===jl) : true;
    var mt = (!isMandarin && tk) ? !!(ae && ae.kelas && ae.kelas.nama_level && ae.kelas.nama_level.indexOf(tk)===0) : true;
    return mq&&ms&&mj&&mt;
  }));
}

function showDetailMurid(id) {
  var s=null; for(var i=0;i<allMurid.length;i++){if(allMurid[i].id===id){s=allMurid[i];break;}}
  if(!s) return;
  var ae=null; if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
  var kelas=ae?ae.kelas:null;
  document.getElementById('detailMuridContent').innerHTML =
    '<div style="text-align:center;margin-bottom:16px">'
    +'<div class="avatar avatar-lg" style="margin:0 auto">'+s.nama_lengkap[0].toUpperCase()+'</div>'
    +'<div style="font-size:18px;font-weight:700;margin-top:8px">'+s.nama_lengkap+'</div>'
    +(s.nama_mandarin?'<div style="font-size:16px;color:#6b7280">'+s.nama_mandarin+'</div>':'')
    +'<span class="badge '+(s.status?'badge-green':'badge-red')+'" style="margin-top:4px">'+(s.status?'Aktif':'Nonaktif')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">No. Induk</span><span class="modal-value">'+s.nomor_induk+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">HP Murid</span><span class="modal-value">'+(s.telepon||'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">HP Orang Tua</span><span class="modal-value">'+(s.telepon_ortu||'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">Tempat Lahir</span><span class="modal-value">'+(s.tempat_lahir||'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">Tanggal Lahir</span><span class="modal-value">'+(s.tanggal_lahir?new Date(s.tanggal_lahir).toLocaleDateString('id-ID'):'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">Alamat</span><span class="modal-value">'+(s.alamat||'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">Kelas</span><span class="modal-value" style="font-family:monospace">'+(kelas?kelas.kode_kelas:'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">Tanggal Join</span><span class="modal-value">'+(s.tanggal_join?new Date(s.tanggal_join).toLocaleDateString('id-ID'):'—')+'</span></div>'
    +'<div style="margin-top:16px"><button class="btn btn-secondary btn-sm" onclick="openEditMurid(\''+s.id+'\');closeModal(\'modalDetailMurid\')">✏️ Edit Data</button></div>';
  document.getElementById('modalDetailMurid').classList.remove('hidden');
}

async function populateKelasDropdownMurid(selectedKelasId) {
  var sel = document.getElementById('mm_kelas');
  var q = db.from('kelas').select('id,kode_kelas,jilid,nama_level,hari_belajar,sesi,program_id').eq('is_active',true).order('kode_kelas');
  if (typeof activeProgramId !== 'undefined' && activeProgramId) q = q.eq('program_id', activeProgramId);
  var kelasList = (await q).data || [];
  var opts = '<option value="">-- Pilih --</option>';
  for (var i=0; i<kelasList.length; i++) {
    var k = kelasList[i];
    var jamLbl = k.sesi==='sore' ? '16:00–17:45' : k.sesi==='malam' ? '18:00–19:45' : (k.sesi||'');
    var lvl = kelasLevelLabel(k);
    opts += '<option value="'+k.id+'" data-jilid="'+k.jilid+'">'+k.kode_kelas+(lvl?' — '+lvl:'')+' ('+jamLbl+')</option>';
  }
  sel.innerHTML = opts;
  sel.value = selectedKelasId || '';
}

function openModalTambahMurid() {
  editingMuridId=null;
  document.getElementById('modalMuridTitle').textContent='Tambah Murid';
  document.getElementById('mm_id').value='';
  ['mm_namaIndo','mm_namaMandarin','mm_hpMurid','mm_hpOrtu','mm_tempatLahir','mm_alamat'].forEach(function(id){document.getElementById(id).value='';});
  ['mm_tanggalLahir','mm_tanggalJoin'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('mm_namaMandarinWrap').style.display = isMandarinActive() ? '' : 'none';
  populateKelasDropdownMurid('');
  document.getElementById('mm_status').value='true';
  document.getElementById('mm_tanggalJoin').value=new Date().toISOString().split('T')[0];
  document.getElementById('modalMurid').classList.remove('hidden');
}

async function openEditMurid(id) {
  editingMuridId=id;
  var s=null; for(var i=0;i<allMurid.length;i++){if(allMurid[i].id===id){s=allMurid[i];break;}} if(!s) return;
  document.getElementById('modalMuridTitle').textContent='Edit Data Murid';
  document.getElementById('mm_id').value=s.id;
  document.getElementById('mm_namaIndo').value=s.nama_lengkap||'';
  document.getElementById('mm_namaMandarin').value=s.nama_mandarin||'';
  document.getElementById('mm_namaMandarinWrap').style.display = isMandarinActive() ? '' : 'none';
  document.getElementById('mm_hpMurid').value=s.telepon||'';
  document.getElementById('mm_hpOrtu').value=s.telepon_ortu||'';
  document.getElementById('mm_tempatLahir').value=s.tempat_lahir||'';
  document.getElementById('mm_tanggalLahir').value=s.tanggal_lahir||'';
  document.getElementById('mm_alamat').value=s.alamat||'';
  document.getElementById('mm_tanggalJoin').value=s.tanggal_join||'';
  // Cari kelas aktif murid ini dari enrollment
  var enr = (await db.from('enrollment').select('kelas_id').eq('siswa_id',id).eq('is_active',true).limit(1)).data || [];
  await populateKelasDropdownMurid(enr.length>0 ? enr[0].kelas_id : '');
  document.getElementById('mm_status').value=String(s.status);
  document.getElementById('modalMurid').classList.remove('hidden');
}

async function simpanMurid() {
  var namaIndo=document.getElementById('mm_namaIndo').value.trim();
  var hpOrtu=document.getElementById('mm_hpOrtu').value.trim();
  if(!namaIndo||!hpOrtu){alert('Nama dan HP Orang Tua wajib!');return;}
  try {
    if (!editingMuridId) {
      var dup=(await db.from('siswa').select('id,status').ilike('nama_lengkap',namaIndo)).data||[];
      var aktif=dup.filter(function(x){return x.status;});
      var nonAktif=dup.filter(function(x){return !x.status;});
      if(aktif.length>0){alert('⚠️ Murid "'+namaIndo+'" sudah AKTIF!\nCek tab Data Murid.');return;}
      if(nonAktif.length>0){if(!confirm('⚠️ Ditemukan murid "'+namaIndo+'" yang TIDAK AKTIF.\nApakah ini murid berbeda?\n• OK → Daftar baru\n• Batal → Aktifkan murid lama via toggle'))return;}
    }
    var kelasSel = document.getElementById('mm_kelas');
    var kelasId = kelasSel.value || null;
    var jilidTerpilih = kelasId ? parseInt(kelasSel.options[kelasSel.selectedIndex].getAttribute('data-jilid')) : null;
    var data={
      nama_lengkap:namaIndo,
      nama_mandarin:document.getElementById('mm_namaMandarin').value.trim()||null,
      telepon:document.getElementById('mm_hpMurid').value.trim()||null,
      telepon_ortu:hpOrtu,
      tempat_lahir:document.getElementById('mm_tempatLahir').value.trim()||null,
      tanggal_lahir:document.getElementById('mm_tanggalLahir').value||null,
      alamat:document.getElementById('mm_alamat').value.trim()||null,
      tanggal_join:document.getElementById('mm_tanggalJoin').value||null,
      tingkat_jilid:jilidTerpilih,
      status:document.getElementById('mm_status').value==='true'
    };
    var siswaId;
    if(editingMuridId){
      var er=(await db.from('siswa').update(data).eq('id',editingMuridId)).error;
      if(er){alert('Error: '+er.message);return;}
      siswaId=editingMuridId;
      // Cek enrollment aktif saat ini
      var enrNow=(await db.from('enrollment').select('id,kelas_id').eq('siswa_id',siswaId).eq('is_active',true)).data||[];
      var kelasLama = enrNow.length>0 ? enrNow[0].kelas_id : null;
      if (kelasId !== kelasLama) {
        // Nonaktifkan enrollment lama
        if (enrNow.length>0) await db.from('enrollment').update({is_active:false}).eq('siswa_id',siswaId).eq('is_active',true);
        // Aktifkan/insert enrollment baru
        if (kelasId) {
          var existing=(await db.from('enrollment').select('id').eq('siswa_id',siswaId).eq('kelas_id',kelasId)).data||[];
          if (existing.length>0) await db.from('enrollment').update({is_active:true}).eq('id',existing[0].id);
          else await db.from('enrollment').insert({siswa_id:siswaId,kelas_id:kelasId,is_active:true});
        }
      }
      alert('✅ Data murid diupdate!');
    } else {
      var pfx=currentProgramPrefix()+'S';
      var cnt=(await db.from('siswa').select('*',{count:'exact',head:true}).ilike('nomor_induk',pfx+'%')).count||0;
      data.nomor_induk=pfx+String(cnt+1).padStart(4,'0');
      var ins=(await db.from('siswa').insert(data).select('id').single());
      if(ins.error){alert('Error: '+ins.error.message);return;}
      siswaId=ins.data.id;
      if (kelasId) {
        var erEnr=(await db.from('enrollment').insert({siswa_id:siswaId,kelas_id:kelasId,is_active:true})).error;
        if (erEnr) { alert('⚠️ Murid tersimpan, tapi gagal mendaftarkan ke kelas: '+erEnr.message); }
      }
      alert('✅ Murid ditambahkan! No. Induk: '+data.nomor_induk);
    }
    closeModal('modalMurid'); await loadMurid(); await loadStats();
  } catch(e){console.error('simpanMurid:',e);alert('Error: '+e.message);}
}

async function deleteMurid(id,nama) {
  if(!confirm('Hapus murid "'+nama+'"?\n\nSemua data terkait (enrollment, iuran, absensi, penilaian) juga akan ikut terhapus permanen.')) return;
  var btn = event?.target;
  if(btn) { btn.disabled=true; btn.textContent='⏳'; }
  try {
    await db.from('absensi').delete().eq('siswa_id',id);
    await db.from('nilai_detail').delete().eq('siswa_id',id);
    await db.from('penilaian').delete().eq('siswa_id',id);
    await db.from('iuran').delete().eq('siswa_id',id);
    await db.from('enrollment').delete().eq('siswa_id',id);
    var {error} = await db.from('siswa').delete().eq('id',id);
    if(error) { alert('❌ Gagal hapus: '+error.message); return; }
    alert('✅ Murid "'+nama+'" berhasil dihapus.');
  } catch(e) { alert('❌ Error: '+e.message); }
  await loadMurid(); await loadStats();
}

function updateBulkMurid(){
  document.querySelectorAll('.chk-murid:checked').forEach(function(c){selectedMurid.add(c.value);});
  document.querySelectorAll('.chk-murid:not(:checked)').forEach(function(c){selectedMurid.delete(c.value);});
  var bar=document.getElementById('bulkBarMurid');
  if(selectedMurid.size>0){bar.classList.add('show');document.getElementById('bulkCountMurid').textContent=selectedMurid.size+' murid dipilih';}
  else bar.classList.remove('show');
}
function toggleAllMurid(cb){document.querySelectorAll('.chk-murid').forEach(function(c){c.checked=cb.checked;cb.checked?selectedMurid.add(c.value):selectedMurid.delete(c.value);});updateBulkMurid();}
async function bulkDeleteMurid(){
  if(!confirm('Hapus '+selectedMurid.size+' murid?\n\nSemua data terkait (enrollment, iuran, absensi, penilaian) juga akan ikut terhapus permanen.')) return;
  var ids = Array.from(selectedMurid);
  for(var id of ids){
    await db.from('absensi').delete().eq('siswa_id',id);
    await db.from('nilai_detail').delete().eq('siswa_id',id);
    await db.from('penilaian').delete().eq('siswa_id',id);
    await db.from('iuran').delete().eq('siswa_id',id);
    await db.from('enrollment').delete().eq('siswa_id',id);
    await db.from('siswa').delete().eq('id',id);
  }
  clearSelectMurid(); await loadMurid(); await loadStats();
}
function clearSelectMurid(){selectedMurid.clear();document.querySelectorAll('.chk-murid').forEach(function(c){c.checked=false;});document.getElementById('checkAllMurid').checked=false;document.getElementById('bulkBarMurid').classList.remove('show');}

// ============================================
// DATA GURU — toggle status
// ============================================
// ============================================
// HELPERS
// ============================================
async function populateGuruDropdowns() {
  try {
    var q = db.from('guru').select('id,nama_lengkap,kode_guru').eq('is_active',true);
    if (typeof activeProgramId !== 'undefined' && activeProgramId) q = q.eq('program_id', activeProgramId);
    var data=(await q).data||[];
    var fOpts='<option value="">Semua Guru</option>';
    for(var i=0;i<data.length;i++){
      fOpts+='<option value="'+data[i].id+'">'+data[i].nama_lengkap+'</option>';
    }
    var fg=document.getElementById('filterGuruKelas'); if(fg) fg.innerHTML=fOpts;
  } catch(e){console.error('populateGuruDropdowns:',e);}
}

var programListAdmin = [];
async function populateProgramDropdownKelas() {
  try {
    var { data } = await db.from('program').select('*').eq('is_active', true).order('urutan');
    programListAdmin = data || [];
    var opts = '<option value="">-- Pilih --</option>';
    for (var i=0;i<programListAdmin.length;i++) opts += '<option value="'+programListAdmin[i].id+'">'+programListAdmin[i].nama+'</option>';
    document.getElementById('mk_program').innerHTML = opts;
  } catch(e){ console.error('populateProgramDropdownKelas:',e); }
}

async function onProgramKelasChange() {
  var programId = document.getElementById('mk_program').value;
  var gsel = document.getElementById('mk_guru');
  var prog = programListAdmin.find(function(p){ return p.id === programId; });
  var isMandarin = prog && prog.kode === 'MANDARIN';
  var isCalistung = prog && prog.kode === 'CALISTUNG';
  document.getElementById('mk_jilid_wrap').style.display = isMandarin ? '' : 'none';
  document.getElementById('mk_tk_tingkat_wrap').style.display = isCalistung ? '' : 'none';
  document.getElementById('mk_tk_nomor_wrap').style.display = isCalistung ? '' : 'none';
  document.getElementById('mk_hari_select_wrap').style.display = isMandarin ? '' : 'none';
  document.getElementById('mk_sesi_select_wrap').style.display = isMandarin ? '' : 'none';
  document.getElementById('mk_sesi_text_wrap').style.display = isMandarin ? 'none' : '';
  document.getElementById('mk_note_manual').style.display = isMandarin ? 'none' : '';
  if (!isMandarin) document.getElementById('mk_jilid').value = '';
  if (!isCalistung) { document.getElementById('mk_tk_tingkat').value=''; document.getElementById('mk_tk_nomor').value=''; }

  if (!programId) { gsel.innerHTML = '<option value="">-- Pilih Program dulu --</option>'; updateKodePreview(); return; }

  var { data } = await db.from('guru')
    .select('id,nama_lengkap,kode_guru,is_active')
    .eq('program_id', programId).eq('is_active', true);
  var opts = '<option value="">-- Pilih --</option>';
  (data||[]).forEach(function(g){
    opts += '<option value="'+g.id+'" data-kode="'+g.kode_guru+'">'+g.nama_lengkap+' ['+g.kode_guru+']</option>';
  });
  gsel.innerHTML = opts;
  updateKodePreview();
}

async function populateKelasSelect(elId) {
  try {
    var q=db.from('kelas').select('id,kode_kelas,jilid,nama_level').eq('is_active',true).order('kode_kelas');
    if (typeof activeProgramId !== 'undefined' && activeProgramId) q = q.eq('program_id', activeProgramId);
    var data=(await q).data||[];
    var html='<option value="">-- Pilih Kelas --</option>';
    for(var i=0;i<data.length;i++){
      var lvl = kelasLevelLabel(data[i]);
      html+='<option value="'+data[i].id+'">'+data[i].kode_kelas+(lvl?' — '+lvl:'')+'</option>';
    }
    document.getElementById(elId).innerHTML=html;
  } catch(e){console.error('populateKelasSelect:',e);}
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.addEventListener('click', function(e) { if(e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden'); });

// ============================================
// DATA GURU (VIEW ONLY — Admin TU)
// ============================================
async function loadGuruAdmin() {
  var tbody = document.getElementById('tableGuruAdmin');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="6">⏳ Memuat...</td></tr>';
  var q = db.from('guru').select('*, kelas(id, is_active)').order('nomor_induk');
  if (activeProgramId) q = q.eq('program_id', activeProgramId);
  var { data } = await q;
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:#6b7280">Belum ada data guru</td></tr>'; return; }
  tbody.innerHTML = data.map(function(g) {
    var jmlKelas = (g.kelas||[]).filter(function(k){return k.is_active;}).length;
    return '<tr>'
      +'<td>'+(g.nomor_induk||'—')+'</td>'
      +'<td><span style="font-family:monospace;font-weight:700;color:var(--pink)">'+g.kode_guru+'</span></td>'
      +'<td><strong>'+g.nama_lengkap+'</strong></td>'
      +'<td>'+(g.telepon||'—')+'</td>'
      +'<td>'+jmlKelas+' kelas</td>'
      +'<td>'+(g.is_active?'<span class="badge badge-green">Aktif</span>':'<span class="badge badge-red">Nonaktif</span>')+'</td>'
      +'</tr>';
  }).join('');
}

// ============================================
// KALDIK SEMESTER
// ============================================
var editingKaldikId = null;

async function loadKaldik() {
  var tbody = document.getElementById('tableKaldik');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="6">⏳ Memuat...</td></tr>';

  var filterEl = document.getElementById('filterSemesterKaldik');
  var filterVal = filterEl ? filterEl.value : '';

  var q = db.from('kaldik').select('*').order('tanggal_mulai', {ascending: true});
  if (typeof activeProgramId !== 'undefined' && activeProgramId) q = q.eq('program_id', activeProgramId);
  if (filterVal) q = q.eq('semester', filterVal);
  var { data, error } = await q;
  if (error) { tbody.innerHTML = '<tr><td colspan="6" style="color:var(--pink)">Error: '+error.message+'</td></tr>'; return; }

  // Populate semester filter
  if (filterEl) {
    var allSem = (data||[]).map(function(d){return d.semester;});
    var uniq = allSem.filter(function(v,i,a){return a.indexOf(v)===i;}).sort();
    var curVal = filterEl.value;
    filterEl.innerHTML = '<option value="">Semua Semester</option>';
    uniq.forEach(function(s){ filterEl.innerHTML += '<option value="'+s+'"'+(s===curVal?' selected':'')+'>'+s+'</option>'; });
  }

  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-2)">Belum ada event kaldik</td></tr>'; return; }

  var html = '';
  data.forEach(function(k) {
    var tglMulai = k.tanggal_mulai ? new Date(k.tanggal_mulai).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '—';
    var tglSelesai = k.tanggal_selesai ? new Date(k.tanggal_selesai).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '—';
    html += '<tr>'
      +'<td><span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600">'+k.semester+'</span></td>'
      +'<td><strong>'+k.judul+'</strong></td>'
      +'<td>'+tglMulai+'</td>'
      +'<td>'+tglSelesai+'</td>'
      +'<td style="color:var(--text-2);font-size:12px">'+(k.keterangan||'—')+'</td>'
      +'<td style="display:flex;gap:4px">'
      +'<button class="btn btn-secondary btn-sm" onclick="openEditKaldik(\''+k.id+'\')">✏️</button>'
      +'<button class="btn btn-danger btn-sm" onclick="deleteKaldik(\''+k.id+'\',\''+k.judul.replace(/'/g,'\\\'')+'\')" >🗑️</button>'
      +'</td></tr>';
  });
  tbody.innerHTML = html;
}

function openModalTambahKaldik() {
  editingKaldikId = null;
  document.getElementById('modalKaldikTitle').textContent = 'Tambah Event Kaldik';
  ['kd_semester','kd_judul','kd_tglMulai','kd_tglSelesai','kd_keterangan'].forEach(function(id){ document.getElementById(id).value=''; });
  document.getElementById('modalKaldik').classList.remove('hidden');
}

async function openEditKaldik(id) {
  var { data: k } = await db.from('kaldik').select('*').eq('id', id).single();
  if (!k) return;
  editingKaldikId = id;
  document.getElementById('modalKaldikTitle').textContent = 'Edit Event Kaldik';
  document.getElementById('kd_semester').value    = k.semester || '';
  document.getElementById('kd_judul').value       = k.judul || '';
  document.getElementById('kd_tglMulai').value    = k.tanggal_mulai || '';
  document.getElementById('kd_tglSelesai').value  = k.tanggal_selesai || '';
  document.getElementById('kd_keterangan').value  = k.keterangan || '';
  document.getElementById('modalKaldik').classList.remove('hidden');
}

async function simpanKaldik() {
  var semester   = document.getElementById('kd_semester').value.trim();
  var judul      = document.getElementById('kd_judul').value.trim();
  var tglMulai   = document.getElementById('kd_tglMulai').value;
  var tglSelesai = document.getElementById('kd_tglSelesai').value || null;
  var keterangan = document.getElementById('kd_keterangan').value.trim() || null;
  if (!semester || !judul || !tglMulai) { alert('Semester, Judul, dan Tanggal Mulai wajib diisi!'); return; }
  var payload = { semester, judul, tanggal_mulai: tglMulai, tanggal_selesai: tglSelesai, keterangan, program_id: activeProgramId };
  var error;
  if (editingKaldikId) {
    ({ error } = await db.from('kaldik').update(payload).eq('id', editingKaldikId));
  } else {
    ({ error } = await db.from('kaldik').insert(payload));
  }
  if (error) { alert('❌ Gagal: '+error.message); return; }
  alert('✅ Event kaldik berhasil disimpan!');
  closeModal('modalKaldik');
  await loadKaldik();
}

async function deleteKaldik(id, judul) {
  if (!confirm('Hapus event "'+judul+'"?')) return;
  var { error } = await db.from('kaldik').delete().eq('id', id);
  if (error) { alert('❌ Gagal hapus: '+error.message); return; }
  await loadKaldik();
}

// ============================================
// APPROVAL STATUS MURID
// ============================================
async function loadApprovalStatus() {
  var tbody = document.getElementById('tableApprovalStatus');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="9">⏳ Memuat...</td></tr>';

  var filterVal = document.getElementById('filterStatusReq').value;
  var q = db.from('request_status_murid')
    .select('*, siswa:siswa_id(nomor_induk,nama_lengkap,enrollment(is_active,kelas:kelas_id(program_id)))')
    .order('created_at', { ascending: false });
  if (filterVal) q = q.eq('status_request', filterVal);

  var { data, error } = await q;
  if (error) { tbody.innerHTML = '<tr><td colspan="9" style="color:var(--red)">Error: '+error.message+'</td></tr>'; return; }
  if (activeProgramId) {
    data = (data||[]).filter(function(r){
      var ae = null;
      if (r.siswa && r.siswa.enrollment) { for (var i=0;i<r.siswa.enrollment.length;i++){ if (r.siswa.enrollment[i].is_active){ ae = r.siswa.enrollment[i]; break; } } }
      return ae && ae.kelas && ae.kelas.program_id === activeProgramId;
    });
  }
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:#9ca3af">Tidak ada data</td></tr>'; return; }

  // Load nama requester dari profiles
  var requesterIds = [...new Set(data.map(function(r){ return r.requested_by; }).filter(Boolean))];
  var requesterMap = {};
  if (requesterIds.length) {
    var { data: profiles } = await db.from('profiles').select('id, nama_lengkap').in('id', requesterIds);
    (profiles||[]).forEach(function(p){ requesterMap[p.id] = p.nama_lengkap; });
  }

  tbody.innerHTML = data.map(function(r) {
    var statusDiminta = r.status_diminta
      ? '<span class="badge badge-green">Aktif</span>'
      : '<span class="badge badge-red">Nonaktif</span>';
    var statusBadge =
      r.status_request === 'pending'  ? '<span class="badge" style="background:#fef3c7;color:#92400e">⏳ Menunggu</span>' :
      r.status_request === 'approved' ? '<span class="badge badge-green">✅ Disetujui</span>' :
      '<span class="badge badge-red">❌ Ditolak</span>';
    var tgl = r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '—';
    var aksi = r.status_request === 'pending'
      ? '<button class="btn btn-primary btn-sm" onclick="approveStatusRequest(\''+r.id+'\')" style="margin-right:4px">✅ Setuju</button>'
        + '<button class="btn btn-danger btn-sm" onclick="rejectStatusRequest(\''+r.id+'\')">❌ Tolak</button>'
      : '<span style="color:#9ca3af;font-size:12px">—</span>';

    var detailId = 'detail_' + r.id;
    var detailRow = '<tr id="'+detailId+'" style="display:none;background:#f9fafb">'
      + '<td colspan="5" style="padding:12px 20px">'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;font-size:12px">'
      + '<div><span style="color:#6b7280">Diminta Oleh:</span><br><strong>'+(requesterMap[r.requested_by]||'—')+'</strong></div>'
      + '<div><span style="color:#6b7280">Status Saat Ini:</span><br>'+(r.status_saat_ini?'<span class="badge badge-green">Aktif</span>':'<span class="badge badge-red">Nonaktif</span>')+'</div>'
      + '<div><span style="color:#6b7280">Alasan:</span><br><strong>'+(r.alasan||'—')+'</strong></div>'
      + '<div><span style="color:#6b7280">Tanggal:</span><br><strong>'+tgl+'</strong></div>'
      + '</div></td></tr>';

    return '<tr style="cursor:pointer" onclick="toggleDetailRow(\''+detailId+'\')">'
      + '<td style="font-family:monospace">'+(r.siswa?.nomor_induk||'—')+'</td>'
      + '<td><strong>'+(r.siswa?.nama_lengkap||'—')+'</strong></td>'
      + '<td>'+statusDiminta+'</td>'
      + '<td>'+statusBadge+'</td>'
      + '<td onclick="event.stopPropagation()">'+aksi+'</td>'
      + '</tr>' + detailRow;
  }).join('');
}

async function approveStatusRequest(id) {
  if (!confirm('Setujui perubahan status murid ini?')) return;
  try {
    var { data: req, error: errFetch } = await db.from('request_status_murid').select('*').eq('id', id).single();
    if (errFetch || !req) { alert('❌ Data request tidak ditemukan'); return; }

    var { error: errUpdateSiswa } = await db.from('siswa').update({ status: req.status_diminta }).eq('id', req.siswa_id);
    if (errUpdateSiswa) { alert('❌ Gagal update status murid: '+errUpdateSiswa.message); return; }

    var { error: errUpdateReq } = await db.from('request_status_murid')
      .update({ status_request: 'approved', approved_at: new Date().toISOString() }).eq('id', id);
    if (errUpdateReq) { alert('❌ Gagal update request: '+errUpdateReq.message); return; }

    alert('✅ Status murid berhasil diperbarui!');
    await loadApprovalStatus();
    await loadStats();
  } catch(e) { alert('Error: '+e.message); }
}

async function rejectStatusRequest(id) {
  if (!confirm('Tolak permintaan perubahan status ini?')) return;
  var { error } = await db.from('request_status_murid')
    .update({ status_request: 'rejected', approved_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert('❌ Gagal: '+error.message); return; }
  alert('Permintaan ditolak.');
  await loadApprovalStatus();
}

function toggleDetailRow(id) {
  var row = document.getElementById(id);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

// ============================================
// PENGATURAN LINK GRUP WA (per program)
// ============================================
async function loadWaGroupLink() {
  var { data } = await db.from('program').select('*').order('urutan');
  var progs = data || [];
  var wrap = document.getElementById('waGroupLinkList');
  if (!progs.length) { wrap.innerHTML = '<div style="color:#9ca3af;font-size:13px">Belum ada program terdaftar</div>'; return; }
  wrap.innerHTML = progs.map(function(p) {
    return '<div class="form-section">'
      + '<div class="form-group">'
      + '<label>Link Grup WhatsApp — ' + p.nama + '</label>'
      + '<input type="text" id="waGroupLink_' + p.id + '" placeholder="https://chat.whatsapp.com/xxxxxxxxxx" value="' + (p.wa_group_link || '') + '">'
      + '</div>'
      + '<button class="btn btn-primary btn-sm" onclick="simpanWaGroupLink(\'' + p.id + '\')">💾 Simpan</button>'
      + '<div id="waSaveMsg_' + p.id + '" style="margin-top:8px;font-size:13px"></div>'
      + '</div>';
  }).join('');
}

async function simpanWaGroupLink(programId) {
  var link = document.getElementById('waGroupLink_' + programId).value.trim();
  var msgEl = document.getElementById('waSaveMsg_' + programId);
  if (link && !link.startsWith('https://chat.whatsapp.com/')) {
    msgEl.style.color = '#dc2626';
    msgEl.textContent = '⚠️ Link harus diawali dengan https://chat.whatsapp.com/';
    return;
  }
  var { error } = await db.from('program').update({ wa_group_link: link || null }).eq('id', programId);
  if (error) { msgEl.style.color='#dc2626'; msgEl.textContent = '❌ Gagal menyimpan: '+error.message; return; }
  msgEl.style.color = '#16a34a';
  msgEl.textContent = '✅ Link berhasil disimpan!';
}
