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

/* Memory Card storage — a Railway volume in production (DATA_DIR=/data),
   a local folder in dev. Holds the event registry, guest uploads and
   written memories. */
const DATA = process.env.DATA_DIR || path.join(root, 'data-local');
const ADMIN_KEY = process.env.MEMORY_ADMIN_KEY || '';
fs.mkdirSync(path.join(DATA, 'memory-uploads'), { recursive: true });
fs.mkdirSync(path.join(DATA, 'memory-notes'), { recursive: true });

function loadEvents() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, 'memory-events.json'), 'utf8'));
  } catch {
    return {};
  }
}
function saveEvents(e) {
  fs.writeFileSync(path.join(DATA, 'memory-events.json'), JSON.stringify(e, null, 2));
}
function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > cap) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* Tribute films + registry live on the family-portal service (private volume
   + Postgres) — never in this public repo. Local tributes.json is a fallback
   for offline dev only. */
const PORTAL = process.env.PORTAL_URL || 'https://web-production-626a4.up.railway.app';

async function lookupTribute(token) {
  try {
    const r = await fetch(`${PORTAL}/api/tributes/${token}`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const j = await r.json();
      return { name: j.name, dates: j.dates, message: j.message, mediaUrl: `${PORTAL}${j.media}` };
    }
  } catch { /* portal unreachable — fall through to local registry */ }
  const local = loadTributes()[token];
  if (local) return { ...local, mediaUrl: null };
  return null;
}

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

