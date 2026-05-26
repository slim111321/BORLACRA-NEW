const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gmllzbdvmhygbedqgxgf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbGx6YmR2bWh5Z2JlZHFneGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NDc2OTEsImV4cCI6MjA4NDUyMzY5MX0.5I1erA9sL5hIx6A8cDzhfFNnvStUll6NCqCGIq_Azao';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase.from('incident_reports').select('*').limit(1);
  console.log("incident_reports SELECT result:", { data, error });
}

run();
