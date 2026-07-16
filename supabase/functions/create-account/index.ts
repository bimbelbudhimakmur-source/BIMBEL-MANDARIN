// supabase/functions/create-account/index.ts
//
// Edge Function: create-account
// Dipanggil dari Admin TU saat menambah Guru/Bendahara/Leader baru.
// Membuat akun di auth.users + row di tabel profiles dengan role yang ditentukan.
//
// Keamanan:
// - Hanya bisa dipanggil oleh user yang sudah login DAN role-nya 'admin' atau 'leader'
//   (dicek dari token JWT pemanggil via tabel profiles).
// - Service role key disimpan sebagai env var di server, tidak pernah dikirim ke browser.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('PROJECT_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Ambil token JWT dari pemanggil (caller) untuk verifikasi role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Tidak ada token otorisasi.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Client biasa (anon key context) untuk verifikasi siapa yang memanggil
    const callerClient = createClient(SUPABASE_URL, Deno.env.get('ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerUser, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerUser?.user) {
      return new Response(JSON.stringify({ error: 'Token tidak valid.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Client admin (service role) — bisa bypass RLS
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 3. Cek role pemanggil — hanya admin/leader yang boleh membuat akun baru
    const { data: callerProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.user.id)
      .single();

    if (profileErr || !callerProfile) {
      return new Response(JSON.stringify({ error: 'Profil pemanggil tidak ditemukan.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['admin', 'leader'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Tidak punya izin untuk membuat akun baru.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Ambil data dari body request
    const body = await req.json();
    const { email, password, nama_lengkap, role } = body;

    if (!email || !password || !nama_lengkap || !role) {
      return new Response(JSON.stringify({ error: 'email, password, nama_lengkap, dan role wajib diisi.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allowedRoles = ['teacher_mandarin', 'teacher_calistung', 'teacher_sd', 'bendahara', 'leader', 'admin'];
    if (!allowedRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Role tidak valid.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'Password minimal 6 karakter.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Buat user baru di auth.users
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // langsung confirmed, tidak perlu verifikasi email
    });

    if (createErr) {
      return new Response(JSON.stringify({ error: 'Gagal membuat akun: ' + createErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newUserId = newUser.user.id;

    // 6. Insert/upsert ke tabel profiles
    const { error: insertProfileErr } = await adminClient.from('profiles').insert({
      id: newUserId,
      email,
      nama_lengkap,
      role,
      is_active: true,
    });

    if (insertProfileErr) {
      // Rollback: hapus auth user yang sudah dibuat kalau insert profile gagal
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: 'Gagal membuat profil: ' + insertProfileErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 7. Sukses — kembalikan profile_id baru
    return new Response(JSON.stringify({ success: true, profile_id: newUserId, email, nama_lengkap, role }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Internal error: ' + (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});