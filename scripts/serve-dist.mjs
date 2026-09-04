#!/usr/bin/env node
/**
 * Reproduce the EXACT Vercel serving behavior for dist/ locally:
 *  - security headers + CSP from vercel.json (global)
 *  - /assets/* immutable cache
 *  - SPA rewrite: any non-file path -> /index.html (filesystem first)
 * Usage: node scripts/serve-dist.mjs [port]   (default 4173)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'dist');
const PORT = Number(process.argv[2] || 4173);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'",
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

async function fileOrNull(path) {
  try {
    const st = await stat(path);
    if (st.isFile()) return path;
  } catch {
    /* fallthrough */
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // 1) filesystem first (like Vercel: routes try static, then rewrites)
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let file = await fileOrNull(join(ROOT, safe));
    let cache = 'public, max-age=0, must-revalidate';

    // 2) SPA rewrite fallback
    const isRealFile = Boolean(file);
    if (!file) {
      file = join(ROOT, 'index.html');
      cache = 'public, max-age=0, must-revalidate';
    }
    // Immutable cache ONLY for real asset files. A rewrite fallback (missing
    // chunk -> index.html) must NEVER be cached: the browser would poison the
    // URL with an HTML body and every later dynamic import would fail.
    if (isRealFile && pathname.startsWith('/assets/')) cache = 'public, max-age=31536000, immutable';

    const body = await readFile(file);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': cache,
      'Content-Length': body.length,
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' });
    res.end(String(err?.message ?? err));
  }
});

server.listen(PORT, () => console.log(`dist served on http://localhost:${PORT} (Vercel-equivalent headers)`));
