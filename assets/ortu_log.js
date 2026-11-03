/* Log pencarian akun orang tua (Leader & Admin) */
async function loadOrtuLog() {
  var tbody = document.getElementById('tableOrtuLog'); if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="5">⏳ Memuat...</td></tr>';
  var jenis = (document.getElementById('filterOrtuJenis') || {}).value || '';
  var q = db.from('ortu_log').select('*').order('waktu', { ascending: false }).limit(300);
  if (jenis) q = q.eq('jenis', jenis);
  var r = await q;
  if (r.error) { tbody.innerHTML = '<tr><td colspan="5" style="color:#dc2626">Error: ' + r.error.message + ' (jalankan fitur_akun_ortu.sql)</td></tr>'; return; }
  updateOrtuLogBar();
  if (!r.data.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:#6b7280">Belum ada aktivitas orang tua</td></tr>'; return; }
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var all = document.getElementById('checkAllOrtuLog'); if (all) all.checked = false;
  tbody.innerHTML = r.data.map(function (l) {
    var w = new Date(l.waktu).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    var cb = '<td><input type="checkbox" class="chk-ortulog" value="' + l.id + '" onchange="updateOrtuLogBar()"></td>';
    return l.jenis === 'cari'
      ? '<tr>' + cb + '<td>' + w + '</td><td><span class="badge badge-blue">🔍 Cari</span></td><td>“' + esc(l.kata_kunci) + '”</td><td>' + (l.jumlah_hasil || 0) + ' hasil</td></tr>'
      : '<tr>' + cb + '<td>' + w + '</td><td><span class="badge badge-green">👁️ Lihat data</span></td><td><strong>' + esc(l.nama_siswa) + '</strong></td><td>—</td></tr>';
  }).join('');
}

function updateOrtuLogBar() {
  var n = document.querySelectorAll('.chk-ortulog:checked').length;
  var b = document.getElementById('btnHapusPilihOrtuLog');
  if (b) { b.style.display = n ? '' : 'none'; b.textContent = '🗑️ Hapus ' + n + ' yang dipilih'; }
}
function toggleAllOrtuLog(el) {
  document.querySelectorAll('.chk-ortulog').forEach(function (c) { c.checked = el.checked; });
  updateOrtuLogBar();
}
async function hapusOrtuLogDipilih() {
  var ids = Array.prototype.map.call(document.querySelectorAll('.chk-ortulog:checked'), function (c) { return c.value; });
  if (!ids.length) return;
  if (!confirm('Hapus ' + ids.length + ' catatan log yang dipilih?')) return;
  var r = await db.from('ortu_log').delete().in('id', ids);
  if (r.error) { alert('❌ ' + r.error.message + '\n\nJalankan fitur_hapus_log_ortu.sql dulu.'); return; }
  loadOrtuLog();
}
async function hapusOrtuLogSemua() {
  var jenis = (document.getElementById('filterOrtuJenis') || {}).value || '';
  var label = jenis === 'cari' ? 'SEMUA catatan pencarian' : jenis === 'lihat' ? 'SEMUA catatan data murid dibuka' : 'SELURUH log akun orang tua';
  if (!confirm('Hapus ' + label + '?\n\nTindakan ini tidak bisa dibatalkan.')) return;
  var q = db.from('ortu_log').delete().gt('id', 0);
  if (jenis) q = q.eq('jenis', jenis);
  var r = await q;
  if (r.error) { alert('❌ ' + r.error.message + '\n\nJalankan fitur_hapus_log_ortu.sql dulu.'); return; }
  loadOrtuLog();
}
