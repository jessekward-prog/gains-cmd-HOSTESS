// Turns a Claude "bundled page" export into the plain HTML the splash really is. The export ships React, a runtime
// and full-size images, and shows its own "Unpacking..." screen while it starts. Already-flat files pass through.
//   node flatten-splash.mjs <in> [out]     images are only shrunk where ImageMagick is installed
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const [src, dst = src] = process.argv.slice(2);
const html = fs.readFileSync(src, 'utf8');
const part = (t) => { const m = html.match(new RegExp(`<script type="__bundler/${t}">([\\s\\S]*?)</script>`)); return m && JSON.parse(m[1]); };

const template = part('template');
let out = html;
if (template) {
  if (/\{\{|<sc-/.test(template)) throw new Error('flatten-splash: this export uses runtime templating, so it cannot be flattened to plain HTML');
  out = template.slice(template.indexOf('<x-dc>'), template.indexOf('</x-dc>'))
    .replace(/<\/?(x-dc|helmet)>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').trim() + '\n';
  for (const [id, { mime, data, compressed }] of Object.entries(part('manifest'))) {
    if (!out.includes(id)) continue;
    const raw = compressed ? gunzipSync(Buffer.from(data, 'base64')) : Buffer.from(data, 'base64');
    const r = mime.startsWith('image/') ? spawnSync('convert', ['-', '-strip', '-resize', '480x900>', '-quality', '40', 'webp:-'], { input: raw, maxBuffer: 1 << 26 }) : {};
    const webp = r.status === 0 && r.stdout.length < raw.length;
    out = out.replaceAll(id, `data:${webp ? 'image/webp' : mime};base64,${(webp ? r.stdout : raw).toString('base64')}`);
  }
}
if (/__bundler|<x-dc/.test(out)) throw new Error('flatten-splash: unrecognised export format');
fs.writeFileSync(dst, out);
