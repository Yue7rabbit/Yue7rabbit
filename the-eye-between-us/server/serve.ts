// Minimal production server: serves the built `dist/` folder and the AI proxy.
// Usage: npm run build && node server/serve.ts   (PORT defaults to 4173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleInterpret, hasCredentials } from './interpretHandler.ts';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT) || 4173;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/api/interpret') return handleInterpret(req, res);
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = join(root, rel || 'index.html');
  if (!file.startsWith(root)) {
    res.statusCode = 403;
    return res.end();
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
}).listen(port, () => {
  console.log(`THE EYE BETWEEN US → http://localhost:${port}  (AI: ${hasCredentials() ? 'enabled' : 'local fallback'})`);
});
