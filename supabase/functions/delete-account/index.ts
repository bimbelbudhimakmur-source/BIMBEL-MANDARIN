// supabase/functions/delete-account/index.ts
//
// Edge Function: delete-account
// Dipanggil dari Admin TU saat menghapus guru yang punya akun login terhubung.
// Menghapus row di profiles + akun di auth.users.
//
// Keamanan:
// - Hanya bisa dipanggil oleh user dengan role 'admin' atau 'leader'.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('PROJECT_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Tidak ada token otorisasi.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
      return new Response(JSON.stringify({ error: 'Tidak punya izin untuk menghapus akun.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { profile_id } = body;

    if (!profile_id) {
      return new Response(JSON.stringify({ error: 'profile_id wajib diisi.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tidak boleh hapus akun sendiri
    if (profile_id === callerUser.user.id) {
      return new Response(JSON.stringify({ error: 'Tidak bisa menghapus akun yang sedang digunakan untuk login.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hapus dari profiles dulu (kalau ada FK ke profiles dari tabel lain selain guru, biar ketahuan)
    const { error: delProfileErr } = await adminClient.from('profiles').delete().eq('id', profile_id);
    if (delProfileErr) {
      return new Response(JSON.stringify({ error: 'Gagal menghapus profil: ' + delProfileErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hapus dari auth.users
    const { error: delAuthErr } = await adminClient.auth.admin.deleteUser(profile_id);
    if (delAuthErr) {
      return new Response(JSON.stringify({ error: 'Profil terhapus, tapi gagal menghapus akun login: ' + delAuthErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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