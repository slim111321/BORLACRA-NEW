const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseAnonKey } = require('./_env');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log("Inspecting reviews table metadata...");
  // Let's try to query public schemas or see if we get pg_tables
  const { data: pgTables, error: tError } = await supabase.from('pg_tables').select('*');
  if (tError) {
    console.log("Could not read pg_tables directly:", tError.message);
  } else {
    console.log("Tables list:", pgTables);
  }
}

run();
