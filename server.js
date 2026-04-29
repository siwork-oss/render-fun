const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL;

const EXCLUDED_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-connection',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer'
]);

function getClientIP(req) {
  return req.headers['x-real-ip'] || 
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.socket.remoteAddress;
}

function filterHeaders(headers) {
  const filtered = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!EXCLUDED_HEADERS.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

const server = http.createServer((req, res) => {
  if (!TARGET_URL) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Configuration error: TARGET_URL not set');
    return;
  }

  try {
    const targetUrl = new URL(req.url, TARGET_URL);
    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const clientIP = getClientIP(req);
    const forwardedHeaders = filterHeaders(req.headers);
    
    forwardedHeaders['x-forwarded-for'] = clientIP;
    forwardedHeaders['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'http';
    forwardedHeaders['x-forwarded-host'] = req.headers.host;

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: forwardedHeaders
    };

    const proxyReq = client.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Gateway Error');
      }
    });

    req.pipe(proxyReq);

  } catch (err) {
    console.error('Request error:', err.message);
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Target URL: ${TARGET_URL || 'NOT SET'}`);
});
