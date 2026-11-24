// Hero-card borders as pixel art: a W×H grid of cells laid over the card, with MARGIN
// cells round it for horns, wings and spires. A border is a pattern along the four
// edges plus small sprites at the corners, crest and base; the dark outline is added
// for you. At most a gem glint or an ember flicker moves. No React, no assets.
export const W = 100, H = 140, MARGIN = 12;
const { sin, abs, floor, max, min, round } = Math;
const rnd = (i, s = 0) => { const v = sin(i * 127.1 + s * 311.7 + 1.3) * 43758.5453; return v - floor(v); };
const mod = (x, n) => ((x % n) + n) % n;

// Five-tone ramps, dark to light, the way the game's sprites are shaded.
const R = {
  oak: ['#2a1608', '#4a2a12', '#6f4420', '#95632f', '#bd8848'], pine: ['#33200e', '#5a3c1a', '#86602c', '#ad8444', '#d6b06c'], brick: ['#3a100c', '#611e16', '#8a3324', '#ad4c36', '#cf7454'],
  stone: ['#1c1e22', '#34383f', '#51575f', '#747b84', '#9ea6ae'], slate: ['#12161e', '#222a38', '#384456', '#566678', '#8092a4'], sand: ['#4a3618', '#74582c', '#a38148', '#c9a86a', '#ead29c'],
  iron: ['#16181c', '#30353c', '#555c66', '#848c97', '#bcc4ce'], steel: ['#1c2430', '#3a4a5e', '#64788e', '#9aaec2', '#dceaf4'], silver: ['#2a2e36', '#5a626e', '#8e97a4', '#c2cad4', '#ffffff'],
  gold: ['#4a2606', '#8a4f0c', '#c98a1c', '#f2bd3a', '#fff0a0'], brass: ['#33240c', '#5e4418', '#93702c', '#c49c48', '#ecd084'], copper: ['#3a160a', '#6e2e14', '#a34e26', '#cf7a44', '#f2b07c'], bronze: ['#2a1a0c', '#523418', '#7e562a', '#ab7e44', '#d8b074'],
  rust: ['#2a120a', '#54240f', '#83401a', '#ad6228', '#c98c50'], bone: ['#3a3020', '#73664a', '#a8996f', '#d6c99c', '#f6eeca'], leather: ['#241008', '#42210f', '#66381c', '#8a5430', '#b07a4c'],
  moss: ['#10200c', '#234016', '#3c6422', '#5f8f34', '#93c250'], leaf: ['#0c2a14', '#16502a', '#24803c', '#48b252', '#96e070'], jade: ['#06281e', '#0e4e3a', '#1a7c5a', '#3cb084', '#96e6bc'], venom: ['#0c2208', '#1a4a10', '#2f8a1c', '#5ed02e', '#c6ff7a'],
  ice: ['#0c2840', '#1a5078', '#3486b4', '#78c6e6', '#e4faff'], sea: ['#04202e', '#0a3e54', '#14687e', '#2e9cae', '#86dcdc'], cobalt: ['#080e3a', '#12206e', '#2038b4', '#4a70ee', '#a8c4ff'],
  blood: ['#24040a', '#4e0a12', '#861418', '#c42a22', '#ff6a4a'], ember: ['#2a0804', '#6a1608', '#b8320c', '#f07018', '#ffc850'], rose: ['#3a0a20', '#701638', '#b02a5a', '#e45a88', '#ffaac4'],
  violet: ['#180a34', '#341462', '#5c28a0', '#9254dc', '#d0a4ff'], void: ['#06040e', '#100a22', '#221440', '#422868', '#7a4cae'], magenta: ['#2c0430', '#5e0c5e', '#a01c92', '#e046c4', '#ff9cec'],
  ink: ['#050507', '#0e0e14', '#1a1a24', '#2a2a38', '#44445a'], paper: ['#5a5040', '#8e8268', '#bcae8c', '#e0d4b2', '#fbf4da'], neon: ['#04141c', '#06343e', '#0a6a70', '#18c0b4', '#8cfff0'],
};
const EXTRA = { k: '#0a0608', w: '#fff8e8', r: '#d8281a', o: '#ff7a1a', y: '#ffd04a', g: '#4fcf3a', G: '#1f6a2c', u: '#4aa8ff', U: '#1c4aa8', v: '#a45cff', V: '#4a1c8a', m: '#ff5ea8', t: '#2adfd0', s: '#c9ced6', K: '#1c1218' };
const OUT = '#0a0608';

