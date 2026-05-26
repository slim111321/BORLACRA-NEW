const https = require('https');

const supabaseUrl = 'gmllzbdvmhygbedqgxgf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbGx6YmR2bWh5Z2JlZHFneGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NDc2OTEsImV4cCI6MjA4NDUyMzY5MX0.5I1erA9sL5hIx6A8cDzhfFNnvStUll6NCqCGIq_Azao';

// Use HEAD request with Prefer: return=representation to get column info
const options = {
  hostname: supabaseUrl,
  path: '/rest/v1/reviews?limit=0',
  method: 'GET',
  headers: {
    'apikey': supabaseAnonKey,
    'Authorization': `Bearer ${supabaseAnonKey}`,
    'Accept': 'application/json',
    'Prefer': 'count=exact'
  }
};

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Content-Range:', res.headers['content-range']);
  
  // The response headers can tell us count
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Body:', data);
  });
});

req.on('error', (e) => { console.error(e); });
req.end();

// Also try OPTIONS to see available columns
const options2 = {
  hostname: supabaseUrl,
  path: '/rest/v1/reviews',
  method: 'OPTIONS',
  headers: {
    'apikey': supabaseAnonKey,
    'Authorization': `Bearer ${supabaseAnonKey}`
  }
};

const req2 = https.request(options2, (res) => {
  console.log('\nOPTIONS Status:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      // PostgREST OPTIONS returns column definitions
      if (parsed.definitions && parsed.definitions.reviews) {
        console.log('Reviews columns:', Object.keys(parsed.definitions.reviews.properties));
        console.log('Reviews properties:', JSON.stringify(parsed.definitions.reviews.properties, null, 2));
      } else if (parsed.columns) {
        console.log('Columns:', parsed.columns);
      } else {
        console.log('OPTIONS body (first 2000 chars):', data.substring(0, 2000));
      }
    } catch(e) {
      console.log('OPTIONS raw:', data.substring(0, 2000));
    }
  });
});

req2.on('error', (e) => { console.error(e); });
req2.end();
