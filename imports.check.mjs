// Pre-build guard. Run: node imports.check.mjs
// Catches, in seconds and with a file:line, the failures that otherwise surface as a 90s Docker build
// error inside Hostess:
//   1. a relative import in a flattened src__* file that doesn't resolve once setup.sh unflattens it
//   2. a bare import that isn't in the frontend package.json embedded in setup.sh
//   3. a Dockerfile COPY source that doesn't exist, or a server require() the final image won't contain
//   4. app.yaml pointing at an icon that doesn't exist
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const root = path.dirname(new URL(import.meta.url).pathname);
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// ── mirror of setup.sh's flattening: src__a__b.js -> frontend/src/a/b.js
const flat = fs.readdirSync(root).filter((f) => fs.statSync(path.join(root, f)).isFile());
const virtual = new Map(); // frontend-relative path -> repo file it came from
for (const f of flat) {
  if (f.startsWith('src__')) virtual.set(f.replace(/__/g, '/'), f);
}
if (flat.includes('vite.config.js')) virtual.set('vite.config.js', 'vite.config.js');
if (flat.includes('frontend.index.html')) virtual.set('index.html', 'frontend.index.html');
if (flat.includes('frontend.public__boot-splash.html')) virtual.set('public/boot-splash.html', 'frontend.public__boot-splash.html');

// ── declared frontend dependencies (heredoc package.json inside setup.sh)
const setup = read('setup.sh');
const pkgBlock = setup.match(/frontend\/package\.json << 'EOF'\n([\s\S]*?)\nEOF/);
let declared = new Set();
if (!pkgBlock) fail('setup.sh', 'could not find the frontend package.json heredoc');
else {
  const pkg = JSON.parse(pkgBlock[1]);
  declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
}

const EXT = ['', '.js', '.jsx', '.mjs', '.json', '.css'];
const resolves = (from, spec) => {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec.replace(/[?#].*$/, '')));
  return EXT.some((e) => virtual.has(base + e)) || EXT.some((e) => virtual.has(`${base}/index${e}`));
};

const IMPORT_RE = /(?:^|[;\s}])(?:import|export)\s*(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
for (const [vpath, file] of virtual) {
  if (!/\.(jsx?|mjs)$/.test(vpath)) continue;
  const src = read(file);
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2];
    const line = src.slice(0, m.index).split('\n').length + (m[0].startsWith('\n') ? 1 : 0);
    const where = `${file}:${line}`;
    if (spec.startsWith('.')) {
      if (!resolves(vpath, spec)) fail(where, `"${spec}" does not resolve from ${vpath} (setup.sh places this file there). Wrong ../ depth, or the target file was never copied.`);
    } else if (!spec.startsWith('node:') && !spec.startsWith('/') && !spec.startsWith('virtual:')) {
      const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!declared.has(pkgName) && !builtinModules.includes(pkgName)) fail(where, `bare import "${spec}" is not in the frontend package.json inside setup.sh`);
    }
  }
}

// ── Dockerfile: COPY sources exist; server-side require()s are present in the final image
const docker = read('Dockerfile');
const stages = docker.split(/^FROM /m).slice(1);
const finalStage = stages[stages.length - 1];
const copied = new Set();
for (const line of finalStage.split('\n')) {
  const m = line.match(/^COPY\s+(?!--from)(.+)\s+\S+\s*$/);
  if (!m) continue;
  for (const srcPath of m[1].trim().split(/\s+/)) {
    const exists = srcPath.includes('*')
      ? fs.readdirSync(root).some((n) => new RegExp(`^${srcPath.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(n))
      : fs.existsSync(path.join(root, srcPath));
    if (!exists) fail('Dockerfile', `COPY source "${srcPath}" does not exist in the repo`);
    copied.add(srcPath.replace(/\/$/, ''));
  }
}
const inImage = (rel) => [...copied].some((c) => rel === c || rel.startsWith(`${c}/`));
const serverFiles = [...copied].filter((c) => /\.(c?js|mjs)$/.test(c) && fs.existsSync(path.join(root, c)));
const walkJs = (p) => (fs.statSync(path.join(root, p)).isDirectory()
  ? fs.readdirSync(path.join(root, p)).flatMap((n) => walkJs(path.posix.join(p, n)))
  : /\.(c?js|mjs)$/.test(p) ? [p] : []);
const runtimeFiles = [...new Set(serverFiles.concat([...copied].filter((c) => fs.existsSync(path.join(root, c)) && fs.statSync(path.join(root, c)).isDirectory()).flatMap(walkJs)))];
for (const f of runtimeFiles) {
  const src = read(f);
  for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)|from\s+['"](\.[^'"]+)['"]/g)) {
    const spec = m[1] || m[2];
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
    const hit = ['', '.js', '.json', '.cjs', '.mjs', '/index.js'].map((e) => target + e).find((t) => fs.existsSync(path.join(root, t)));
    if (!hit) fail(`${f}`, `require("${spec}") does not exist in the repo`);
    else if (!inImage(hit)) fail(`${f}`, `require("${spec}") -> ${hit} is not COPYed into the final image (Dockerfile)`);
  }
}

// ── app.yaml icon
const yaml = read('app.yaml');
const icon = yaml.match(/^icon:\s*(\S+)/m);
if (icon && !fs.existsSync(path.join(root, icon[1]))) fail('app.yaml', `icon "${icon[1]}" does not exist`);

if (errors.length) {
  console.error(`imports.check: ${errors.length} problem(s)\n` + errors.map((e) => `  ✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`imports.check: ok (${virtual.size} frontend files, ${copied.size} COPY sources)`);
