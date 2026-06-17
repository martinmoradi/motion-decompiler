'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const fixtureRoot = __dirname;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const requested = url.pathname === '/' ? '/static-map-evidence.html' : url.pathname;
  const file = path.resolve(fixtureRoot, `.${requested}`);
  if (!file.startsWith(fixtureRoot) || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.setHeader('connection', 'close');
  res.setHeader('content-type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

function close() {
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', close);
process.on('SIGINT', close);

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  process.stdout.write(`http://127.0.0.1:${address.port}/static-map-evidence.html\n`);
});
