// Shared credential loader for scratch/ debug scripts.
//
// Added as part of BC-038 (committed secrets): these scripts used to hardcode
// the live Supabase URL/anon key as string literals. They now read from the
// repo-root .env.local (already gitignored via `.env*.local`), so no secret
// is ever committed to git via this directory.
//
// Usage: const { supabaseUrl, supabaseAnonKey } = require('./_env');
const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const vars = {};

  if (fs.existsSync(envPath)) {
    const contents = fs.readFileSync(envPath, 'utf8');
    for (const line of contents.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      vars[key] = value;
    }
  }

  return vars;
}

const envLocal = loadEnvLocal();
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || envLocal.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || envLocal.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase credentials. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the repo-root .env.local (see .env.local.example), or export them as environment variables before running scripts in scratch/.'
  );
}

module.exports = { supabaseUrl, supabaseAnonKey };
