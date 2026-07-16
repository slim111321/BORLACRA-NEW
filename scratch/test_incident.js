const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseAnonKey } = require('./_env');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase.from('incident_reports').select('*').limit(1);
  console.log("incident_reports SELECT result:", { data, error });
}

run();
