/**
 * RouteEvolve Static File Server
 * Zero-dependency server using Node.js built-in modules.
 * Default URL: http://localhost:5500
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 5500;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.csv': 'text/csv; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8'
};

const server = http.createServer((req, res) => {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Parse path
  const parsedUrl = url.parse(req.url);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Resolve file path safely within ROOT_DIR
  const safePath = path.normalize(path.join(ROOT_DIR, pathname));
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(`<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family:sans-serif;padding:2rem;"><h1>404 Not Found</h1><p>The requested file <code>${pathname}</code> was not found.</p><p><a href="/">Return to RouteEvolve</a></p></body></html>`);
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error: ' + err.code);
      }
      return;
    }

    let filePath = safePath;
    if (stats.isDirectory()) {
      filePath = path.join(safePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Disable caching for live development so edits show instantly
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Type', contentType);

    const stream = fs.createReadStream(filePath);
    stream.on('open', () => {
      res.writeHead(200);
      stream.pipe(res);
    });
    stream.on('error', (streamErr) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error streaming file: ' + streamErr.code);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('============================================================');
  console.log(' RouteEvolve: Delivery Route Optimizer (Genetic Algorithm)');
  console.log(' Soft Computing Lab Project - Travelling Salesman Problem');
  console.log('============================================================');
  console.log(` Server running locally at:`);
  console.log(`   --> http://localhost:${PORT}`);
  console.log(`   --> http://127.0.0.1:${PORT}`);
  console.log(' Tests page available at:');
  console.log(`   --> http://localhost:${PORT}/tests.html`);
  console.log(' Press Ctrl+C to stop the server.');
  console.log('============================================================');
});
