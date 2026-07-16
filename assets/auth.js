// =============================================
// AUTH — LOGIN & REDIRECT PER ROLE
// =============================================

const roleRoutes = {
    leader           : 'pages/dashboard-leader.html',
    admin            : 'pages/dashboard-admin.html',
    bendahara        : 'pages/dashboard-bendahara.html',
    teacher_mandarin : 'pages/dashboard-teacher.html',
    teacher_calistung: 'pages/dashboard-teacher.html',
    teacher_sd       : 'pages/dashboard-teacher.html'
};

const loginForm = document.getElementById('loginForm');
const loginBtn  = document.getElementById('loginBtn');
const errMsg    = document.getElementById('errMsg');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // Tampilkan loading
    loginBtn.disabled    = true;
    loginBtn.textContent = 'Memproses...';
    errMsg.textContent   = '';

    try {
        // 1. Login ke Supabase Auth
        const { data: authData, error: authError } =
            await db.auth.signInWithPassword({ email, password });

        if (authError) throw new Error('Email atau password salah.');

        // 2. Ambil role dari tabel profiles
        const { data: profile, error: profileError } =
            await db.from('profiles')
                    .select('role, nama_lengkap, is_active')
                    .eq('id', authData.user.id)
                    .single();

        if (profileError || !profile)
            throw new Error('Profil tidak ditemukan. Hubungi admin.');

        if (!profile.is_active)
            throw new Error('Akun nonaktif. Hubungi Leader.');

        // 3. Redirect ke dashboard sesuai role
        const route = roleRoutes[profile.role];
        if (!route) throw new Error('Role tidak dikenali.');

        window.location.href = route;

    } catch (err) {
        errMsg.textContent   = err.message;
        loginBtn.disabled    = false;
        loginBtn.textContent = 'Masuk';
    }
});