// Sprites. '0-4' = ramp A, 'a-e' = ramp B, letters above = fixed colours. A leading
// '|' mirrors the rows about their last column.
const S = {
  crown: '|3......4/4.....34/43...344/434.3443/34434343/33343434/2r33u332/1222r221/33333333',
  skull: '|..333/.3444/34444/3kk44/3kk4k/2344k/.2333/..3k3/..2k2', bigskull: '|....3333/..334444/.3344444/.3444444/33444444/33kkk444/33kkkk44/23kkk34k/.233344k/..223333/...2k3k3/...2k3k3/....2222',
  gem: '|.ddd/dedc/ccdc/.ccb/..bb/...a', gemb: '|..dd/.dee/ddec/dcdc/ccdb/.ccb/..bb/...a', stud: '|.33/344/343/.22', ring: '|.33/3.k/3kk/.22', rivet: '34/23',
  rose: '|..dd/.ded/ddec/dcdd/cdcb/.ccb/..bG/.gGG', leaf: '..33/.344/3443/342./32..', flame: '|...r/..ro/..ro/.roo/.roy/rooy/royw/royw/.ooy', flame2: '|...../..r.o/...ro/..roo/.rroy/.rooy/royyw/.royw/..ooy',
  snow: '|...4/.4.4/..44/4.43/.443/4434/.443/4.43/..44/.4.4/...4', bolt: '...44/..44./.444./44444/..44./.44../.4.../4....', star: '|....4/....4/...44/444443/.44433/..4433/..4333/.44.33/.4...3', sun: '|....4/.4..4/..4.4/...44/4.4444/..4433/4.4433/...44/..4.4/.4..4/....4',
  moon: '..444./.443../443.../443.../443.../.443../..4443', eye: '|..333/.3www/3wwdc/3wwck/3wwdc/.3www/..333', heart: '|.rr./rmrr/rrrr/rrrr/.rrr/..rr/...r', sword: '|...4/...4/..34/..34/..34/..34/..34/..34/..34/..34/..34/..34/ccddd/..cb/..cb/..cb/..dd',
  shield: '|33333/34444/34dd4/34ddd/34dde/23dde/23ddd/.23dd/..234/...23', anvil: '|333334/.22344/...233/....23/....23/...2233/..222333', plate: '|..222/.2333/23rrr/23rrk/23rkk/23rrk/23rrr/.2333/..222', key: '|.44/4.k/4.k/.44/..3/..3/..3/.33/..3/.33', coin: '|.33/344/3y4/344/.33', bones: '34..../443.../.333../..333./...344/....43',
  mush: '|..rrr/.rwrr/rrrrw/rwrrr/kkwww/..kww/...ww/...ww', crystal: '|...e/..de/..dd/.ddc/.cdc/.cdc/bcdc/bccb', spire: '|...4/..34/..34/..33/.333/.332/.232/2232', candle: '|..y/..o/.oy/..k/.ww/.ws/.ws/.ws/22s', gear: '|...33/.3.34/..344/33444/34.kk/3444k/34.kk/33444/..344/.3.34/...33', anchor: '|..44/..4k/..44/...4/.444/...4/...4/4..4/44.4/.444/..44',
  fang: '|34/34/.4/.4', claw: '44333../.44333./..4433./...443./....443/.....44/......4', horn: '2......./32....../43....../432...../4432..../.44332../..444333/...44333/....2233', thorn: '..4/.43/433/33.', tower: '|3.33.3/333333/222222/.22332/.2kk32/.2kk32/.22332/.22222/.22322/.22222', banner: '|rrrr/rrrr/ryyr/ryry/rrrr/rrrr/rr.r/r...',
  joy: '|..rrr/..rmr/..rrr/....s/....s/..222/.2333/233333', note: '..444/..4.4/..4.4/..4.4/.44.4/44444/44.44', rune1: '4..4/44.4/4.44/4..4/4..4', rune2: '.4../44../.44./..44/..4.', rune3: '4.4/444/.4./444/4.4', hammer: '|33344/34444/22233/...c/...c/...c/...c/...d', chal: '|33333/34444/.3444/..344/...34/...33/...33/..333/.33344', drop: '|..e/.dd/.dd/ddc/dcc/.cb', book: '|2222/3www/3wsw/3www/3wsw/3www/2222', bell: '|...3/..33/.333/.344/.344/3344/3333/...2', torii: '|4.....4/4444444/.222222/..2...2/..22222/..2..../..2..../..2....',
  bat: '|....k.K/kk..kKK/KKkkKKr/KKKKKKK/K.KKKKK/..K.KKK/......K', web: '44444444/4.4..4.4/44.4.4../4..44.../4.444.../44...../4......./4.......',
};
// Heads from the game's own monsters (0x72 DungeonTileset II, CC0).
const M = {"demon":{"p":["#222222","#da4e38","#9f294e","#fdf7ed"],"r":"............0........../.........0.0....0....../........00.0.0.0......./...000..00000000......./....0000011221120..00../...00000011331130000.../00000202011331130200.../.0020112011001100120.0./..02111120000000211000./.00022111222222211100../.0022111111111111110.../00002010101010101000.../..000000030303030300.../....000000030003000..../.....0000000000000...../.....0000000000000....."},"ogre":{"p":["#222222","#314152","#3d734f","#62232f","#fdf7ed","#8f4029"],"r":"....................../........0000000000..../.......012222222220.../.......012222222220.../.......012222222220.../...0.00012111111110.../....003012200222200.../.0.01030122002222000../..010030124112222140../.0012030104422222440../..012030114400000440../.0011030011222222220../..012035011111111100../..011035000000000010.."},"imp":{"p":["#222222","#5f2d56","#da4e38","#fdf7ed","#62232f"],"r":"...00...00/..010..010/0001000010/0201022010/022222220./022332230./022332230./022442240./022222220./011000110./0010.0010./.000..000."},"goblin":{"p":["#222222","#314152","#3d734f","#fdf7ed"],"r":"000000000./012222220./012222220./012002200./0120022000/0131122130/0133222330/011000110./0010.0010./.000..000."},"bones":{"p":["#222222","#d3bfa9","#fdf7ed"],"r":"0000000000/0122222220/0122222220/0120022200/0120022200/0121120210/0122222220/0122222220/0000110000/...0220.../..002200../.00222200./.01000010./.000..000."}};

