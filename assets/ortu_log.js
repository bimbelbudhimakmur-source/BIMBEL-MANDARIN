/* Log pencarian akun orang tua (Leader & Admin) */
async function loadOrtuLog() {
  var tbody = document.getElementById('tableOrtuLog'); if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="4">⏳ Memuat...</td></tr>';
  var jenis = (document.getElementById('filterOrtuJenis') || {}).value || '';
  var q = db.from('ortu_log').select('*').order('waktu', { ascending: false }).limit(300);
  if (jenis) q = q.eq('jenis', jenis);
  var r = await q;
  if (r.error) { tbody.innerHTML = '<tr><td colspan="4" style="color:#dc2626">Error: ' + r.error.message + ' (jalankan fitur_akun_ortu.sql)</td></tr>'; return; }
  if (!r.data.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:#6b7280">Belum ada aktivitas orang tua</td></tr>'; return; }
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  tbody.innerHTML = r.data.map(function (l) {
    var w = new Date(l.waktu).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return l.jenis === 'cari'
      ? '<tr><td>' + w + '</td><td><span class="badge badge-blue">🔍 Cari</span></td><td>“' + esc(l.kata_kunci) + '”</td><td>' + (l.jumlah_hasil || 0) + ' hasil</td></tr>'
      : '<tr><td>' + w + '</td><td><span class="badge badge-green">👁️ Lihat data</span></td><td><strong>' + esc(l.nama_siswa) + '</strong></td><td>—</td></tr>';
  }).join('');
}
