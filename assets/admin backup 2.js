// ============================================
// BMM ADMIN DASHBOARD — admin.js v2
// ============================================

var allMurid = [], allGuru = [], allKelas = [], allSiswaRR = [];
var selectedMurid = new Set(), selectedGuru = new Set(), selectedKelas = new Set();
var editingMuridId = null, editingGuruId = null, editingKelasId = null;
var rrSiswaId = null, rrCurrentJilid = null;
var tahunAjaranId = null;

// ============================================
// INIT
// ============================================
(async function() {
  try {
    // Inject modal kelas detail
    if (!document.getElementById('modalKelasDetail')) {
      document.body.insertAdjacentHTML('beforeend',
        '<div class="modal-overlay hidden" id="modalKelasDetail">'
        + '<div class="modal-box" style="max-width:620px">'
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

    var p = (await db.from('profiles').select('nama_lengkap,role').eq('id', s.user.id).single()).data;
    if (!p || p.role !== 'admin') { await db.auth.signOut(); window.location.replace('../index.html'); return; }

    document.getElementById('headerName').textContent = p.nama_lengkap;
    document.getElementById('logoutBtn').addEventListener('click', async function() {
      await db.auth.signOut(); window.location.replace('../index.html');
    });
    document.querySelectorAll('.sidebar-item').forEach(function(i) {
      i.addEventListener('click', function() { switchTab(i.dataset.tab); });
    });

    var ta = (await db.from('tahun_ajaran').select('id').eq('is_aktif', true).single()).data;
    tahunAjaranId = ta ? ta.id : null;
    document.getElementById('da_tanggalJoin').value = new Date().toISOString().split('T')[0];

    await populateGuruDropdowns();
    await loadStats();
    await loadKelasHariIni();
  } catch(e) { console.error('Init error:', e); }
})();

// ============================================
// TAB
// ============================================
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
  document.querySelectorAll('.sidebar-item').forEach(function(i) { i.classList.remove('active'); });
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector('[data-tab="' + tab + '"]').classList.add('active');
  if (tab === 'register')   loadPendaftaran();
  if (tab === 'reregister') loadRR();
  if (tab === 'kelas')      loadKelas();
  if (tab === 'murid')      loadMurid();
  if (tab === 'guru')       loadGuru();
}

// ============================================
// STATS
// ============================================
async function loadStats() {
  try {
    var r = await Promise.all([
      db.from('siswa').select('*',{count:'exact',head:true}).eq('status',true),
      db.from('siswa').select('*',{count:'exact',head:true}).eq('status',false),
      db.from('pendaftaran').select('*',{count:'exact',head:true}).eq('status','pending'),
      db.from('kelas').select('*',{count:'exact',head:true}).eq('is_active',true)
    ]);
    document.getElementById('statAktif').textContent    = r[0].count !== null ? r[0].count : 0;
    document.getElementById('statBerhenti').textContent = r[1].count !== null ? r[1].count : 0;
    document.getElementById('statPending').textContent  = r[2].count !== null ? r[2].count : 0;
    document.getElementById('statKelas').textContent    = r[3].count !== null ? r[3].count : 0;
  } catch(e) { console.error('loadStats:', e); }
}

// ============================================
// KELAS HARI INI — dengan klik lihat murid
// ============================================
async function loadKelasHariIni() {
  try {
    var now = new Date();
    var hari = now.getDay();
    var jam  = now.getHours() * 60 + now.getMinutes();
    var namaHari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var tanggal  = now.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
    document.getElementById('hariIniLabel').textContent = namaHari[hari] + ', ' + tanggal;

    var hb = null;
    if (hari===1||hari===3||hari===5) hb='135';
    else if (hari===2||hari===4||hari===6) hb='246';

    var el = document.getElementById('kelasHariIni');
    if (!hb) {
      el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-2)"><div style="font-size:32px">🌙</div><div style="font-weight:600;margin-top:8px">Tidak ada kelas hari Minggu</div></div>';
      return;
    }

    var res = await db.from('kelas')
      .select('*, guru:guru_id(nama_lengkap,kode_guru), enrollment(id,is_active,siswa:siswa_id(status))')
      .eq('hari_belajar',hb).eq('is_active',true).order('sesi');
    var kelas = res.data || [];

    if (!kelas.length) {
      el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-2)">Tidak ada kelas terjadwal hari ini</div>';
      return;
    }

    function getStatus(sesi) {
      if (sesi==='sore')  return (jam>=960&&jam<=1065)?'ongoing':jam<960?'upcoming':'selesai';
      if (sesi==='malam') return (jam>=1080&&jam<=1185)?'ongoing':jam<1080?'upcoming':'selesai';
      return 'upcoming';
    }

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">';
    for (var i=0; i<kelas.length; i++) {
      var k = kelas[i];
      // Count only active enrollments with active students
      var muridAktif = 0;
      if (k.enrollment) {
        for (var j=0; j<k.enrollment.length; j++) {
          if (k.enrollment[j].is_active && k.enrollment[j].siswa && k.enrollment[j].siswa.status) muridAktif++;
        }
      }
      var st = getStatus(k.sesi);
      var border  = st==='ongoing'?'var(--gold)':st==='selesai'?'#E5E7EB':'var(--border)';
      var bg      = st==='ongoing'?'var(--gold-light)':st==='selesai'?'#FAFAFA':'var(--white)';
      var op      = st==='selesai'?'0.65':'1';
      var jamLbl  = k.sesi==='sore'?'16:00–17:45':'18:00–19:45';
      var kodeG   = k.guru?k.guru.kode_guru:'?';
      var namaG   = k.guru?k.guru.nama_lengkap:'—';
      var badge   = '';
      if (st==='ongoing')                          badge='<span style="background:var(--pink);color:white;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700">🔴 Berlangsung</span>';
      else if (st==='upcoming'&&k.sesi==='sore')   badge='<span class="badge badge-yellow" style="font-size:10px">🕓 Nanti Sore</span>';
      else if (st==='upcoming'&&k.sesi==='malam')  badge='<span class="badge badge-blue" style="font-size:10px">🌙 Nanti Malam</span>';
      else                                          badge='<span class="badge badge-gray" style="font-size:10px">✓ Selesai</span>';
      var sesiB   = k.sesi==='sore'?'<span class="badge badge-yellow" style="font-size:10px">Sore</span>':'<span class="badge badge-blue" style="font-size:10px">Malam</span>';

      html += '<div style="border:1.5px solid '+border+';border-radius:12px;padding:16px;background:'+bg+';opacity:'+op+';cursor:pointer;transition:all 0.2s" '
        + 'onclick="viewKelasStudents(\''+k.id+'\',\''+k.kode_kelas+'\')" '
        + 'onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 6px 20px rgba(194,24,91,0.15)\'" '
        + 'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">'
        + '<div style="font-family:monospace;font-size:16px;font-weight:700;color:var(--pink)">'+k.kode_kelas+'</div>'
        + badge+'</div>'
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">'
        + '<div style="width:28px;height:28px;border-radius:50%;background:var(--pink-light);color:var(--pink);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">'+kodeG+'</div>'
        + '<div><div style="font-size:12px;font-weight:600;color:var(--text)">'+namaG+'</div>'
        + '<div style="font-size:11px;color:var(--text-2)">Jilid '+k.jilid+'</div></div></div>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);padding-top:10px">'
        + '<div>'+sesiB+'<span style="margin-left:6px;font-size:12px;color:var(--text-2)">⏰ '+jamLbl+'</span></div>'
        + '<div><span style="font-size:18px;font-weight:700;color:var(--text)">'+muridAktif+'</span>'
        + '<span style="font-size:11px;color:var(--text-2);">/'+k.kapasitas+' murid</span></div>'
        + '</div>'
        + '<div style="text-align:center;margin-top:10px;font-size:11px;color:var(--text-2)">👥 Klik untuk lihat daftar murid</div>'
        + '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  } catch(e) { console.error('loadKelasHariIni:', e); }
}

async function viewKelasStudents(kelasId, kelasKode) {
  document.getElementById('kelasDetailTitle').textContent = '👥 Murid Kelas ' + kelasKode;
  document.getElementById('kelasDetailContent').innerHTML = '<div style="text-align:center;padding:20px">⏳ Memuat...</div>';
  document.getElementById('modalKelasDetail').classList.remove('hidden');
  try {
    var res = await db.from('enrollment')
      .select('*, siswa:siswa_id(nomor_induk,nama_lengkap,nama_mandarin,telepon,status)')
      .eq('kelas_id',kelasId).eq('is_active',true);
    var list = res.data || [];
    if (!list.length) {
      document.getElementById('kelasDetailContent').innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-2)">Belum ada murid di kelas ini</div>';
      return;
    }
    var html = '<div style="font-size:13px;color:var(--text-2);margin-bottom:12px">'+list.length+' murid terdaftar</div>'
      + '<table class="table"><thead><tr><th>No. Induk</th><th>Nama Indonesia</th><th>Nama Mandarin</th><th>HP</th><th>Status</th></tr></thead><tbody>';
    for (var i=0; i<list.length; i++) {
      var s = list[i].siswa;
      if (!s) continue;
      html += '<tr>'
        +'<td style="font-family:monospace">'+(s.nomor_induk||'—')+'</td>'
        +'<td><strong>'+s.nama_lengkap+'</strong></td>'
        +'<td style="color:#6b7280">'+(s.nama_mandarin||'—')+'</td>'
        +'<td>'+(s.telepon||'—')+'</td>'
        +'<td>'+(s.status?'<span class="badge badge-green">Aktif</span>':'<span class="badge badge-red">Nonaktif</span>')+'</td>'
        +'</tr>';
    }
    html += '</tbody></table>';
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
    if (status) q = q.eq('status',status);
    var data = (await q).data || [];
    var tbody = document.getElementById('tablePendaftaran');
    if (!data.length) { tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280">Tidak ada data pendaftaran</td></tr>'; return; }
    var html = '';
    for (var i=0; i<data.length; i++) {
      var d = data[i];
      var sb = d.status==='pending'?'<span class="badge badge-yellow">Pending</span>':d.status==='approved'?'<span class="badge badge-green">Disetujui</span>':'<span class="badge badge-red">Ditolak</span>';
      var ab = d.status==='pending'?'<button class="btn btn-success btn-sm" onclick="proseskan(\''+d.id+'\',\'approved\')">✓</button> <button class="btn btn-danger btn-sm" onclick="proseskan(\''+d.id+'\',\'rejected\')">✗</button>':'';
      html += '<tr>'
        +'<td><strong>'+(d.nama_lengkap||'')+'</strong></td>'
        +'<td style="color:#6b7280">'+(d.nama_mandarin||'—')+'</td>'
        +'<td>'+(d.created_at?new Date(d.created_at).toLocaleDateString('id-ID'):'—')+'</td>'
        +'<td>'+(d.batch||'—')+'</td>'
        +'<td style="font-family:monospace">'+(d.kelas?d.kelas.kode_kelas:'—')+'</td>'
        +'<td>'+sb+'</td>'
        +'<td><button class="btn-icon" onclick="showDetailDaftar(\''+d.id+'\')">👁</button> '+ab+'</td></tr>';
    }
    tbody.innerHTML = html;
  } catch(e) { console.error('loadPendaftaran:',e); }
}

async function showDetailDaftar(id) {
  try {
    var d = (await db.from('pendaftaran').select('*, kelas:kelas_dipilih(kode_kelas,jilid)').eq('id',id).single()).data;
    if (!d) return;
    document.getElementById('detailDaftarContent').innerHTML =
      '<div class="modal-row"><span class="modal-label">Nama Indonesia</span><span class="modal-value"><strong>'+(d.nama_lengkap||'')+'</strong></span></div>'
      +'<div class="modal-row"><span class="modal-label">Nama Mandarin</span><span class="modal-value">'+(d.nama_mandarin||'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">HP Murid</span><span class="modal-value">'+(d.telepon||'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">HP Orang Tua</span><span class="modal-value">'+(d.telepon_ortu||'')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Tempat Lahir</span><span class="modal-value">'+(d.tempat_lahir||'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Tgl Lahir</span><span class="modal-value">'+(d.tanggal_lahir?new Date(d.tanggal_lahir).toLocaleDateString('id-ID'):'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Alamat</span><span class="modal-value">'+(d.alamat||'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Kelas Dipilih</span><span class="modal-value" style="font-family:monospace">'+(d.kelas?d.kelas.kode_kelas:'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Batch</span><span class="modal-value">'+(d.batch||'—')+'</span></div>'
      +'<div class="modal-row"><span class="modal-label">Status</span><span class="modal-value">'+d.status+'</span></div>';
    document.getElementById('detailDaftarAksi').innerHTML = d.status==='pending'
      ? '<button class="btn btn-success" onclick="proseskan(\''+d.id+'\',\'approved\');closeModal(\'modalDetailDaftar\')">✓ Setujui</button>'
        +'<button class="btn btn-danger" onclick="proseskan(\''+d.id+'\',\'rejected\');closeModal(\'modalDetailDaftar\')">✗ Tolak</button>'
      : '';
    document.getElementById('modalDetailDaftar').classList.remove('hidden');
  } catch(e) { console.error('showDetailDaftar:',e); }
}

async function proseskan(id, status) {
  if (!confirm('Yakin ingin '+(status==='approved'?'menyetujui':'menolak')+' pendaftaran ini?')) return;
  try {
    var regData = (await db.from('pendaftaran').select('*').eq('id',id).single()).data;
    var userId  = (await db.auth.getUser()).data.user.id;
    await db.from('pendaftaran').update({status,diproses_oleh:userId,waktu_proses:new Date().toISOString()}).eq('id',id);
    if (status==='approved' && regData) {
      // Check duplicate sebelum insert
      var dupCheck = (await db.from('siswa').select('id,status').ilike('nama_lengkap', regData.nama_lengkap)).data || [];
      var aktif = dupCheck.filter(function(x){return x.status;});
      if (aktif.length > 0) {
        var lanjut = confirm('⚠️ Murid bernama "'+regData.nama_lengkap+'" sudah terdaftar aktif!\n\nApakah ini murid berbeda? Klik OK untuk tetap mendaftarkan, atau Batal untuk membatalkan.');
        if (!lanjut) return;
      }
      var cnt = (await db.from('siswa').select('*',{count:'exact',head:true})).count || 0;
      var noInduk = 'S'+String(cnt+1).padStart(4,'0');
      var siswaRes = await db.from('siswa').insert({
        nomor_induk:noInduk, nama_lengkap:regData.nama_lengkap,
        nama_mandarin:regData.nama_mandarin||null,
        tempat_lahir:regData.tempat_lahir, tanggal_lahir:regData.tanggal_lahir,
        alamat:regData.alamat, telepon:regData.telepon,
        telepon_ortu:regData.telepon_ortu,
        tanggal_join:new Date().toISOString().split('T')[0],
        batch:regData.batch, status:true
      }).select().single();
      if (siswaRes.data && regData.kelas_dipilih) {
        await db.from('enrollment').insert({siswa_id:siswaRes.data.id,kelas_id:regData.kelas_dipilih,tahun_ajaran_id:tahunAjaranId,is_active:true});
      }
      alert('✅ Murid berhasil didaftarkan! No. Induk: '+noInduk);
    }
    await loadPendaftaran(); await loadStats();
  } catch(e) { console.error('proseskan:',e); alert('Error: '+e.message); }
}

function openModalDaftarAdmin() {
  populateKelasSelect('da_kelas');
  document.getElementById('da_tanggalJoin').value = new Date().toISOString().split('T')[0];
  document.getElementById('modalDaftarAdmin').classList.remove('hidden');
}

async function simpanDaftarAdmin() {
  var namaIndo = document.getElementById('da_namaIndo').value.trim();
  var hpOrtu   = document.getElementById('da_hpOrtu').value.trim();
  var kelasId  = document.getElementById('da_kelas').value;
  if (!namaIndo||!hpOrtu||!kelasId) { alert('Lengkapi field wajib!'); return; }
  try {
    // Cek duplikat
    var dup = (await db.from('siswa').select('id,status').ilike('nama_lengkap',namaIndo)).data || [];
    var aktif = dup.filter(function(x){return x.status;});
    var nonAktif = dup.filter(function(x){return !x.status;});
    if (aktif.length > 0) {
      alert('⚠️ Murid "'+namaIndo+'" sudah terdaftar AKTIF!\nCek tab Data Murid.');
      return;
    }
    if (nonAktif.length > 0) {
      if (!confirm('⚠️ Ditemukan murid "'+namaIndo+'" yang sudah TIDAK AKTIF.\n\nApakah ini murid berbeda?\n• OK → Daftar sebagai murid baru\n• Batal → Aktifkan murid lama via toggle di Data Murid')) return;
    }
    var cnt = (await db.from('siswa').select('*',{count:'exact',head:true})).count || 0;
    var noInduk = 'S'+String(cnt+1).padStart(4,'0');
    var siswaRes = await db.from('siswa').insert({
      nomor_induk:noInduk, nama_lengkap:namaIndo,
      nama_mandarin:document.getElementById('da_namaMandarin').value.trim()||null,
      telepon:document.getElementById('da_hpMurid').value.trim()||null,
      telepon_ortu:hpOrtu,
      tempat_lahir:document.getElementById('da_tempatLahir').value.trim()||null,
      tanggal_lahir:document.getElementById('da_tanggalLahir').value||null,
      alamat:document.getElementById('da_alamat').value.trim()||null,
      tanggal_join:document.getElementById('da_tanggalJoin').value||new Date().toISOString().split('T')[0],
      batch:parseInt(document.getElementById('da_batch').value)||null, status:true
    }).select().single();
    if (siswaRes.data) {
      await db.from('enrollment').insert({siswa_id:siswaRes.data.id,kelas_id:kelasId,tahun_ajaran_id:tahunAjaranId,is_active:true});
    }
    closeModal('modalDaftarAdmin');
    alert('✅ Murid didaftarkan! No. Induk: '+noInduk);
    await loadStats();
  } catch(e) { console.error('simpanDaftarAdmin:',e); alert('Error: '+e.message); }
}

// ============================================
// RE-REGISTER — hanya murid AKTIF, fix enrollment
// ============================================
async function loadRR() {
  try {
    // FIX: hanya ambil murid aktif + filter enrollment is_active
    var res = await db.from('siswa')
      .select('*, enrollment(is_active,kelas:kelas_id(id,kode_kelas,jilid,guru:guru_id(nama_lengkap)))')
      .eq('status',true)
      .order('nomor_induk');
    allSiswaRR = res.data || [];
    renderRR(allSiswaRR);
  } catch(e) { console.error('loadRR:',e); }
}

function renderRR(list) {
  var tbody = document.getElementById('tableRR');
  if (!list.length) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:40px;color:#6b7280">Belum ada murid aktif</td></tr>'; return; }
  var html = '';
  for (var i=0; i<list.length; i++) {
    var s = list[i];
    // FIX: cari enrollment yang is_active = true
    var activeEnroll = null;
    if (s.enrollment) {
      for (var ei=0; ei<s.enrollment.length; ei++) {
        if (s.enrollment[ei].is_active) { activeEnroll = s.enrollment[ei]; break; }
      }
    }
    var kelas = activeEnroll ? activeEnroll.kelas : null;
    var jilid = kelas ? kelas.jilid : (s.tingkat_jilid||1);
    var namaM = s.nama_mandarin ? ' <span style="color:#9ca3af;font-size:12px">'+s.nama_mandarin+'</span>' : '';
    html += '<tr>'
      +'<td>'+s.nomor_induk+'</td>'
      +'<td><strong>'+s.nama_lengkap+'</strong>'+namaM+'</td>'
      +'<td style="font-family:monospace">'+(kelas?kelas.kode_kelas:'—')+'</td>'
      +'<td>Jilid '+jilid+'</td>'
      +'<td><span class="badge badge-green">Aktif</span></td>'
      +'<td style="display:flex;gap:6px;align-items:center">'
      +'<button class="btn-sheng" onclick="openPenempatan(\''+s.id+'\',\''+s.nama_lengkap.replace(/'/g,"'")+'\','+jilid+',\'sheng\')" title="升 Naik Jilid">升</button>'
      +'<button class="btn-liu"   onclick="openPenempatan(\''+s.id+'\',\''+s.nama_lengkap.replace(/'/g,"'")+'\','+jilid+',\'liu\')"   title="留 Tetap Jilid">留</button>'
      +'</td></tr>';
  }
  tbody.innerHTML = html;
}

function filterRR() {
  var q  = document.getElementById('searchRR').value.toLowerCase();
  var st = document.getElementById('filterStatusRR').value;
  renderRR(allSiswaRR.filter(function(s) {
    var mq = s.nama_lengkap.toLowerCase().indexOf(q)>=0||(s.nama_mandarin||'').toLowerCase().indexOf(q)>=0;
    var ms = st===''||String(s.status)===st;
    return mq&&ms;
  }));
}

async function toggleStatusRR(id, active) {
  await db.from('siswa').update({status:active}).eq('id',id);
  await loadStats(); await loadRR();
}

async function openPenempatan(siswaId, nama, currentJilid, tipe) {
  rrSiswaId = siswaId;
  var targets = [];
  if (tipe==='sheng') {
    targets=[currentJilid+1,currentJilid+2].filter(function(j){return j>=1&&j<=12;});
    document.getElementById('penempatanTitle').textContent='升 Naik — Pilih Kelas Baru';
    document.getElementById('penempatanSub').textContent=nama+' (Jilid '+currentJilid+') → naik ke jilid '+targets.join(' atau ');
  } else {
    targets=[currentJilid];
    document.getElementById('penempatanTitle').textContent='留 Tetap — Pilih Kelas';
    document.getElementById('penempatanSub').textContent=nama+' (Jilid '+currentJilid+') → tetap jilid '+currentJilid;
  }
  if (!targets.length) { alert('Tidak ada jilid tersedia!'); return; }
  var kelas = (await db.from('kelas')
    .select('*, guru:guru_id(nama_lengkap), enrollment(id,is_active)')
    .in('jilid',targets).eq('is_active',true)).data || [];
  var html = '';
  if (kelas.length) {
    for (var i=0; i<kelas.length; i++) {
      var k=kelas[i];
      var hariL=k.hari_belajar==='135'?'Sen·Rab·Jum':'Sel·Kam·Sab';
      // FIX: count active enrollments only
      var cnt = k.enrollment ? k.enrollment.filter(function(e){return e.is_active;}).length : 0;
      html += '<div class="kelas-option" onclick="assignKelas(\''+siswaId+'\',\''+k.id+'\',this)">'
        +'<div><div style="font-family:monospace;font-weight:700;color:var(--pink)">'+k.kode_kelas+'</div>'
        +'<div style="font-size:12px;color:var(--text-2)">'+(k.guru?k.guru.nama_lengkap:'—')+' · Jilid '+k.jilid+' · '+hariL+'</div></div>'
        +'<div style="text-align:right"><div style="font-size:13px;font-weight:600">'+cnt+'/'+k.kapasitas+'</div><div style="font-size:11px;color:var(--text-2)">murid</div></div>'
        +'</div>';
    }
  } else {
    html='<div style="text-align:center;padding:30px;color:var(--text-2)">Tidak ada kelas tersedia</div>';
  }
  document.getElementById('penempatanList').innerHTML=html;
  document.getElementById('modalPenempatan').classList.remove('hidden');
}

async function assignKelas(siswaId, kelasId, el) {
  if (!confirm('Pindahkan murid ke kelas ini?')) return;
  try {
    // Nonaktifkan enrollment lama
    await db.from('enrollment').update({is_active:false}).eq('siswa_id',siswaId).eq('is_active',true);
    // Buat enrollment baru
    await db.from('enrollment').insert({siswa_id:siswaId,kelas_id:kelasId,tahun_ajaran_id:tahunAjaranId,is_active:true});
    closeModal('modalPenempatan');
    alert('✅ Penempatan kelas berhasil!');
    // FIX: reload semua data yang terpengaruh
    await loadRR();
    await loadKelas();
    await loadStats();
  } catch(e) { console.error('assignKelas:',e); alert('Error: '+e.message); }
}

// ============================================
// DATA KELAS — count active enrollment only
// ============================================
async function loadKelas() {
  try {
    var gf = document.getElementById('filterGuruKelas').value;
    var jf = document.getElementById('filterJilidKelas').value;
    var q = db.from('kelas').select('*, guru:guru_id(id,nama_lengkap,kode_guru), enrollment(id,is_active)').order('kode_kelas');
    if (gf) q=q.eq('guru_id',gf);
    if (jf) q=q.eq('jilid',jf);
    allKelas = (await q).data || [];
    renderKelas(allKelas);
  } catch(e) { console.error('loadKelas:',e); }
}

function renderKelas(list) {
  var tbody=document.getElementById('tableKelas');
  if (!list.length) { tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:40px;color:#6b7280">Belum ada kelas</td></tr>'; return; }
  var html='';
  for (var i=0; i<list.length; i++) {
    var k=list[i];
    var hari=k.hari_belajar==='135'?'Sen·Rab·Jum':'Sel·Kam·Sab';
    var jam=k.sesi==='sore'?'16:00–17:45':'18:00–19:45';
    // FIX: count only active enrollments
    var cnt = k.enrollment ? k.enrollment.filter(function(e){return e.is_active;}).length : 0;
    var badge=k.is_active?'<span class="badge badge-green">Aktif</span>':'<span class="badge badge-gray">Nonaktif</span>';
    html += '<tr>'
      +'<td><input type="checkbox" class="row-checkbox chk-kelas" value="'+k.id+'" onchange="updateBulkKelas()"></td>'
      +'<td><strong style="font-family:monospace">'+k.kode_kelas+'</strong></td>'
      +'<td>'+(k.guru?k.guru.nama_lengkap:'—')+'</td>'
      +'<td>Jilid '+k.jilid+'</td>'
      +'<td>'+hari+'<br><small style="color:#6b7280">'+jam+'</small></td>'
      +'<td><strong>'+cnt+'</strong>/'+k.kapasitas+'</td>'
      +'<td>'+badge+'</td>'
      +'<td style="display:flex;gap:4px">'
      +'<button class="btn btn-secondary btn-sm" onclick="openEditKelas(\''+k.id+'\')">✏️</button>'
      +'<button class="btn btn-danger btn-sm" onclick="deleteKelas(\''+k.id+'\',\''+k.kode_kelas+'\')">🗑️</button>'
      +'</td></tr>';
  }
  tbody.innerHTML=html;
}

function openModalTambahKelas() {
  editingKelasId=null;
  document.getElementById('modalKelasTitle').textContent='Tambah Kelas Baru';
  ['mk_guru','mk_jilid','mk_hari','mk_sesi'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('mk_kapasitas').value=15;
  document.getElementById('mk_kodePreview').textContent='Kode akan muncul otomatis';
  document.getElementById('modalKelas').classList.remove('hidden');
}

function openEditKelas(id) {
  editingKelasId=id;
  var k=null; for(var i=0;i<allKelas.length;i++){if(allKelas[i].id===id){k=allKelas[i];break;}}
  if(!k) return;
  document.getElementById('modalKelasTitle').textContent='Edit Kelas';
  document.getElementById('mk_guru').value=k.guru_id||'';
  document.getElementById('mk_jilid').value=k.jilid;
  document.getElementById('mk_hari').value=k.hari_belajar;
  document.getElementById('mk_sesi').value=k.sesi;
  document.getElementById('mk_kapasitas').value=k.kapasitas;
  updateKodePreview();
  document.getElementById('modalKelas').classList.remove('hidden');
}

function updateKodePreview() {
  var gs=document.getElementById('mk_guru');
  var opt=gs.options[gs.selectedIndex];
  var kg=opt?opt.dataset.kode||'':'';
  var jilid=document.getElementById('mk_jilid').value;
  var hari=document.getElementById('mk_hari').value;
  var sesi=document.getElementById('mk_sesi').value;
  var jam=sesi==='sore'?'16.00':sesi==='malam'?'18.00':'';
  document.getElementById('mk_kodePreview').textContent=(kg&&jilid&&hari&&sesi)?kg+'-'+jilid+'-'+hari+'-'+jam:'Lengkapi semua field';
}

async function simpanKelas() {
  var gs=document.getElementById('mk_guru');
  var guruId=gs.value;
  var opt=gs.options[gs.selectedIndex];
  var kg=opt?opt.dataset.kode||'':'';
  var jilid=parseInt(document.getElementById('mk_jilid').value);
  var hari=document.getElementById('mk_hari').value;
  var sesi=document.getElementById('mk_sesi').value;
  var kap=parseInt(document.getElementById('mk_kapasitas').value);
  if(!guruId||!jilid||!hari||!sesi){alert('Lengkapi semua field!');return;}
  var jam=sesi==='sore'?'16.00':'18.00';
  var kodeKelas=kg+'-'+jilid+'-'+hari+'-'+jam;
  var jamMulai=sesi==='sore'?'16:00:00':'18:00:00';
  var jamSelesai=sesi==='sore'?'17:45:00':'19:45:00';
  try {
    if (editingKelasId) {
      await db.from('kelas').update({guru_id:guruId,jilid,hari_belajar:hari,sesi,jam_mulai:jamMulai,jam_selesai:jamSelesai,kapasitas:kap}).eq('id',editingKelasId);
      alert('✅ Kelas diupdate!');
    } else {
      var er=(await db.from('kelas').insert({kode_kelas:kodeKelas,guru_id:guruId,jilid,hari_belajar:hari,sesi,jam_mulai:jamMulai,jam_selesai:jamSelesai,kapasitas:kap,tahun_ajaran_id:tahunAjaranId})).error;
      if(er){alert('Error: '+er.message);return;}
      alert('✅ Kelas '+kodeKelas+' ditambahkan!');
    }
    closeModal('modalKelas'); await loadKelas(); await loadStats();
  } catch(e){console.error('simpanKelas:',e);alert('Error: '+e.message);}
}

async function deleteKelas(id,kode) {
  if(!confirm('Hapus kelas '+kode+'?')) return;
  await db.from('enrollment').delete().eq('kelas_id',id);
  await db.from('kelas').delete().eq('id',id);
  await loadKelas(); await loadStats();
}

function updateBulkKelas() {
  document.querySelectorAll('.chk-kelas:checked').forEach(function(c){selectedKelas.add(c.value);});
  document.querySelectorAll('.chk-kelas:not(:checked)').forEach(function(c){selectedKelas.delete(c.value);});
  var bar=document.getElementById('bulkBarKelas');
  if(selectedKelas.size>0){bar.classList.add('show');document.getElementById('bulkCountKelas').textContent=selectedKelas.size+' kelas dipilih';}
  else bar.classList.remove('show');
}
function toggleAllKelas(cb){document.querySelectorAll('.chk-kelas').forEach(function(c){c.checked=cb.checked;cb.checked?selectedKelas.add(c.value):selectedKelas.delete(c.value);});updateBulkKelas();}
async function bulkDeleteKelas(){
  if(!confirm('Hapus '+selectedKelas.size+' kelas?')) return;
  for(var id of selectedKelas){await db.from('enrollment').delete().eq('kelas_id',id);await db.from('kelas').delete().eq('id',id);}
  clearSelectKelas();await loadKelas();await loadStats();
}
function clearSelectKelas(){selectedKelas.clear();document.querySelectorAll('.chk-kelas').forEach(function(c){c.checked=false;});document.getElementById('checkAllKelas').checked=false;document.getElementById('bulkBarKelas').classList.remove('show');}

// ============================================
// DATA MURID — toggle status + fix enrollment
// ============================================
async function loadMurid() {
  try {
    var res = await db.from('siswa')
      .select('*, enrollment(is_active,kelas:kelas_id(kode_kelas,jilid))')
      .order('nomor_induk');
    allMurid = res.data || [];
    renderMurid(allMurid);
  } catch(e) { console.error('loadMurid:',e); }
}

function renderMurid(list) {
  var tbody=document.getElementById('tableMurid');
  if(!list.length){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280">Belum ada murid</td></tr>';return;}
  var html='';
  for(var i=0;i<list.length;i++){
    var s=list[i];
    // FIX: find active enrollment only
    var ae=null;
    if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
    var kelas=ae?ae.kelas:null;
    var checked=s.status?'checked':'';
    html += '<tr>'
      +'<td><input type="checkbox" class="row-checkbox chk-murid" value="'+s.id+'" onchange="updateBulkMurid()"></td>'
      +'<td>'+s.nomor_induk+'</td>'
      +'<td><span class="table-link" onclick="showDetailMurid(\''+s.id+'\')">'+s.nama_lengkap+'</span></td>'
      +'<td style="color:#6b7280">'+(s.nama_mandarin||'—')+'</td>'
      +'<td style="font-family:monospace">'+(kelas?kelas.kode_kelas:'—')+'</td>'
      +'<td>'
      +'<label class="toggle" title="'+(s.status?'Aktif':'Nonaktif')+'">'
      +'<input type="checkbox" '+checked+' onchange="updateStatusMurid(\''+s.id+'\',this.checked)">'
      +'<span class="toggle-slider"></span>'
      +'</label>'
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
    await loadMurid(); await loadStats();
  } catch(e) { alert('Error: '+e.message); }
}

function filterMurid() {
  var q=document.getElementById('searchMurid').value.toLowerCase();
  var st=document.getElementById('filterStatusMurid').value;
  var jl=document.getElementById('filterJilidMurid').value;
  renderMurid(allMurid.filter(function(s){
    var mq=s.nama_lengkap.toLowerCase().indexOf(q)>=0||s.nomor_induk.toLowerCase().indexOf(q)>=0||(s.nama_mandarin||'').toLowerCase().indexOf(q)>=0;
    var ms=st===''||String(s.status)===st;
    var ae=null;
    if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
    var mj=jl===''||String(ae&&ae.kelas?ae.kelas.jilid:'')===jl;
    return mq&&ms&&mj;
  }));
}

function showDetailMurid(id) {
  var s=null; for(var i=0;i<allMurid.length;i++){if(allMurid[i].id===id){s=allMurid[i];break;}}
  if(!s) return;
  var ae=null;
  if(s.enrollment){for(var ei=0;ei<s.enrollment.length;ei++){if(s.enrollment[ei].is_active){ae=s.enrollment[ei];break;}}}
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
    +'<div class="modal-row"><span class="modal-label">Batch</span><span class="modal-value">'+(s.batch||'—')+'</span></div>'
    +'<div style="margin-top:16px">'
    +'<button class="btn btn-secondary btn-sm" onclick="openEditMurid(\''+s.id+'\');closeModal(\'modalDetailMurid\')">✏️ Edit Data</button>'
    +'</div>';
  document.getElementById('modalDetailMurid').classList.remove('hidden');
}

function openModalTambahMurid() {
  editingMuridId=null;
  document.getElementById('modalMuridTitle').textContent='Tambah Murid';
  document.getElementById('mm_id').value='';
  ['mm_namaIndo','mm_namaMandarin','mm_hpMurid','mm_hpOrtu','mm_tempatLahir','mm_alamat'].forEach(function(id){document.getElementById(id).value='';});
  ['mm_tanggalLahir','mm_tanggalJoin'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('mm_batch').value='';
  document.getElementById('mm_jilid').value='';
  document.getElementById('mm_status').value='true';
  document.getElementById('mm_tanggalJoin').value=new Date().toISOString().split('T')[0];
  document.getElementById('modalMurid').classList.remove('hidden');
}

function openEditMurid(id) {
  editingMuridId=id;
  var s=null; for(var i=0;i<allMurid.length;i++){if(allMurid[i].id===id){s=allMurid[i];break;}}
  if(!s) return;
  document.getElementById('modalMuridTitle').textContent='Edit Data Murid';
  document.getElementById('mm_id').value=s.id;
  document.getElementById('mm_namaIndo').value=s.nama_lengkap||'';
  document.getElementById('mm_namaMandarin').value=s.nama_mandarin||'';
  document.getElementById('mm_hpMurid').value=s.telepon||'';
  document.getElementById('mm_hpOrtu').value=s.telepon_ortu||'';
  document.getElementById('mm_tempatLahir').value=s.tempat_lahir||'';
  document.getElementById('mm_tanggalLahir').value=s.tanggal_lahir||'';
  document.getElementById('mm_alamat').value=s.alamat||'';
  document.getElementById('mm_tanggalJoin').value=s.tanggal_join||'';
  document.getElementById('mm_batch').value=s.batch||'';
  document.getElementById('mm_jilid').value=s.tingkat_jilid||'';
  document.getElementById('mm_status').value=String(s.status);
  document.getElementById('modalMurid').classList.remove('hidden');
}

async function simpanMurid() {
  var namaIndo=document.getElementById('mm_namaIndo').value.trim();
  var hpOrtu=document.getElementById('mm_hpOrtu').value.trim();
  if(!namaIndo||!hpOrtu){alert('Nama dan HP Orang Tua wajib!');return;}
  try {
    // Cek duplikat hanya untuk murid baru
    if (!editingMuridId) {
      var dup=(await db.from('siswa').select('id,status').ilike('nama_lengkap',namaIndo)).data||[];
      var aktif=dup.filter(function(x){return x.status;});
      var nonAktif=dup.filter(function(x){return !x.status;});
      if(aktif.length>0){alert('⚠️ Murid "'+namaIndo+'" sudah terdaftar AKTIF!\nCek tab Data Murid.');return;}
      if(nonAktif.length>0){
        if(!confirm('⚠️ Ditemukan murid "'+namaIndo+'" yang TIDAK AKTIF.\n\nApakah ini murid berbeda?\n• OK → Daftar sebagai murid baru\n• Batal → Aktifkan murid lama via toggle di Data Murid')) return;
      }
    }
    var data={
      nama_lengkap:namaIndo,
      nama_mandarin:document.getElementById('mm_namaMandarin').value.trim()||null,
      telepon:document.getElementById('mm_hpMurid').value.trim()||null,
      telepon_ortu:hpOrtu,
      tempat_lahir:document.getElementById('mm_tempatLahir').value.trim()||null,
      tanggal_lahir:document.getElementById('mm_tanggalLahir').value||null,
      alamat:document.getElementById('mm_alamat').value.trim()||null,
      tanggal_join:document.getElementById('mm_tanggalJoin').value||null,
      batch:parseInt(document.getElementById('mm_batch').value)||null,
      tingkat_jilid:parseInt(document.getElementById('mm_jilid').value)||null,
      status:document.getElementById('mm_status').value==='true'
    };
    if(editingMuridId){
      var er=(await db.from('siswa').update(data).eq('id',editingMuridId)).error;
      if(er){alert('Error: '+er.message);return;}
      alert('✅ Data murid diupdate!');
    } else {
      var cnt=(await db.from('siswa').select('*',{count:'exact',head:true})).count||0;
      data.nomor_induk='S'+String(cnt+1).padStart(4,'0');
      var er2=(await db.from('siswa').insert(data)).error;
      if(er2){alert('Error: '+er2.message);return;}
      alert('✅ Murid ditambahkan! No. Induk: '+data.nomor_induk);
    }
    closeModal('modalMurid'); await loadMurid(); await loadStats();
  } catch(e){console.error('simpanMurid:',e);alert('Error: '+e.message);}
}

async function deleteMurid(id,nama) {
  if(!confirm('Hapus murid "'+nama+'"?')) return;
  await db.from('enrollment').delete().eq('siswa_id',id);
  await db.from('siswa').delete().eq('id',id);
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
  if(!confirm('Hapus '+selectedMurid.size+' murid?')) return;
  for(var id of selectedMurid){await db.from('enrollment').delete().eq('siswa_id',id);await db.from('siswa').delete().eq('id',id);}
  clearSelectMurid(); await loadMurid(); await loadStats();
}
function clearSelectMurid(){selectedMurid.clear();document.querySelectorAll('.chk-murid').forEach(function(c){c.checked=false;});document.getElementById('checkAllMurid').checked=false;document.getElementById('bulkBarMurid').classList.remove('show');}

// ============================================
// DATA GURU
// ============================================
async function loadGuru() {
  try {
    allGuru=(await db.from('guru').select('*, pengaturan_gaji(gaji_per_kelas,persentase_bagi_hasil)').order('nomor_induk')).data||[];
    renderGuru(allGuru);
  } catch(e){console.error('loadGuru:',e);}
}

function renderGuru(list) {
  var tbody=document.getElementById('tableGuru');
  if(!list.length){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280">Belum ada data guru</td></tr>';return;}
  var html='';
  for(var i=0;i<list.length;i++){
    var g=list[i];
    var badge=g.is_active?'<span class="badge badge-green">Aktif</span>':'<span class="badge badge-gray">Nonaktif</span>';
    html += '<tr>'
      +'<td><input type="checkbox" class="row-checkbox chk-guru" value="'+g.id+'" onchange="updateBulkGuru()"></td>'
      +'<td>'+(g.nomor_induk||'—')+'</td>'
      +'<td><span style="font-family:monospace;font-weight:700;color:var(--pink)">'+g.kode_guru+'</span></td>'
      +'<td><span class="table-link" onclick="showDetailGuru(\''+g.id+'\')">'+g.nama_lengkap+'</span></td>'
      +'<td>'+(g.spesialisasi||'—')+'</td>'
      +'<td>'+badge+'</td>'
      +'<td style="display:flex;gap:4px">'
      +'<button class="btn-icon" onclick="showDetailGuru(\''+g.id+'\')">👁</button>'
      +'<button class="btn btn-secondary btn-sm" onclick="openEditGuru(\''+g.id+'\')">✏️</button>'
      +'<button class="btn btn-danger btn-sm" onclick="deleteGuru(\''+g.id+'\',\''+g.nama_lengkap.replace(/'/g,"'")+'\')">🗑️</button>'
      +'</td></tr>';
  }
  tbody.innerHTML=html;
}

function showDetailGuru(id) {
  var g=null; for(var i=0;i<allGuru.length;i++){if(allGuru[i].id===id){g=allGuru[i];break;}}
  if(!g) return;
  document.getElementById('detailGuruContent').innerHTML =
    '<div style="text-align:center;margin-bottom:16px">'
    +'<div class="avatar avatar-lg" style="margin:0 auto">'+g.nama_lengkap[0].toUpperCase()+'</div>'
    +'<div style="font-size:18px;font-weight:700;margin-top:8px">'+g.nama_lengkap+'</div>'
    +'<span class="badge badge-red" style="font-family:monospace">'+g.kode_guru+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">No. Induk</span><span class="modal-value">'+(g.nomor_induk||'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">HP</span><span class="modal-value">'+(g.telepon||'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">Spesialisasi</span><span class="modal-value">'+(g.spesialisasi||'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">Tanggal Join</span><span class="modal-value">'+(g.tanggal_join?new Date(g.tanggal_join).toLocaleDateString('id-ID'):'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">Batch</span><span class="modal-value">'+(g.batch||'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">Gaji/Kelas</span><span class="modal-value">'+(g.pengaturan_gaji?'Rp '+Number(g.pengaturan_gaji.gaji_per_kelas).toLocaleString('id-ID'):'—')+'</span></div>'
    +'<div class="modal-row"><span class="modal-label">Bagi Hasil</span><span class="modal-value">'+(g.pengaturan_gaji?g.pengaturan_gaji.persentase_bagi_hasil+'%':'—')+'</span></div>'
    +'<div style="margin-top:16px"><button class="btn btn-secondary btn-sm" onclick="openEditGuru(\''+g.id+'\');closeModal(\'modalDetailGuru\')">✏️ Edit Data</button></div>';
  document.getElementById('modalDetailGuru').classList.remove('hidden');
}

function openModalTambahGuru() {
  editingGuruId=null;
  document.getElementById('modalGuruTitle').textContent='Tambah Guru';
  document.getElementById('mg_id').value='';
  ['mg_nama','mg_kode','mg_hp','mg_tempatLahir','mg_alamat','mg_spesialisasi'].forEach(function(id){document.getElementById(id).value='';});
  ['mg_tanggalLahir','mg_tanggalJoin'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('mg_batch').value='';
  document.getElementById('mg_status').value='true';
  document.getElementById('mg_tanggalJoin').value=new Date().toISOString().split('T')[0];
  document.getElementById('modalGuru').classList.remove('hidden');
}

function openEditGuru(id) {
  editingGuruId=id;
  var g=null; for(var i=0;i<allGuru.length;i++){if(allGuru[i].id===id){g=allGuru[i];break;}}
  if(!g) return;
  document.getElementById('modalGuruTitle').textContent='Edit Data Guru';
  document.getElementById('mg_id').value=g.id;
  document.getElementById('mg_nama').value=g.nama_lengkap||'';
  document.getElementById('mg_kode').value=g.kode_guru||'';
  document.getElementById('mg_hp').value=g.telepon||'';
  document.getElementById('mg_tempatLahir').value=g.tempat_lahir||'';
  document.getElementById('mg_tanggalLahir').value=g.tanggal_lahir||'';
  document.getElementById('mg_alamat').value=g.alamat||'';
  document.getElementById('mg_tanggalJoin').value=g.tanggal_join||'';
  document.getElementById('mg_batch').value=g.batch||'';
  document.getElementById('mg_spesialisasi').value=g.spesialisasi||'';
  document.getElementById('mg_status').value=String(g.is_active);
  document.getElementById('modalGuru').classList.remove('hidden');
}

async function simpanGuru() {
  var nama=document.getElementById('mg_nama').value.trim();
  var kode=document.getElementById('mg_kode').value.trim().toUpperCase();
  if(!nama||!kode){alert('Nama dan Kode Guru wajib!');return;}
  var data={
    nama_lengkap:nama, kode_guru:kode,
    telepon:document.getElementById('mg_hp').value.trim()||null,
    tempat_lahir:document.getElementById('mg_tempatLahir').value.trim()||null,
    tanggal_lahir:document.getElementById('mg_tanggalLahir').value||null,
    alamat:document.getElementById('mg_alamat').value.trim()||null,
    tanggal_join:document.getElementById('mg_tanggalJoin').value||null,
    batch:parseInt(document.getElementById('mg_batch').value)||null,
    spesialisasi:document.getElementById('mg_spesialisasi').value.trim()||null,
    is_active:document.getElementById('mg_status').value==='true'
  };
  try {
    if(editingGuruId){
      var er=(await db.from('guru').update(data).eq('id',editingGuruId)).error;
      if(er){alert('Error: '+er.message);return;}
      alert('✅ Data guru diupdate!');
    } else {
      var cnt=(await db.from('guru').select('*',{count:'exact',head:true})).count||0;
      data.nomor_induk='G'+String(cnt+1).padStart(3,'0');
      var er2=(await db.from('guru').insert(data)).error;
      if(er2){alert('Error: '+er2.message);return;}
      alert('✅ Guru ditambahkan! No. Induk: '+data.nomor_induk);
    }
    closeModal('modalGuru'); await loadGuru(); await populateGuruDropdowns();
  } catch(e){console.error('simpanGuru:',e);alert('Error: '+e.message);}
}

async function deleteGuru(id,nama) {
  if(!confirm('Hapus guru "'+nama+'"?')) return;
  await db.from('guru').delete().eq('id',id);
  await loadGuru(); await loadStats();
}

function updateBulkGuru(){
  document.querySelectorAll('.chk-guru:checked').forEach(function(c){selectedGuru.add(c.value);});
  document.querySelectorAll('.chk-guru:not(:checked)').forEach(function(c){selectedGuru.delete(c.value);});
  var bar=document.getElementById('bulkBarGuru');
  if(selectedGuru.size>0){bar.classList.add('show');document.getElementById('bulkCountGuru').textContent=selectedGuru.size+' guru dipilih';}
  else bar.classList.remove('show');
}
function toggleAllGuru(cb){document.querySelectorAll('.chk-guru').forEach(function(c){c.checked=cb.checked;cb.checked?selectedGuru.add(c.value):selectedGuru.delete(c.value);});updateBulkGuru();}
async function bulkDeleteGuru(){
  if(!confirm('Hapus '+selectedGuru.size+' guru?')) return;
  for(var id of selectedGuru) await db.from('guru').delete().eq('id',id);
  clearSelectGuru(); await loadGuru();
}
function clearSelectGuru(){selectedGuru.clear();document.querySelectorAll('.chk-guru').forEach(function(c){c.checked=false;});document.getElementById('checkAllGuru').checked=false;document.getElementById('bulkBarGuru').classList.remove('show');}

// ============================================
// HELPERS
// ============================================
async function populateGuruDropdowns() {
  try {
    var data=(await db.from('guru').select('id,nama_lengkap,kode_guru').eq('is_active',true)).data||[];
    var opts='<option value="">-- Pilih --</option>';
    var fOpts='<option value="">Semua Guru</option>';
    for(var i=0;i<data.length;i++){
      var g=data[i];
      opts+='<option value="'+g.id+'" data-kode="'+g.kode_guru+'">'+g.nama_lengkap+' ['+g.kode_guru+']</option>';
      fOpts+='<option value="'+g.id+'">'+g.nama_lengkap+'</option>';
    }
    document.getElementById('mk_guru').innerHTML=opts;
    var fg=document.getElementById('filterGuruKelas');
    if(fg) fg.innerHTML=fOpts;
  } catch(e){console.error('populateGuruDropdowns:',e);}
}

async function populateKelasSelect(elId) {
  try {
    var data=(await db.from('kelas').select('id,kode_kelas,jilid').eq('is_active',true).order('kode_kelas')).data||[];
    var html='<option value="">-- Pilih Kelas --</option>';
    for(var i=0;i<data.length;i++) html+='<option value="'+data[i].id+'">'+data[i].kode_kelas+' — Jilid '+data[i].jilid+'</option>';
    document.getElementById(elId).innerHTML=html;
  } catch(e){console.error('populateKelasSelect:',e);}
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden');
});
