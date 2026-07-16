const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseAnonKey } = require('./_env');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testColumn(colName) {
  const obj = {};
  obj[colName] = 'test';
  const { error } = await supabase.from('reviews').insert(obj);
  if (error && error.message.includes('Could not find')) {
    return false; // column doesn't exist
  }
  return true; // column exists (RLS may still block, but column is real)
}

async function run() {
  const candidates = [
    'id', 'collector_id', 'reviewer_id', 'user_id', 'customer_id',
    'pickup_id', 'rating', 'comment', 'review', 'text', 'message',
    'is_flagged', 'flagged', 'created_at', 'updated_at',
    'subject', 'status', 'type', 'score', 'feedback',
    'collector_name', 'reviewer_name', 'pickup_request_id',
    'stars', 'note', 'tag', 'tags'
  ];
  
  const existing = [];
  const missing = [];
  
  for (const col of candidates) {
    const exists = await testColumn(col);
    if (exists) existing.push(col);
    else missing.push(col);
  }
  
  console.log("EXISTING columns:", existing);
  console.log("Missing columns:", missing);
}

run();
