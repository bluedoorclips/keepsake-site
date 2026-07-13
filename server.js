/* Static file server + hidden tribute-film pages for BlueDoorClips.
   Usage: node server.js [root-folder] [port]
   Honours $PORT (Railway sets it automatically).

   Hidden tributes: /v/<token> plays a film registered in tributes.json.
   The pages are unlisted — no links from the site, noindex headers —
   so they are only reachable by the QR code / link given to the family.
   Films live in private/, which is never served directly.
   Add a film with: node make-tribute.js */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '.');
const port = process.env.PORT || process.argv[3] || 3000;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

function loadTributes() {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'tributes.json'), 'utf8'));
  } catch {
    return {};
  }
}

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function tributePage(t, token) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>In loving memory of ${esc(t.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@1,400;1,500&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{--bg:#eef1f5;--accent:#24425f;--slate:#6e8fae;--text:#141a21;--muted:#5b6672}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--text);font-family:'Inter Tight',system-ui,sans-serif;
       min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 20px}
  main{max-width:760px;width:100%;text-align:center}
  .eyebrow{font-size:12px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:var(--slate)}
  h1{font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:500;color:var(--accent);
     font-size:clamp(34px,7vw,54px);line-height:1.1;margin-top:14px}
  .dates{margin-top:10px;color:var(--muted);font-size:17px;letter-spacing:.06em}
  .film{margin-top:34px;border-radius:16px;overflow:hidden;box-shadow:0 18px 60px rgba(20,26,33,.18);background:#000}
  video{display:block;width:100%;height:auto}
  .message{margin-top:26px;font-family:'Fraunces',Georgia,serif;font-style:italic;font-size:19px;
           color:var(--muted);line-height:1.6;max-width:560px;margin-left:auto;margin-right:auto}
  footer{margin-top:44px;font-size:13px;color:var(--muted)}
  footer a{color:var(--accent);text-decoration:none;font-weight:600}
  footer a:hover{text-decoration:underline}
</style>
</head>
<body>
<main>
  <p class="eyebrow">In loving memory of</p>
  <h1>${esc(t.name)}</h1>
  ${t.dates ? `<p class="dates">${esc(t.dates)}</p>` : ''}
  <div class="film">
    <video controls playsinline preload="metadata"${t.poster ? ` poster="/v/${token}/poster"` : ''}>
      <source src="/v/${token}/stream" type="video/mp4">
      Your browser cannot play this film — try opening the link in Safari or Chrome.
    </video>
  </div>
  ${t.message ? `<p class="message">“${esc(t.message)}”</p>` : ''}
  <footer>A film by <a href="https://www.bluedoorclips.com">BlueDoorClips</a> &middot; crafted in Scotland</footer>
</main>
</body>
</html>`;
}

function streamVideo(req, res, filePath) {
  const stat = fs.existsSync(filePath) && fs.statSync(filePath);
  if (!stat || !stat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const type = types[path.extname(filePath).toLowerCase()] || 'video/mp4';
  const range = req.headers.range;
  if (range) {
    // Range support so phones (especially iPhones) can play and seek
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (isNaN(start) || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    end = Math.min(isNaN(end) ? stat.size - 1 : end, stat.size - 1);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': type,
    });
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400); return res.end('Bad request');
  }

  // ── Hidden tribute section ──────────────────────────────────────
  // The registry and the films folder are never served directly.
  if (urlPath === '/tributes.json' || urlPath === '/private' || urlPath.startsWith('/private/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const vMatch = /^\/v\/([A-Za-z0-9]{8,64})(\/stream|\/poster)?$/.exec(urlPath);
  if (vMatch) {
    const tribute = loadTributes()[vMatch[1]];
    if (!tribute) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    if (vMatch[2] === '/stream') return streamVideo(req, res, path.join(root, tribute.video));
    if (vMatch[2] === '/poster') {
      const p = tribute.poster ? path.join(root, tribute.poster) : null;
      if (!p || !fs.existsSync(p)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(p).toLowerCase()] || 'image/jpeg' });
      return fs.createReadStream(p).pipe(res);
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    });
    return res.end(tributePage(tribute, vMatch[1]));
  }
  // ── End hidden tribute section ──────────────────────────────────

  let filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  let stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  if (stat && stat.isDirectory()) {
    const index = path.join(filePath, 'index.html');
    if (fs.existsSync(index)) {
      filePath = index;
      stat = fs.statSync(filePath);
    } else {
      // simple directory listing so template roots are browsable
      const entries = fs.readdirSync(filePath)
        .map(name => `<li><a href="${path.posix.join(urlPath, name)}">${name}</a></li>`)
        .join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<h1>${urlPath}</h1><ul>${entries}</ul>`);
    }
  }
  if (!stat) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, {
    'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
  });
  fs.createReadStream(filePath).pipe(res);
}).listen(port, () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});
