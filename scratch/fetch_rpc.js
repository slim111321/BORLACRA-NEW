const https = require('https');

const supabaseUrl = 'gmllzbdvmhygbedqgxgf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbGx6YmR2bWh5Z2JlZHFneGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NDc2OTEsImV4cCI6MjA4NDUyMzY5MX0.5I1erA9sL5hIx6A8cDzhfFNnvStUll6NCqCGIq_Azao';

const options = {
  hostname: supabaseUrl,
  path: '/rest/v1/',
  method: 'GET',
  headers: {
    'apikey': supabaseAnonKey,
    'Authorization': `Bearer ${supabaseAnonKey}`
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Available OpenAPI Paths:', Object.keys(parsed.paths).filter(p => p.startsWith('/rpc/')));
    } catch(e) {
      console.log('Failed to parse paths:', e.message);
    }
  });
});
req.end();