function tributePage(t, token, mediaUrl) {
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
  video{display:block;max-width:100%;max-height:82vh;width:auto;height:auto;margin:0 auto}
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
      <source src="${esc(mediaUrl || `/v/${token}/stream`)}" type="video/mp4">
      Your browser cannot play this film — try opening the link in Safari or Chrome.
    </video>
  </div>
  ${t.message ? `<p class="message">“${esc(t.message)}”</p>` : ''}
  <footer>A film by <a href="https://www.bluedoorclips.com">BlueDoorClips</a> &middot; crafted in Scotland</footer>
</main>
</body>
</html>`;
}

function memoryPage(ev, token) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Memories of ${esc(ev.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@1,400;1,500&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{--bg:#eef1f5;--accent:#24425f;--slate:#6e8fae;--gold:#b39448;--text:#141a21;--muted:#5b6672}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--text);font-family:'Inter Tight',system-ui,sans-serif;
       display:flex;justify-content:center;padding:34px 18px 60px}
  main{max-width:680px;width:100%;text-align:center}
  .eyebrow{font-size:12px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:var(--slate)}
  h1{font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:500;color:var(--accent);
     font-size:clamp(32px,7vw,50px);line-height:1.1;margin-top:12px}
  .dates{margin-top:8px;color:var(--muted);font-size:16px;letter-spacing:.06em}
  .film{margin-top:28px;border-radius:16px;overflow:hidden;box-shadow:0 18px 60px rgba(20,26,33,.18);background:#000}
  video{display:block;max-width:100%;max-height:70vh;width:auto;height:auto;margin:0 auto}
  section{margin-top:40px;background:#fff;border-radius:18px;padding:28px 22px;
          box-shadow:0 10px 40px rgba(20,26,33,.08);text-align:left}
  h2{font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:500;color:var(--accent);
     font-size:26px;text-align:center}
  .sub{margin-top:8px;color:var(--muted);font-size:15px;line-height:1.55;text-align:center}
  label{display:block;margin-top:18px;font-size:13px;font-weight:600;letter-spacing:.04em;color:var(--accent)}
  input[type=text],textarea{width:100%;margin-top:7px;padding:13px 14px;border:1px solid #d5dbe3;
     border-radius:12px;font:inherit;font-size:16px;background:#fafbfc}
  textarea{min-height:120px;resize:vertical}
  .btn{display:block;width:100%;margin-top:18px;padding:16px;border:0;border-radius:14px;
       background:var(--accent);color:#fff;font:inherit;font-size:17px;font-weight:600;cursor:pointer}
  .btn:active{transform:translateY(1px)}
  .btn.gold{background:var(--gold)}
  .file-note{margin-top:10px;font-size:13px;color:var(--muted);text-align:center}
  .ok{display:none;margin-top:14px;padding:13px;border-radius:12px;background:#eaf4ec;
      color:#2c5f39;font-size:15px;text-align:center}
  progress{width:100%;margin-top:12px;display:none;height:10px}
  footer{margin-top:44px;font-size:13px;color:var(--muted)}
  footer a{color:var(--accent);text-decoration:none;font-weight:600}
</style>
</head>
<body>
<main>
  <p class="eyebrow">In loving memory of</p>
  <h1>${esc(ev.name)}</h1>
  ${ev.dates ? `<p class="dates">${esc(ev.dates)}</p>` : ''}
  ${ev.tribute || ev.video ? `<div class="film"><video controls playsinline preload="metadata">
    <source src="${ev.tribute ? `/v/${esc(ev.tribute)}/stream` : esc(ev.video)}" type="video/mp4"></video></div>
    <p class="sub" style="margin-top:12px">The tribute film — press play.</p>` : ''}

  <section>
    <h2>Share a photograph or video</h2>
    <p class="sub">Something from your phone — a holiday, a night out, an ordinary day.
       The family will treasure it.</p>
    <label>Your name</label>
    <input type="text" id="upname" placeholder="So the family know who it is from">
    <label>Choose your photographs or videos</label>
    <input type="file" id="files" multiple accept="image/*,video/*" style="margin-top:8px;font-size:15px">
    <button class="btn" id="upbtn" type="button">Send to the family</button>
    <progress id="prog" max="100" value="0"></progress>
    <p class="ok" id="upok">Thank you — safely received.</p>
    <p class="file-note">Photos and videos up to 250MB each. Nothing appears publicly.</p>
  </section>

  <section>
    <h2>Write a memory</h2>
    <p class="sub">A story, a moment, or simply what they meant to you.
       A few words are more than enough.</p>
    <label>Your name</label>
    <input type="text" id="memname" placeholder="Your name">
    <label>Your memory</label>
    <textarea id="memtext" placeholder="I will always remember..."></textarea>
    <button class="btn gold" id="membtn" type="button">Leave this memory</button>
    <p class="ok" id="memok">Thank you — your memory has been kept for the family.</p>
  </section>

  <footer>Gathered with care by <a href="https://www.bluedoorclips.com">BlueDoorClips</a> &middot; crafted in Scotland</footer>
</main>
<script>
const token = ${JSON.stringify(token)};
document.getElementById('upbtn').onclick = async () => {
  const files = document.getElementById('files').files;
  if (!files.length) { alert('Choose a photograph or video first.'); return; }
  const by = encodeURIComponent(document.getElementById('upname').value || 'guest');
  const prog = document.getElementById('prog');
  prog.style.display = 'block';
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    prog.value = Math.round(100 * i / files.length);
    const r = await fetch('/m/' + token + '/upload?name=' + encodeURIComponent(f.name) + '&by=' + by,
                          { method: 'POST', body: f });
    if (!r.ok) { alert('That one did not go through — please try again.'); prog.style.display='none'; return; }
  }
  prog.value = 100;
  document.getElementById('upok').style.display = 'block';
  document.getElementById('files').value = '';
  setTimeout(() => { prog.style.display = 'none'; prog.value = 0; }, 1500);
};
document.getElementById('membtn').onclick = async () => {
  const text = document.getElementById('memtext').value.trim();
  if (!text) { alert('Write a few words first.'); return; }
  const r = await fetch('/m/' + token + '/memory', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ by: document.getElementById('memname').value, text })
  });
  if (r.ok) {
    document.getElementById('memok').style.display = 'block';
    document.getElementById('memtext').value = '';
  } else { alert('That did not go through — please try again.'); }
};
</script>
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

http.createServer(async (req, res) => {
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
    const tribute = await lookupTribute(vMatch[1]);
    if (!tribute) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    if (vMatch[2] === '/stream') {
      if (tribute.mediaUrl) {
        res.writeHead(302, { Location: tribute.mediaUrl });
        return res.end();
      }
      return streamVideo(req, res, path.join(root, tribute.video));
    }
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
    return res.end(tributePage(tribute, vMatch[1], tribute.mediaUrl));
  }
  // ── End hidden tribute section ──────────────────────────────────

  // ── Memory Card section (/m/<token>) ────────────────────────────
  // Wake-table QR pages: watch the film, upload photos/clips, leave a
  // written memory. Guest data lives on the DATA volume, never public.
  const mAdmin = /^\/m-admin\/(create|list\/([A-Za-z0-9-]{3,64}))$/.exec(urlPath);
  if (mAdmin) {
    if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end('{"error":"forbidden"}');
    }
    if (mAdmin[1] === 'create' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8'));
        const token = (body.token || Math.random().toString(36).slice(2, 10)).toLowerCase();
        if (!/^[a-z0-9-]{3,64}$/.test(token)) throw new Error('bad token');
        const events = loadEvents();
        events[token] = { name: String(body.name || ''), dates: String(body.dates || ''),
                          tribute: String(body.tribute || ''), video: String(body.video || ''),
                          created: new Date().toISOString() };
        saveEvents(events);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, token, url: `https://www.bluedoorclips.com/m/${token}` }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    }
    const token = mAdmin[2];
    const dir = path.join(DATA, 'memory-uploads', token);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => ({
      file: f, size: fs.statSync(path.join(dir, f)).size })) : [];
    let notes = [];
    try {
      notes = fs.readFileSync(path.join(DATA, 'memory-notes', token + '.jsonl'), 'utf8')
        .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch { /* none yet */ }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ event: loadEvents()[token] || null, files, notes }, null, 2));
  }

  const mMatch = /^\/m\/([a-z0-9-]{3,64})(\/upload|\/memory)?$/.exec(urlPath);
  if (mMatch) {
    const [, token, action] = mMatch;
    const ev = loadEvents()[token];
    if (!ev) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    if (action === '/upload' && req.method === 'POST') {
      const q = new URLSearchParams(req.url.split('?')[1] || '');
      const safe = (q.get('name') || 'file').replace(/[^A-Za-z0-9. _-]/g, '').slice(-80) || 'file';
      const by = (q.get('by') || 'guest').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 40) || 'guest';
      const dir = path.join(DATA, 'memory-uploads', token);
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, `${Date.now()}-${by}-${safe}`);
      const cap = 250 * 1024 * 1024;
      let size = 0;
      const out = fs.createWriteStream(dest);
      req.on('data', (c) => {
        size += c.length;
        if (size > cap) {
          out.destroy();
          fs.unlink(dest, () => {});
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end('{"error":"too large"}');
          req.destroy();
        }
      });
      req.pipe(out);
      out.on('finish', () => {
        if (res.writableEnded) return;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
      out.on('error', () => {
        if (res.writableEnded) return;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"error":"write failed"}');
      });
      return;
    }
    if (action === '/memory' && req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req, 32 * 1024)).toString('utf8'));
        const note = { by: String(body.by || '').slice(0, 80), text: String(body.text || '').slice(0, 4000),
                       at: new Date().toISOString() };
        if (!note.text.trim()) throw new Error('empty');
        fs.appendFileSync(path.join(DATA, 'memory-notes', token + '.jsonl'), JSON.stringify(note) + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    });
    return res.end(memoryPage(ev, token));
  }
  // ── End Memory Card section ─────────────────────────────────────

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
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4' || ext === '.webm') {
    // Range support so phones (especially iPhones) can play and seek
    return streamVideo(req, res, filePath);
  }
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
  });
  fs.createReadStream(filePath).pipe(res);
}).listen(port, () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});
