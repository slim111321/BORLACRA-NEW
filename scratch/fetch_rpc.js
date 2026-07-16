const https = require('https');
const { supabaseUrl, supabaseAnonKey } = require('./_env');

const supabaseHost = supabaseUrl.replace(/^https?:\/\//, '');

const options = {
  hostname: supabaseHost,
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