// Edge patterns: (u along from the middle, v depth 0..T-1, lit side?, T, frame, side) → a colour key.
const bev = (v, l, T) => (v === 0 ? (l ? '4' : '3') : v === T - 1 ? (l ? '1' : '0') : v === 1 ? (l ? '3' : '2') : l ? '2' : '1');
const E = {
  bev: (u, v, l, T) => bev(v, l, T), flat: (u, v, l, T) => (v === 0 ? '4' : v === T - 1 ? '1' : '3'),
  plank: (u, v, l, T) => (mod(u, 23) === 0 ? '0' : rnd(floor(u / 23) * 9 + v, 3) > 0.45 && mod(u + v * 5, 9) < 4 ? '1' : bev(v, l, T) === '0' ? '1' : v === 0 ? '4' : rnd(floor(u / 23)) > 0.5 ? '3' : '2'),
  brick: (u, v, l, T) => { const row = floor(v / 3), c = mod(u + row * 4, 9); return v % 3 === 2 || c === 0 ? 'b' : v % 3 === 0 ? (rnd(floor((u + row * 4) / 9), row) > 0.5 ? '4' : '3') : rnd(floor((u + row * 4) / 9), row) > 0.6 ? '3' : '2'; },
  cobble: (u, v, l, T) => { const c = mod(u + (v > 2 ? 3 : 0), 7), n = floor((u + (v > 2 ? 3 : 0)) / 7), q = v > 2 ? v - 3 : v; return c === 0 || (v > 2 && q === 0 && T > 5) ? '0' : q === 0 || c === 1 ? (rnd(n, v > 2) > 0.5 ? '4' : '3') : c === 6 ? '1' : rnd(n, 5) > 0.5 ? '3' : '2'; },
  rope: (u, v, l, T) => { const k = mod(u + v * 2, 8); return k === 0 ? '0' : k < 3 ? '2' : k < 6 ? '4' : '3'; },
  rivets: (u, v, l, T) => (mod(u, 12) === 0 && v === 2 ? '4' : mod(u, 12) === 1 && v === 2 ? '3' : mod(u, 12) < 2 && v === 3 ? '0' : mod(u + 6, 36) === 0 ? '0' : bev(v, l, T)),
  stitch: (u, v, l, T) => (v === 1 || v === T - 2 ? (mod(u, 5) < 3 ? 'e' : '1') : rnd(u, v) > 0.85 ? '1' : v === 0 ? '4' : '2'),
  chain: (u, v, l, T) => { const c = mod(u, 10); if (c < 6) return v === 0 || v === T - 1 ? (c > 0 && c < 5 ? (v ? '2' : '4') : '') : c === 0 || c === 5 ? '3' : 'k'; return v === 2 ? '4' : v === 1 || v === 3 ? '2' : ''; },
  knurl: (u, v, l, T) => (v === 0 ? '4' : v === T - 1 ? '0' : mod(u + v, 3) === 0 ? '1' : mod(u - v, 3) === 0 ? '4' : '3'),
  bamboo: (u, v, l, T) => { const c = mod(u, 14); return c === 0 ? '0' : c === 1 || c === 13 ? (v === 0 ? '4' : '2') : v === 0 ? '3' : v === 1 ? '4' : v === T - 1 ? '1' : '2'; },
  rust: (u, v, l, T) => { const n = rnd(floor(u / 2), floor(v / 2) + 7); return n > 0.82 ? 'c' : n > 0.7 ? 'b' : n < 0.12 ? '0' : bev(v, l, T); },
  moss: (u, v, l, T) => { const g = sin(u * 0.21) + sin(u * 0.087 + 2); return g > 0.35 && v < 1 + (g > 1 ? 3 : 2) ? (rnd(u, v) > 0.55 ? 'e' : rnd(u, v) > 0.25 ? 'd' : 'c') : E.cobble(u, v, l, T); },
  wrap: (u, v, l, T) => { const k = mod(u + v, 9); return k === 0 ? '1' : k === 1 ? '2' : v === T - 1 ? '2' : rnd(u, v) > 0.8 ? '3' : '4'; },
  film: (u, v, l, T) => (mod(u, 7) < 4 && v > 0 && v < T - 1 ? 'w' : v === 0 ? '3' : '1'), barb: (u, v, l, T) => { const c = mod(u, 11); if (v === 2) return mod(u, 4) < 2 ? '4' : '2'; if (c === 5 && (v === 0 || v === 4)) return '4'; if ((c === 4 && v === 1) || (c === 6 && v === 3)) return '3'; if ((c === 6 && v === 1) || (c === 4 && v === 3)) return '3'; return ''; },
  check: (u, v, l, T) => (v === 0 || v === T - 1 ? (v ? '1' : '4') : mod(floor(u / 3) + floor((v - 1) / 2), 2) ? 'd' : '1'), hazard: (u, v, l, T) => (v === 0 ? '4' : v === T - 1 ? '0' : mod(u + v, 10) < 5 ? 'y' : 'K'),
  vine: (u, v, l, T) => { const y = 2 + round(sin(u * 0.28) * 1.6), y2 = 2 - round(sin(u * 0.28) * 1.6); return v === y ? 'd' : v === y2 ? 'c' : abs(v - y) === 1 && mod(u, 11) < 3 ? 'e' : v === 0 ? '3' : v === T - 1 ? '0' : '1'; },
  frost: (u, v, l, T) => (rnd(floor(u / 2), v) > 0.82 ? '4' : mod(u - v * 2, 13) < 2 ? '4' : bev(v, l, T)), circuit: (u, v, l, T, f) => { const c = mod(u, 18); return c < 7 && v > 0 && v < T - 1 ? (c === 0 || c === 6 ? 's' : c === 2 && v === 2 ? 'w' : 'K') : v === 2 ? (mod(u - f, 18) === 12 ? 'w' : 'e') : mod(u, 9) === 8 && v > 2 ? 'd' : v === 0 ? '3' : v === T - 1 ? '0' : '1'; },
  bulbs: (u, v, l, T, f) => { const c = mod(u, 8), on = mod(floor(u / 8) + f, 2); return c > 1 && c < 5 && v > 0 && v < 4 ? (c === 3 || v === 2 ? (on ? (c === 3 && v === 2 ? 'w' : 'y') : 'c') : on ? 'o' : 'b') : v === 0 ? '4' : v === T - 1 ? '0' : '2'; },
  keys: (u, v, l, T) => { const p = ['11111111', '1ddddd1d', '1d111d1d', '1d1ddd1d', '1d11111d', '1ddddddd', '11111111']; return v === 0 ? '4' : v === T - 1 ? '0' : (p[min(6, v)] || '11111111')[mod(u, 8)]; },
  scale: (u, v, l, T) => { const row = floor(v / 2), c = mod(u + row * 3, 6); return v % 2 === 0 ? (c === 0 ? '0' : c < 3 ? '4' : '3') : c === 0 || c === 5 ? '0' : c === 1 || c === 4 ? '1' : '2'; },
  bonerow: (u, v, l, T) => { const c = mod(u, 16); return c === 0 ? '' : c < 4 || c > 12 ? (v === 2 ? '3' : v === 0 || v === 4 ? (c === 1 || c === 15 ? '' : '3') : '4') : v === 2 ? '4' : v === 1 ? '3' : v === 3 ? '1' : ''; },
  wave: (u, v, l, T, f) => { const y = round(1.6 + sin((u + f) * 0.35) * 1.3); return v < y ? (v === y - 1 ? '4' : '3') : v === y ? 'w' : v === T - 1 ? '0' : mod(u + v * 3, 7) === 0 ? '3' : '1'; },
  tracks: (u, v, l, T) => (v === 1 || v === T - 2 ? 's' : mod(u, 6) < 3 ? '2' : 'K'), eq: (u, v, l, T, f) => { const c = floor(u / 3), n = 1 + floor(abs(sin(c * 1.7 + f * 0.9)) * 4.9); return mod(u, 3) === 2 ? 'K' : T - 1 - v < n ? (T - 1 - v > 3 ? 'm' : T - 1 - v > 1 ? 'v' : 'u') : 'K'; },
  blocks: (u, v, l, T) => { const c = mod(u, 6), n = mod(floor(u / 6), 4), k = ['r', 'y', 'g', 'u'][n]; return c === 5 || v === T - 1 ? 'K' : v === 0 || c === 0 ? 'w' : k; },
  magma: (u, v, l, T, f) => { const n = sin(u * 0.33 + v) + sin(u * 0.13 - v * 1.1 + 1); return abs(n) < 0.28 ? (mod(u + f * 3, 23) < 8 ? 'y' : 'o') : abs(n) < 0.5 ? 'r' : n > 0.9 ? '3' : '1'; },
  ooze: (u, v, l, T) => { const n = sin(u * 0.27) + sin(u * 0.11 + v); return v === 0 ? '4' : n > 1 && v < 3 ? 'w' : n > 0.4 ? '3' : n < -1 ? '1' : '2'; },
  runes: (u, v, l, T, f) => { const g = ['10010', '11110', '01101', '01010'], c = mod(u, 8), n = mod(floor(u / 8), 4), on = mod(floor(u / 8) - f, 7) === 0; return c < 5 && v > 0 && v < 5 && rnd(n * 25 + c * 5 + v, 2) > 0.52 ? (on ? 'w' : 'd') : v === 0 ? '3' : v === T - 1 ? '0' : '1'; },
  facet: (u, v, l, T) => { const c = mod(u, 10), m = abs(c - 5); return m + v < 4 ? '4' : m + (T - 1 - v) < 3 ? '1' : c < 5 ? '3' : '2'; },
  braid: (u, v, l, T) => { const y = 2 + round(sin(u * 0.42) * 1.7), y2 = 2 - round(sin(u * 0.42) * 1.7), o = mod(u * 0.42, 6.28) < 3.14; return v === y && (o || y !== y2) ? '4' : v === y2 ? 'd' : abs(v - y) === 1 && v > 0 ? '2' : v === 0 ? '3' : '0'; },
  tile: (u, v, l, T) => { const c = mod(u, 7) - 3; return v === 0 ? '4' : v === T - 1 ? '0' : abs(c) + abs(v - 2) === 2 ? 'd' : abs(c) + abs(v - 2) < 2 ? 'e' : '1'; },
  stars: (u, v, l, T, f) => { const n = rnd(u, v + 11); return n > 0.93 ? (mod(floor(n * 900) + f, 5) ? 'w' : 'd') : n > 0.86 ? 'd' : v === 0 ? '4' : v === T - 1 ? '0' : n > 0.4 ? '1' : '2'; },
  grid: (u, v, l, T, f) => (v === 0 ? 'e' : v === T - 1 ? 'd' : mod(u + f, 8) === 0 ? 'e' : v === 2 ? 'b' : '0'), feather: (u, v, l, T) => { const c = mod(u + v, 6); return c === 0 ? '1' : v === 0 ? '4' : c === 3 ? '2' : c < 3 ? '4' : '3'; },
  holo: (u, v, l, T, f) => (v === 0 ? 'w' : v === T - 1 ? 'K' : ['m', 'o', 'y', 'g', 't', 'u', 'v'][mod(floor((u + v * 2 + f * 2) / 7), 7)]), bark: (u, v, l, T) => { const n = rnd(floor(u / 5), v); return mod(u + floor(v * 2.6), 11) === 0 ? '0' : n > 0.75 ? '4' : n > 0.4 ? '3' : n > 0.15 ? '2' : '1'; },
  ray: (u, v, l, T) => (mod(u, 6) < 3 ? (v === 0 ? 'w' : '4') : v === T - 1 ? '0' : '2'), crenel: (u, v, l, T, f, s) => (s === 0 && v < 2 && mod(u, 10) > 5 ? '' : E.brickA(u, v, l, T)), brickA: (u, v, l, T) => { const row = floor(v / 2), c = mod(u + row * 4, 8); return c === 0 ? '0' : v % 2 === 0 ? '4' : '2'; },
  blade: (u, v, l, T) => (v === 0 ? '4' : v === 1 ? '3' : v === 2 ? (mod(u, 18) < 9 ? 'd' : 'c') : v === 3 ? '2' : '0'), pearls: (u, v, l, T) => { const c = mod(u, 6); return c < 4 && v > 0 && v < 5 && !((c === 0 || c === 3) && (v === 1 || v === 4)) ? (c === 1 && v === 1 ? 'w' : c === 1 || v === 2 ? 'e' : 'd') : v === 0 ? '3' : '0'; },
};

