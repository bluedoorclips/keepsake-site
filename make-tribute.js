/* Publish a hidden tribute film + generate its QR code.

   Usage:
     node make-tribute.js <path-to-video.mp4> "Full Name" "1948 — 2026" ["optional message"]

   What it does:
     1. Creates an unguessable token (the secret part of the link)
     2. Uploads the film to the private media store (family-portal volume — never this public repo)
     3. Registers the tribute (name/dates/message) in the platform database
     4. Writes the print-ready QR code PNG into qr-codes/

   No deploy needed — the page is live at once: https://www.bluedoorclips.com/v/<token>

   Auth: reads the admin token from the .admin-token file here (gitignored),
   or the BDC_ADMIN_TOKEN environment variable.

   Tip: re-encode big CapCut exports first so phones stream them instantly:
     ffmpeg -i in.mp4 -c:v libx264 -crf 22 -maxrate 4500k -bufsize 9000k -r 30 -c:a copy -movflags +faststart out.mp4
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORTAL = process.env.PORTAL_URL || 'https://web-production-626a4.up.railway.app';

const [, , videoPath, name, dates, message] = process.argv;
if (!videoPath || !name) {
  console.log('Usage: node make-tribute.js <video.mp4> "Full Name" "1948 — 2026" ["message"]');
  process.exit(1);
}
if (!fs.existsSync(videoPath)) {
  console.error(`Video not found: ${videoPath}`);
  process.exit(1);
}

let adminToken = process.env.BDC_ADMIN_TOKEN || '';
try {
  if (!adminToken) adminToken = fs.readFileSync(path.join(__dirname, '.admin-token'), 'utf8').trim();
} catch {}
if (!adminToken) {
  console.error('No admin token — put it in .admin-token next to this script, or set BDC_ADMIN_TOKEN.');
  process.exit(1);
}

const token = crypto.randomBytes(8).toString('hex');
const filename = `${token}.mp4`;

function request(method, urlPath, headers, bodyStream, jsonBody) {
  return new Promise((resolve, reject) => {
    const u = new URL(PORTAL + urlPath);
    const data = jsonBody ? Buffer.from(JSON.stringify(jsonBody)) : null;
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method,
        headers: {
          'x-setup-token': adminToken,
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(out || '{}'));
          else reject(new Error(`${method} ${urlPath} → ${res.statusCode}: ${out.slice(0, 200)}`));
        });
      }
    );
    req.on('error', reject);
    if (bodyStream) bodyStream.pipe(req);
    else req.end(data || undefined);
  });
}

(async () => {
  const size = fs.statSync(videoPath).size;
  console.log(`Uploading ${(size / 1024 / 1024).toFixed(1)} MB… (this can take a few minutes)`);
  await request('PUT', `/api/media/${filename}`, { 'Content-Length': size }, fs.createReadStream(videoPath));

  const reg = await request('POST', '/api/tributes', {}, null, {
    token,
    name,
    dates: dates || '',
    message: message || '',
    filename,
  });

  console.log(`\nTribute published for ${name}`);
  console.log(`Link:    ${reg.url}`);

  try {
    const QRCode = require('qrcode');
    fs.mkdirSync(path.join(__dirname, 'qr-codes'), { recursive: true });
    const qrPath = path.join(__dirname, 'qr-codes', `${token}.png`);
    await QRCode.toFile(qrPath, reg.url, { width: 900, margin: 2, color: { dark: '#24425f', light: '#ffffff' } });
    console.log(`QR code: qr-codes/${token}.png  (print-ready)`);
  } catch {
    console.log('QR skipped — run "npm install" in this folder first, then re-run.');
  }
  console.log('\nLive immediately — no deploy needed.\n');
})().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
