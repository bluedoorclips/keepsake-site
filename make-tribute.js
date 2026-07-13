/* Add a hidden tribute film to the site + generate its QR code.

   Usage:
     node make-tribute.js <path-to-video.mp4> "Full Name" "1948 — 2026" ["optional message"]

   What it does:
     1. Creates an unguessable token (the secret part of the link)
     2. Copies the video into private/  (never served directly)
     3. Registers it in tributes.json
     4. Writes the QR code PNG into qr-codes/  (print this for the family)

   Then deploy:  railway up --service bluedoorclips-site
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [, , videoPath, name, dates, message] = process.argv;
if (!videoPath || !name) {
  console.log('Usage: node make-tribute.js <video.mp4> "Full Name" "1948 — 2026" ["message"]');
  process.exit(1);
}
if (!fs.existsSync(videoPath)) {
  console.error(`Video not found: ${videoPath}`);
  process.exit(1);
}

const token = crypto.randomBytes(8).toString('hex');
const ext = path.extname(videoPath).toLowerCase() || '.mp4';

fs.mkdirSync(path.join(__dirname, 'private'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'qr-codes'), { recursive: true });

const dest = `private/${token}${ext}`;
fs.copyFileSync(videoPath, path.join(__dirname, dest));

const registryPath = path.join(__dirname, 'tributes.json');
const registry = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, 'utf8')) : {};
registry[token] = { name, dates: dates || '', message: message || '', video: dest };
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');

const url = `https://www.bluedoorclips.com/v/${token}`;
console.log(`\nTribute created for ${name}`);
console.log(`Link:    ${url}`);

(async () => {
  try {
    const QRCode = require('qrcode');
    const qrPath = path.join(__dirname, 'qr-codes', `${token}.png`);
    await QRCode.toFile(qrPath, url, { width: 900, margin: 2, color: { dark: '#24425f', light: '#ffffff' } });
    console.log(`QR code: qr-codes/${token}.png  (print-ready)`);
  } catch {
    console.log('QR skipped — run "npm install" in this folder first, then re-run.');
  }
  console.log('\nNow deploy:  railway up --service bluedoorclips-site\n');
})();
