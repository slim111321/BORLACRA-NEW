const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gmllzbdvmhygbedqgxgf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbGx6YmR2bWh5Z2JlZHFneGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NDc2OTEsImV4cCI6MjA4NDUyMzY5MX0.5I1erA9sL5hIx6A8cDzhfFNnvStUll6NCqCGIq_Azao';

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
