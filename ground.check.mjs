// Self-check for the battle-ground scaffold — `node ground.check.mjs`.
// The ground modules import siblings by their unfolded names, so copy them into
// that shape first. Vite resolves extensionless imports; node does not, so the
// copies get a `.js` added on the way in.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'ground-'));
mkdirSync(join(root, 'areas'), { recursive: true });
for (const [flat, rel] of [
  ['camera', 'camera.js'], ['noise', 'noise.js'], ['blit', 'blit.js'],
  ['terrain', 'terrain.js'],
  ['areas__meadow', 'areas/meadow.js'],
  ['areas__calibration', 'areas/calibration.js'], ['areas__ridge', 'areas/ridge.js'],
  ['areas__darkwood', 'areas/darkwood.js'], ['areas__forest', 'areas/forest.js'],
  ['areas__dungeon', 'areas/dungeon.js'],
]) {
  const src = readFileSync(resolve(`src__quest__ground__${flat}.js`), 'utf8');
  writeFileSync(join(root, rel), src.replace(/from '(\.{1,2}\/[\w/]+)'/g, "from '$1.js'"));
}

const { toWorld, toScreen, ANCHORS } = await import(join(root, 'camera.js'));
const { blit, hexToRGB } = await import(join(root, 'blit.js'));
const calib = (await import(join(root, 'areas/calibration.js'))).default;

const W = 390, H = 340, HOR_ROW = 124;
const near = (a, b, e = 0.01) => Math.abs(a - b) < e;

// The camera must reproduce the handoff's published anchors, or every area
// renderer is drawing to a different perspective than the comps were tuned in.
assert.ok(near(ANCHORS.hero.z, 1.0) && near(ANCHORS.hero.xw, -0.717), 'hero anchor');
assert.ok(near(ANCHORS.monster.z, 6.333) && near(ANCHORS.monster.xw, 4.625), 'monster anchor');

// toScreen inverts toWorld exactly, or the calibration crosshairs miss the feet.
for (const [x, y] of [[86, 276], [306, 148], [290, 136]]) {
  const w = toWorld(x, y), s = toScreen(w.xw, w.z);
  assert.ok(near(s.x, x, 1e-9) && near(s.y, y, 1e-9), `round-trip (${x},${y})`);
}

// The bake has to be interruptible — a 150-300ms bake that doesn't yield blocks
// the frame it runs on.
const it = calib.bake({ boss: false });
let chunks = 0, r;
while (!(r = it.next()).done) chunks++;
const baked = r.value;
assert.ok(chunks > 20, `bake yielded only ${chunks} chunks`);
assert.equal(baked.L.length, W * H);

// cover:'ground' means transparent above the horizon, so the DOM backdrop shows.
assert.equal(baked.A[100 * W + 195], 0, 'row 100 transparent');
assert.equal(baked.A[200 * W + 195], 1, 'row 200 opaque');

// Crosshairs land on the real anchors, including the boss variant.
assert.ok(baked.L[276 * W + 86] > 0.5, 'hero crosshair');
assert.ok(baked.L[148 * W + 306] > 0.5, 'monster crosshair');
const bossIt = calib.bake({ boss: true });
let b; while (!(b = bossIt.next()).done);
assert.ok(b.value.L[136 * W + 290] > 0.5, 'boss crosshair');

// Alpha survives the blit, so the backdrop isn't painted over.
const img = { data: new Uint8ClampedArray(W * H * 4) };
blit(baked, hexToRGB('#ff9a3c'), img);
assert.equal(img.data[(100 * W + 195) * 4 + 3], 0, 'blit row 100 transparent');
assert.equal(img.data[(200 * W + 195) * 4 + 3], 255, 'blit row 200 opaque');
assert.equal(hexToRGB('#ff9a3c').join(), '255,154,60');

// The tick path reports dirty rows, so BattleGround can do a partial putImageData.
assert.deepEqual(calib.frame(baked, 1.0, new Float32Array(W * H)), [124, 125]);


// Every area renderer: bakes to a full buffer, stays interruptible, and respects
// its own cover flag. A renderer that forgets to yield blocks the frame it runs on.
const drain = (g) => { let r, n = 0; while (!(r = g.next()).done) n++; return [r.value, n]; };
for (const [file, id, cover] of [
  ['ridge', 'ridge', 'ground'], ['darkwood', 'darkwood', 'ground'],
  ['forest', 'forest', 'ground'], ['dungeon', 'dungeon', 'full'],
  ['meadow', 'meadow', 'ground'],
]) {
  const R = (await import(join(root, `areas/${file}.js`))).default;
  assert.equal(R.id, id);
  assert.equal(R.cover, cover, `${id} cover`);
  assert.equal(R.anim, null, `${id} must be static — animation fails the 16ms budget`);
  const [bk, n] = drain(R.bake({ boss: false }));
  assert.ok(n > 20, `${id} yielded only ${n} chunks`);
  assert.equal(bk.L.length, W * H, `${id} buffer size`);

  // Ground must actually be drawn, not left at zero.
  let lit = 0;
  for (let i = (H - 40) * W; i < H * W; i++) if (bk.L[i] > 0.01) lit++;
  assert.ok(lit > W * 20, `${id} near ground is blank (${lit} lit px)`);

  if (cover === 'full') {
    assert.equal(bk.A[60 * W + 195], 1, `${id} must be opaque above the horizon`);
    // the flames are baked, not left to the frame loop that this static build never runs
    let bright = 0;
    for (let y = 70; y < 105; y++) for (let x = 120; x < 136; x++) if (bk.L[y * W + x] > 0.8) bright++;
    assert.ok(bright > 0, 'dungeon torch flame missing — torchlight with no torches');
  } else {
    assert.equal(bk.A[60 * W + 195], 0, `${id} must let the backdrop through above the horizon`);
  }
}

// The Dark Wood's pines are the one thing drawn above the horizon on an
// otherwise transparent canvas.
const dw = (await import(join(root, 'areas/darkwood.js'))).default;
const [dwb] = drain(dw.bake({ boss: false }));
let pine = 0;
for (let y = 20; y < HOR_ROW; y++) for (let x = 0; x < W; x++) if (dwb.A[y * W + x]) pine++;
assert.ok(pine > 200, `dark wood pines not drawn above the horizon (${pine} px)`);

console.log('ground.check.mjs — all passed');