// key: [name, rarity, { A, B: ramps, e: edge, T: thickness, c: corner sprite, up: keep corners upright,
//   top, bot: crest and base, side: left/right ornament, over: how far a crest sits outside, x: extra }]
const B = {
  oak: ['Oak', 0, { A: 'oak', e: 'plank', c: 'rivet' }], pine: ['Crate', 0, { A: 'pine', B: 'iron', e: 'plank', x: 'braces' }], brick: ['Brickwork', 0, { A: 'brick', B: 'paper', e: 'brick' }], rope: ['Rope', 0, { A: 'sand', e: 'rope', c: 'knot' }],
  rivet: ['Riveted', 0, { A: 'iron', e: 'rivets', c: 'stud' }], stitch: ['Saddle Stitch', 0, { A: 'leather', B: 'sand', e: 'stitch' }], barbell: ['Loaded Bar', 0, { A: 'steel', e: 'knurl', c: 'plate', in: 1 }], bamboo: ['Bamboo', 0, { A: 'moss', e: 'bamboo', c: 'leaf', out: 1 }],
  rust: ['Rustbucket', 0, { A: 'rust', B: 'iron', e: 'rust' }], cobble: ['Cobblestone', 0, { A: 'stone', e: 'cobble', T: 6 }], moss: ['Mossback', 0, { A: 'stone', B: 'moss', e: 'moss', T: 6 }], tape: ['Wrist Tape', 0, { A: 'paper', e: 'wrap' }], film: ['Film Strip', 0, { A: 'ink', e: 'film' }], wire: ['Barbed Wire', 0, { A: 'iron', e: 'barb' }],
  ivy: ['Ivy', 1, { A: 'bronze', B: 'leaf', e: 'vine', c: 'leaf', out: 1, top: 'rose', B2: 'rose' }], hoar: ['Hoarfrost', 1, { A: 'ice', e: 'frost', c: 'snow', in: 0, x: 'icicles' }], circuit: ['Circuit', 1, { A: 'jade', B: 'venom', e: 'circuit', fps: 6 }], marquee: ['Marquee', 1, { A: 'blood', B: 'copper', e: 'bulbs', T: 5, top: 'star', tA: 'gold', fps: 2 }],
  gears: ['Clockwork', 1, { A: 'brass', e: 'rivets', c: 'gear' }], candle: ['Candlelit', 1, { A: 'oak', e: 'bev', tops: 'candle', tA: 'brass' }], dive: ['Tide', 1, { A: 'sea', e: 'wave', T: 6, bot: 'anchor', tA: 'steel', fps: 4 }], rail: ['Rail Line', 1, { A: 'oak', e: 'tracks', T: 6 }], ossuary: ['Ossuary', 1, { A: 'bone', e: 'bonerow', c: 'skull', up: 1 }],
  equal: ['Equaliser', 1, { A: 'ink', e: 'eq', T: 6, c: 'note', tA: 'magenta', up: 1, fps: 5 }], blocks: ['Building Blocks', 1, { A: 'ink', e: 'blocks' }], check: ['Finish Line', 1, { A: 'ink', B: 'paper', e: 'check', T: 6, bot: 'coin', tA: 'gold' }], hazard: ['Hazard', 1, { A: 'iron', e: 'hazard', c: 'stud' }], rosewood: ['Thorn Rose', 1, { A: 'leaf', B: 'rose', e: 'bark', c: 'rose', up: 1, x: 'thorns' }],
  magma: ['Magma', 2, { A: 'ink', e: 'magma', T: 6, c: 'flame', up: 1, outUp: 5, fps: 4 }], ooze: ['Ooze', 2, { A: 'venom', e: 'ooze', T: 6, x: 'drips' }], rune: ['Runebound', 2, { A: 'slate', B: 'ice', e: 'runes', T: 7, c: 'gem', cB: 'ice', up: 1, fps: 3 }], geode: ['Geode', 2, { A: 'violet', B: 'magenta', e: 'facet', T: 6, x: 'crystals' }],
  shogun: ['Shogun', 2, { A: 'blood', B: 'gold', e: 'keys', T: 7, top: 'torii', tA: 'ember', c: 'stud', cA: 'gold' }], sapphire: ['Sapphire Guard', 2, { A: 'cobalt', B: 'steel', e: 'tile', T: 5, c: 'shield', cA: 'steel', cB: 'cobalt', up: 1, glint: 1 }], crypt: ['Crypt', 2, { A: 'stone', B: 'moss', e: 'moss', T: 6, mon: 'bones', c: 'skull', cA: 'bone', up: 1 }], ogre: ['Ogre Cellar', 2, { A: 'pine', B: 'iron', e: 'plank', T: 6, mon: 'ogre', c: 'coin', cA: 'gold' }],
  witch: ['Hexwood', 2, { A: 'void', B: 'venom', e: 'bark', T: 6, c: 'mush', up: 1, top: 'moon', tA: 'gold', mid: 1 }], smith: ['Smithy', 2, { A: 'iron', B: 'ember', e: 'rivets', T: 6, top: 'anvil', bot: 'hammer', tA: 'steel', tB: 'oak', c: 'flame', up: 1, fps: 4 }], arcade: ['Arcade', 2, { A: 'ink', B: 'magenta', e: 'grid', T: 5, top: 'joy', tA: 'steel', c: 'heart', up: 1, fps: 8 }], scroll: ['Spellbook', 2, { A: 'leather', B: 'gold', e: 'braid', T: 6, top: 'book', c: 'gem', cB: 'violet', up: 1, glint: 1 }],
  king: ['Kingsguard', 3, { A: 'gold', B: 'blood', e: 'tile', T: 6, top: 'crown', over: 7, c: 'gemb', cB: 'blood', up: 1, side: 'gemb', sB: 'blood', bot: 'shield', tB: 'blood', glint: 1 }], demon: ['Demon Gate', 3, { A: 'blood', B: 'ember', e: 'scale', T: 6, mon: 'demon', c: 'horn', cA: 'bone', horn: 1, bots: 'flame', glint: 1, fps: 4 }], throne: ['Bone Throne', 3, { A: 'bone', e: 'bonerow', top: 'bigskull', over: 6, c: 'skull', up: 1, side: 'skull', bot: 'bones', x: 'spikes', xA: 'bone', under: 'ink', T: 5 }],
  seraph: ['Seraph', 3, { A: 'silver', B: 'gold', e: 'feather', T: 6, x: 'wings', xA: 'silver', top: 'sun', tA: 'gold', over: 6, c: 'gem', cB: 'gold', up: 1, glint: 1 }], frost: ['Frost King', 3, { A: 'ice', e: 'facet', T: 6, x: 'spires', xA: 'ice', top: 'crown', tA: 'ice', over: 7, c: 'snow', cA: 'ice', glint: 1 }], keep: ['The Keep', 3, { A: 'stone', e: 'crenel', T: 7, c: 'tower', up: 1, topsOnly: 1, outUp: 8, outSide: 5, sideB: 'banner', bot: 'shield', tB: 'blood' }],
  hoard: ["Dragon's Hoard", 3, { A: 'leaf', B: 'gold', e: 'scale', T: 6, c: 'claw', cA: 'bone', x: 'ridge', xA: 'leaf', top: 'eye', tA: 'leaf', tB: 'gold', bots: 'coin', bA: 'gold', glint: 1 }], storm: ['Stormforged', 3, { A: 'steel', B: 'cobalt', e: 'blade', T: 5, c: 'bolt', cA: 'gold', top: 'hammer', tA: 'steel', tB: 'leather', over: 4, x: 'spikes', xA: 'steel', side: 'gemb', sB: 'cobalt', glint: 1 }], tree: ['World Tree', 3, { A: 'oak', B: 'leaf', e: 'bark', T: 6, x: 'canopy', xA: 'leaf', bot: 'gemb', tB: 'leaf', glint: 1 }],
  voidr: ['Void Relic', 3, { A: 'void', B: 'magenta', e: 'stars', T: 6, x: 'shards', xA: 'violet', top: 'eye', tA: 'violet', tB: 'magenta', over: 4, c: 'gemb', cB: 'magenta', up: 1, glint: 1, fps: 3 }], solar: ['Solar Disc', 3, { A: 'ember', B: 'gold', e: 'keys', T: 7, x: 'rays', xA: 'gold', top: 'sun', tA: 'gold', over: 5, c: 'gem', cB: 'ember', up: 1, glint: 1 }], vamp: ['Crimson Court', 3, { A: 'ink', B: 'blood', e: 'pearls', T: 6, top: 'crown', tA: 'blood', over: 6, c: 'rose', cB: 'blood', up: 1, bot: 'drop', tB: 'blood', x: 'ironwork', xA: 'iron', side: 'chal', sA: 'gold', glint: 1 }],
};
S.knot = '|..34/.344/3443/4432/3443/.344/..34';
export const FX = Object.fromEntries(Object.entries(B).map(([k, [name, rarity, o]]) => [k, { name, rarity, T: o.T || 5, fps: o.fps || (o.glint ? 4 : 0), base: R[o.A][1], glow: rarity < 2 ? 'transparent' : `${R[o.B && rarity === 3 ? o.B : o.A][3]}${rarity === 3 ? '73' : '4d'}`, o }]));

