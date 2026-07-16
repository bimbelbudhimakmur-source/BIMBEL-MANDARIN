// =============================================
// KONEKSI SUPABASE — BUDHI MAKMUR MANDARIN
// =============================================

const SUPABASE_URL  = 'https://fztiioipxajzwpokqkoa.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6dGlpb2lweGFqendwb2txa29hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5ODcyMzksImV4cCI6MjA5ODU2MzIzOX0.ixf5eNivJUnKOodbKtIdb-ysDsAO6eShA91MUUhFzS8';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);