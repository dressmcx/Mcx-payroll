import { createClient } from '@supabase/supabase-js';

// ── PASTE YOUR VALUES BELOW ────────────────────────────────────
// Get these from: Supabase Dashboard → Project Settings → API
const supabaseUrl = 'PASTE_YOUR_PROJECT_URL_HERE';
const supabaseAnonKey = 'PASTE_YOUR_ANON_KEY_HERE';
// ────────────────────────────────────────────────────────────────

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
