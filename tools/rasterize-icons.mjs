import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const targets = [
  { svg: 'icons/icon.svg', out192: 'icons/icon-192.png', out512: 'icons/icon-512.png' },
];

for (const t of targets) {
  const svgPath = path.join(root, t.svg);
  if (!fs.existsSync(svgPath)) {
    console.warn('Skip (missing):', t.svg);
    continue;
  }
  const buf = fs.readFileSync(svgPath);
  await sharp(buf)
    .resize(192, 192, { fit: 'fill' })
    .png()
    .toFile(path.join(root, t.out192));
  await sharp(buf)
    .resize(512, 512, { fit: 'fill' })
    .png()
    .toFile(path.join(root, t.out512));
  console.log('Wrote', t.out192, t.out512);
}