const GW = W + 2 * MARGIN, GH = H + 2 * MARGIN;
const cache = new Map();
/** Border `k` at frame `f`, as a GW×GH grid of colours (null = see through). */
export function grid(k, f = 0) {
  const fx = FX[k]; if (!fx) return null;
  const { o, T } = fx, g = new Array(GW * GH).fill(null);
  const at = (x, y) => (x + MARGIN) + (y + MARGIN) * GW, ok = (x, y) => x >= -MARGIN && y >= -MARGIN && x < W + MARGIN && y < H + MARGIN;
  const put = (x, y, c) => { if (ok(x, y)) g[at(x, y)] = c; };
  const col = (c, A, Bq) => (c >= '0' && c <= '4' ? R[A][+c] : c >= 'a' && c <= 'e' ? R[Bq][c.charCodeAt(0) - 97] : EXTRA[c] || null);
  const A = o.A, Bq = o.B || o.A;
  const rowsOf = (name) => { const s = S[name], m = s[0] === '|', r = (m ? s.slice(1) : s).split('/'); const w = max(...r.map((q) => q.length)); return r.map((q) => { const p = q.padEnd(w, '.'); return m ? p + [...p.slice(0, -1)].reverse().join('') : p; }); };
  const size = (name) => { const r = rowsOf(name); return [r[0].length, r.length]; };
  const spr = (name, x, y, a = A, b = Bq, fx_ = false, fy = false) => { const r = rowsOf(name), w = r[0].length; r.forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.') put(x + (fx_ ? w - 1 - i : i), y + (fy ? r.length - 1 - j : j), col(c, a, b)); })); };
  const CUT = [3, 2, 1], cut = (x, y) => { const cx = min(x, W - 1 - x), cy = min(y, H - 1 - y); return cy < 3 && cx < CUT[cy]; };
  // the frame
  const e = E[o.e];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = [y, W - 1 - x, H - 1 - y, x], v = min(...d); if (v >= T || cut(x, y)) continue;
    const s = d.indexOf(v), u = s % 2 ? y - H / 2 : x - W / 2, c = e(u, v, s === 0 || s === 3, T, f, s);
    if (c) put(x, y, col(c, A, Bq)); else if (o.under || o.e === 'barb' || o.e === 'chain' || o.e === 'bonerow') put(x, y, o.e === 'crenel' ? null : R[o.under || 'ink'][1]);
  }
  // things that grow out of it
  const xa = o.xA || A, X = {
    braces() { for (const [x, y] of [[0, 0], [W - 11, 0], [0, H - 11], [W - 11, H - 11]]) for (let i = 0; i < 11; i++) for (let j = 0; j < 11; j++) { const ex = min(x + i, W - 1 - x - i), ey = min(y + j, H - 1 - y - j); if (min(ex, ey) < T && !cut(x + i, y + j)) put(x + i, y + j, R.iron[(i + j) % 7 === 3 && min(ex, ey) === 2 ? 4 : min(ex, ey) === 0 ? 3 : 2]); } },
    icicles() { for (let i = 0; i < 17; i++) { const x = 9 + i * 5, n = 2 + floor(rnd(i, 4) * 7); for (let j = 0; j < n; j++) { put(x, T + j, R.ice[4]); if (j < n * 0.6) put(x + 1, T + j, R.ice[3]); if (j < n * 0.3) put(x - 1, T + j, R.ice[2]); } } },
    thorns() { for (let i = 0; i < 13; i++) { const s = i % 2, y = 10 + i * 10; put(-1, y, R.leaf[2]); put(-2, y - 1, R.leaf[3]); put(W, y + 4, R.leaf[2]); put(W + 1, y + 3, R.leaf[3]); if (i < 9) { put(10 + i * 10, -1 + s * 0, R.leaf[2]); put(11 + i * 10, -2, R.leaf[3]); } } },
    drips() { for (let i = 0; i < 12; i++) { const x = 8 + i * 8 - floor(rnd(i) * 3), n = 4 + floor(rnd(i, 4) * 16), w = rnd(i, 6) > 0.5 ? 3 : 2; for (let j = 0; j < n; j++) for (let q = 0; q < w; q++) put(x + q, T + j, R.venom[q === 0 ? 4 : q === w - 1 ? 1 : 3]); for (let q = -1; q <= w; q++) for (let j = 0; j < 3; j++) if (!((q < 0 || q === w) && j !== 1)) put(x + q, T + n + j, R.venom[q < 1 && j < 1 ? 4 : j === 2 ? 1 : 3]); } for (let i = 0; i < 5; i++) { const x = 15 + i * 17; for (let q = 0; q < 8; q++) for (let j = 0; j < 4 - (q < 2 || q > 5 ? 1 : 0); j++) put(x + q, H - T - j - 1, R.venom[j === 2 ? 4 : 3]); } },
    crystals() { [[4, 0, 1], [17, 0, 0], [36, 0, 1], [57, 0, 0], [75, 0, 1], [88, 0, 0]].forEach(([x, , b], i) => { spr(b ? 'crystal' : 'spire', x, -6 - (b ? 1 : 0), b ? 'violet' : 'magenta', b ? 'violet' : 'cobalt'); spr(b ? 'spire' : 'crystal', x, H - 3, b ? 'cobalt' : 'violet', i % 2 ? 'magenta' : 'cobalt', false, true); }); for (const y of [26, 62, 98]) { for (let j = 0; j < 7; j++) for (let i = 0; i < 6 - abs(j - 3); i++) { put(-1 - i, y + j, R.magenta[j < 3 ? 4 : 2]); put(W + i, y + 14 + j, R.violet[j < 3 ? 4 : 2]); } } },
    spikes() { for (let i = 0; i < 9; i++) { const x = 10 + i * 10; for (let j = 0; j < 5; j++) for (let q = -floor((4 - j) / 2); q <= floor((4 - j) / 2); q++) { put(x + q, -1 - j, R[xa][q < 0 ? 4 : q > 0 ? 1 : 3]); put(x + q, H + j, R[xa][q < 0 ? 3 : 1]); } } for (let i = 0; i < 11; i++) { const y = 20 + i * 10; for (let j = 0; j < 5; j++) for (let q = -floor((4 - j) / 2); q <= floor((4 - j) / 2); q++) { put(-1 - j, y + q, R[xa][q < 0 ? 4 : 2]); put(W + j, y + q, R[xa][q < 0 ? 3 : 1]); } } },
    wings() { for (let i = 0; i < 8; i++) { const n = [11, 11, 10, 10, 9, 7, 6, 4][i], y = 20 + i * 6; for (let j = 0; j < 6; j++) for (let q = 0; q < n - abs(j - 2) + (j < 3 ? 0 : -1); q++) { const c = R[xa][j === 0 ? 4 : j === 5 ? 1 : q > n - 4 ? 4 : j < 3 ? 3 : 2], yy = y + j - floor(q * 0.75); put(-1 - q, yy, c); put(W + q, yy, c); } for (let q = 0; q < n - 3; q++) { put(-1 - q, y + 2 - floor(q * 0.75), R.gold[3]); put(W + q, y + 2 - floor(q * 0.75), R.gold[3]); } } },
    spires() { [[8, 8], [20, 5], [31, 7], [63, 7], [74, 5], [85, 8]].forEach(([x, n]) => { for (let j = 0; j < n + 3; j++) { const w = floor((n + 3 - j) / 3); for (let q = -w; q <= w; q++) { put(x + q + 3, 1 - j, R[xa][q < 0 ? 4 : q === 0 ? 3 : 2]); if (j < n) put(x + q + 3, H - 2 + floor(j * 0.8), R[xa][q < 0 ? 3 : 1]); } } }); for (let i = 0; i < 6; i++) { const y = 24 + i * 18, n = 4 + (i % 3) * 2; for (let j = 0; j < n; j++) for (let q = 0; q <= floor((n - j) / 2); q++) { put(-1 - j, y - j + q, R[xa][q ? 3 : 4]); put(W + j, y - j + q, R[xa][q ? 2 : 4]); } } },
    ridge() { for (let i = 0; i < 12; i++) { const y = 18 + i * 9; for (let j = 0; j < 5; j++) for (let q = 0; q < 6 - j; q++) { put(-1 - j, y + q - j, R[xa][q === 0 ? 4 : q > 3 ? 1 : 2]); put(W + j, y + q - j, R[xa][q === 0 ? 4 : q > 3 ? 1 : 2]); } } for (let i = 0; i < 8; i++) { const x = 14 + i * 10; if (abs(x - 49) < 10) continue; for (let j = 0; j < 5; j++) for (let q = 0; q < 6 - j; q++) put(x + (x < 50 ? -q + 3 : q - 3), -1 - j, R[xa][q < 2 ? 4 : q > 3 ? 1 : 2]); } },
    canopy() { for (let i = 0; i < 46; i++) { const a = i / 45, x = round(-6 + a * 112), y = round(-3 + rnd(i, 3) * 8 + abs(a - 0.5) * 14), r = 4 + floor(rnd(i, 5) * 4); for (let q = -r; q <= r; q++) for (let j = -r; j <= r; j++) if (q * q + j * j <= r * r + 1) put(x + q, y + j, R.leaf[j + q < -r * 0.7 ? 4 : j + q < 0 ? 3 : j + q < r * 0.8 ? 2 : 1]); } for (let i = 0; i < 12; i++) { const x = round(2 + rnd(i, 9) * 96), y = round(-5 + rnd(i, 8) * 12); put(x, y, EXTRA.r); put(x + 1, y, EXTRA.r); put(x, y + 1, EXTRA.r); put(x + 1, y + 1, R.blood[1]); put(x, y, EXTRA.m); } for (let i = 0; i < 9; i++) { let x = 6 + i * 11, y = H - 1; const n = 6 + floor(rnd(i, 2) * 5); for (let j = 0; j < n; j++) { for (let q = 0; q < (j < 3 ? 4 : j < 6 ? 3 : 2); q++) put(x + q, y + j, R.oak[q === 0 ? 4 : q === 1 ? 3 : 1]); x += rnd(i, j + 20) > 0.55 ? (i < 4 ? -1 : 1) : 0; } } },
    shards() { [[-9, 22, 5], [-10, 52, 4], [-8, 84, 6], [-10, 116, 4], [W + 4, 30, 6], [W + 6, 62, 4], [W + 4, 92, 5], [W + 6, 122, 4], [14, -9, 5], [30, -7, 4], [66, -8, 5], [84, -9, 4], [22, H + 3, 5], [50, H + 4, 4], [76, H + 3, 5]].forEach(([x, y, n], i) => { for (let j = 0; j < n + 2; j++) for (let q = 0; q < n; q++) { const m = abs(q - (n - 1) / 2) * 1.2 + abs(j - (n + 1) / 2); if (m <= (n + 1) / 2) put(x + q, y + j, R[i % 2 ? 'magenta' : xa][q < n / 2 && j < n / 2 ? 4 : q > n / 2 ? 1 : 3]); } }); },
    rays() { for (let i = 0; i < 12; i++) { const x = 6 + i * 8, n = i % 2 ? 4 : 8; if (abs(x - 50) < 8) continue; for (let j = 0; j < n; j++) for (let q = 0; q < (j < n / 2 ? 3 : 1); q++) { const z = x + q + (j < n / 2 ? 0 : 1); put(z, -1 - j, R[xa][q ? 2 : 4]); put(z, H + j, R[xa][q ? 1 : 3]); } } for (let i = 0; i < 16; i++) { const y = 8 + i * 8, n = i % 2 ? 4 : 8; for (let j = 0; j < n; j++) for (let q = 0; q < (j < n / 2 ? 3 : 1); q++) { const z = y + q + (j < n / 2 ? 0 : 1); put(-1 - j, z, R[xa][q ? 2 : 4]); put(W + j, z, R[xa][q ? 2 : 4]); } } },
    ironwork() { for (let i = 0; i < 9; i++) { const x = 10 + i * 10; if (abs(x - 50) < 12) continue; for (let j = 0; j < 7; j++) put(x, -1 - j, R[xa][j > 4 ? 4 : 2]); put(x - 1, -5, R[xa][3]); put(x + 1, -5, R[xa][3]); put(x - 1, -2, R[xa][2]); put(x + 1, -2, R[xa][2]); } for (let x = 8; x < 38; x++) { put(x, -3, R[xa][3]); put(W - 1 - x, -3, R[xa][3]); } },
  };
  if (o.x) X[o.x]();
  // corners
  if (o.horn) { spr('horn', -4, -6, o.cA, Bq); spr('horn', W - 4, -6, o.cA, Bq, true); spr('horn', -4, H - 3, o.cA, Bq, false, true); spr('horn', W - 4, H - 3, o.cA, Bq, true, true); } else if (o.c) {
    const name = o.c === 'flame' && f % 2 ? 'flame2' : o.c, [w, h] = size(name), ca = o.cA || (o.c === 'note' ? o.tA : A), cb = o.cB || Bq, ctr = o.out ? -o.out : round((T - w) / 2) + (o.in || 1), cy = o.out ? -o.out : round((T - h) / 2) + (o.in || 1);
    const ox = o.outSide ? -o.outSide : max(-MARGIN, ctr), oy = o.outUp ? -o.outUp : max(-MARGIN, cy);
    for (const [r, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (!(b && o.topsOnly)) spr(name, r ? W - ox - w : ox, b ? H - (o.outUp ? 3 : oy) - h : oy, ca, cb, !!r, !!b && !o.up);
    if (o.topsOnly) for (const r of [0, 1]) for (let j = 0; j < 14; j++) for (let i = 0; i < 12; i++) { const x = r ? W - 7 + i : -5 + i, y = H - 11 + j; put(x, y, R[A][(i + (floor(j / 3) % 2) * 3) % 6 === 0 || j % 3 === 2 ? 0 : j % 3 ? 2 : 3]); }
  }
  const mid = (name, y, a, b) => { const [w] = size(name); spr(name, round((W - w) / 2), y, a, b); };
  if (o.mon) { const m = M[o.mon], r = m.r.split('/'), w = r[0].length, x0 = round((W - w) / 2), y0 = o.mon === 'demon' ? -11 : -r.length + 5; for (let i = -3; i < w + 3; i++) for (let j = 0; j < T + 1; j++) put(x0 + i, j, R[A][j === 0 ? 4 : j > T - 1 ? 1 : 2]); r.forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.') put(x0 + i, y0 + j, m.p[c >= 'a' ? c.charCodeAt(0) - 87 : +c]); })); }
  if (o.top) { const [, h] = size(o.top); mid(o.top, o.over != null ? -o.over : o.top === 'book' || o.top === 'joy' || o.top === 'anvil' || o.top === 'torii' ? -h + T : round((T - h) / 2), o.tA || A, o.top === 'rose' ? o.B2 || Bq : o.tB || Bq); }
  if (o.bot) { const [, h] = size(o.bot); mid(o.bot, H - T + round((T - h) / 2), o.tA && o.bot !== 'shield' && o.bot !== 'drop' ? o.tA : o.bot === 'shield' ? 'gold' : A, o.tB || Bq); }
  if (o.tops) for (const x of [10, 24, 38, 55, 69, 83]) spr(o.tops, x, -6 - (x % 3), o.tA || A, Bq);
  if (o.bots) for (const x of [14, 28, 42, 57, 71, 84]) spr(o.bots === 'flame' && (f + x) % 2 ? 'flame2' : o.bots, x - 3, H - 7, o.bA || A, Bq);
  if (o.side) { const [w, h] = size(o.side); for (const r of [0, 1]) spr(o.side, r ? W - T - round((w - T) / 2) : round((T - w) / 2), round((H - h) / 2), o.sA || A, o.sB || Bq, !!r); }
  if (o.sideB) for (const r of [0, 1]) spr(o.sideB, r ? W - 5 : -2, 34, A, Bq, !!r);
  // one dark line round everything, then the odd glint
  const line = []; for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const i = x + y * GW; if (g[i]) continue; if ((x && g[i - 1]) || (x < GW - 1 && g[i + 1]) || (y && g[i - GW]) || (y < GH - 1 && g[i + GW])) line.push(i); }
  line.forEach((i) => { g[i] = OUT; });
  if (o.glint) { const spots = [[6, 6], [W - 7, 8], [W - 6, H / 2], [W / 2, 2], [8, H - 8], [4, H / 2 - 4], [W - 8, H - 6]], [x, y] = spots[mod(floor(f / 4), 7)], q = f % 4; if (q < 3) { put(x, y, '#ffffff'); if (q === 1) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) put(x + a, y + b, '#fff8e8'); } }
  return g;
}

/** Paint border `k` on a canvas context at `s` px a cell; frame `f` (FX[k].fps says how fast, 0 = still). */
export function paintBorder(g, k, f = 0, s = 1) {
  const n = FX[k]?.fps ? f % 56 : 0, id = `${k}|${n}`;
  let q = cache.get(id); if (!q) { q = grid(k, n); if (!q) return; if (cache.size > 400) cache.clear(); cache.set(id, q); }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW;) { const c = q[x + y * GW]; let w = 1; while (x + w < GW && q[x + w + y * GW] === c) w++; if (c) { g.fillStyle = c; g.fillRect(x * s, y * s, w * s, s); } x += w; }
}
