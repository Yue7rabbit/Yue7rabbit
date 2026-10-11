import { emotionColour } from './emotionPalette';
import type { EmergentTraits } from '../collective/influenceRules';
import type { VisualState } from '../collective/visualState';
import { TAU, noise1 } from '../utils/math';
import { mulberry32 } from '../utils/random';
import { AMBER, IVORY, MIST, rgba, type RGB } from './palette';

export const LATIN_FONT = '"Cormorant Garamond", "Cormorant", Georgia, serif';
export type WordWeight = { word: string; weight: number };

// ---------------------------------------------------------------------------
// Sprite cache: every word / character is rasterised once per colour and then
// drawn with drawImage + transform (hundreds per frame stay cheap).
// ---------------------------------------------------------------------------
const BASE_PX = 64;
type Sprite = { canvas: HTMLCanvasElement | OffscreenCanvas; w: number; h: number };
const sprites = new Map<string, Sprite>();
const COLOURS: RGB[] = [IVORY, MIST, AMBER];

export function clearTextSprites(): void {
  sprites.clear();
}
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener?.('loadingdone', clearTextSprites);
}

export function getSprite(text: string, colour: number, italic = false, tint?: RGB): Sprite | null {
  const key = `${text}|${tint ? tint.join(',') : colour}|${italic ? 1 : 0}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  const font = `${italic ? 'italic ' : ''}300 ${BASE_PX}px ${LATIN_FONT}`;
  const make = (w: number, h: number) =>
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const probe = make(4, 4).getContext('2d') as CanvasRenderingContext2D | null;
  if (!probe) return null;
  probe.font = font;
  const tracking = text.length > 1 ? BASE_PX * 0.16 : 0;
  let width = 0;
  for (const ch of text) width += probe.measureText(ch).width + tracking;
  width = Math.ceil(width - tracking + 4);
  const height = Math.ceil(BASE_PX * 1.25);
  const canvas = make(Math.max(4, width), height);
  const c = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!c) return null;
  c.font = font;
  c.textBaseline = 'middle';
  const col = tint ?? COLOURS[colour] ?? IVORY;
  c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
  let x = 2;
  for (const ch of text) {
    c.fillText(ch, x, height / 2);
    x += c.measureText(ch).width + tracking;
  }
  const s = { canvas, w: canvas.width, h: canvas.height };
  sprites.set(key, s);
  return s;
}

export function pickWord(pool: WordWeight[], r: number): WordWeight {
  let total = 0;
  for (const p of pool) total += Math.pow(p.weight, 1.4);
  let x = r * total;
  for (const p of pool) {
    x -= Math.pow(p.weight, 1.4);
    if (x <= 0) return p;
  }
  return pool[pool.length - 1];
}

// ---------------------------------------------------------------------------
// The text iris
// ---------------------------------------------------------------------------
export type TextIrisParams = {
  cx: number;
  cy: number;
  pupilR: number;
  irisR: number;
  time: number;
  rotation: number;
  state: VisualState;
  emergent: EmergentTraits;
  squeeze: number; // blink: >0 compressed, <0 springy overshoot
  twist: number;
  flowX: number;
  flowY: number;
  brightness: number;
  agitation: number;
  density: number; // 0..1 overall amount of type
  lineScale: number;
};

type Glyph = { text: string; u: number; k: number; colour: number; jit: number; hero: boolean };
type Spoke = { angle: number; phase: number; bend: number; layer: number; hue: number; glyphs: Glyph[]; next: Glyph | null };

const SPOKES = 84;
const MAX_PARTICLES = 1400;
const LAYER_ALPHA = [0.92, 0.74, 0.56];
const GLYPH_SCALE = 1.2; // glyph height relative to size × span
const CLEAR_U = 0.34; // outer two-thirds: crisp, fully legible text
const DISSOLVE_U = 0.11; // only a thin band around the pupil: words turn to particles here

/**
 * The iris is written in words, laid out as in the first design: each radial fiber is a
 * chain of words read outward from the pupil — small near the centre, larger toward
 * the rim — with now and then one large word spanning most of the iris.
 *
 * Every chain drifts very slowly toward the pupil, like matter toward a black hole.
 * Only in a thin band right around the pupil does a word fade into particles shed
 * along its whole length; the particles join a slow accretion swirl and vanish
 * behind the event horizon (black core, photon ring, faint lensed arcs). New words from
 * the collective pool enter at the rim, so the iris is continuously rewritten.
 *
 * Collective state: density → how many fibers carry words and how many particles;
 * flow direction (fluidity vs tension) → which way the swirl turns; fluidity + coiled
 * flow → how much the fibers bend; energy/rhythm → drift and orbit speed;
 * tension → zig-zag; turbulence → wobble.
 */
export class TextIris {
  private rnd = mulberry32(0x7e47);
  private pool: WordWeight[] = [{ word: 'still', weight: 1 }];
  private poolKey = '';
  private spokes: Spoke[] = [];
  private pu = new Float32Array(MAX_PARTICLES); // normalised radius (0 = horizon, 1 = rim)
  private pa = new Float32Array(MAX_PARTICLES); // angle
  private pl = new Float32Array(MAX_PARTICLES); // life / brightness 0..1
  private pNext = 0;
  private flowDir = 1;
  private surge = 0;
  private spin = 0;
  theme = 'still';

  constructor() {
    const r = mulberry32(0x1215);
    for (let i = 0; i < SPOKES; i++) {
      this.spokes.push({
        angle: (i / SPOKES) * TAU + (r() - 0.5) * (TAU / SPOKES) * 1.6,
        phase: r() * 100,
        bend: r() * 2 - 1,
        layer: r() < 0.5 ? 0 : r() < 0.6 ? 1 : 2,
        hue: r(),
        glyphs: [],
        next: null,
      });
    }
    for (let i = this.spokes.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [this.spokes[i], this.spokes[j]] = [this.spokes[j], this.spokes[i]];
    }
    for (const sp of this.spokes) this.refill(sp, 0.2 + r() * 0.15);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pu[i] = 0.02 + r() * 0.1;
      this.pa[i] = r() * TAU;
      this.pl[i] = r() < 0.3 ? r() * 0.35 : 0;
    }
  }

  setPool(pool: WordWeight[], rewriteAll = false): void {
    const sorted = pool.filter((p) => p.weight > 0).sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word));
    if (!sorted.length) return;
    if (rewriteAll) this.surge = 1; // the hole briefly swallows faster: the iris rewrites itself
    const key = sorted.map((p) => `${p.word}:${p.weight.toFixed(1)}`).join(',');
    if (key === this.poolKey) return;
    this.poolKey = key;
    this.pool = sorted;
    for (const sp of this.spokes) sp.next = null; // queued words come from the new pool
    const current = sorted.find((p) => p.word === this.theme)?.weight ?? 0;
    if (sorted[0].word !== this.theme && sorted[0].weight > current * 1.2 + 0.5) this.theme = sorted[0].word;
  }

  /** Size of a glyph (fraction of span) at radius u: small near the pupil, larger toward the rim. */
  private static size(g: Glyph, u: number): number {
    return g.hero ? g.k * (0.55 + 0.45 * u) : g.k * (0.03 + 0.055 * u);
  }

  private static len(g: Glyph, u: number): number {
    const sprite = getSprite(g.text, 0);
    const aspect = sprite ? sprite.w / sprite.h : 4;
    // sprite height is 1.25 × BASE_PX; packed slightly tighter than exact, as in the first design
    return TextIris.size(g, u) * aspect * GLYPH_SCALE * 1.25 * 0.8;
  }

  private newGlyph(u: number, heroOk: boolean): Glyph {
    const r = this.rnd;
    const pick = pickWord(this.pool, r());
    const isTheme = pick.word === this.theme;
    const maxW = this.pool[0]?.weight ?? 1;
    const hero = heroOk && r() < 0.16;
    const text = pick.word.toUpperCase();
    let k = (0.8 + 0.45 * (pick.weight / maxW) + r() * 0.2) * (isTheme ? 1.15 : 1);
    if (hero) {
      const sprite = getSprite(text, 0);
      const aspect = sprite ? sprite.w / sprite.h : 4;
      k = Math.min(0.17, (0.5 + r() * 0.25) / (aspect * GLYPH_SCALE * 1.25 * 0.7));
    }
    return { text, u, k, colour: isTheme && r() < 0.5 ? 2 : r() < 0.2 ? 1 : 0, jit: r(), hero };
  }

  /** Append words at the outer end of a chain while there is room before the rim. */
  private refill(sp: Spoke, startU?: number): void {
    let guard = 0;
    while (guard++ < 12) {
      const last = sp.glyphs[sp.glyphs.length - 1];
      const end = last ? last.u + TextIris.len(last, last.u) + 0.012 + last.jit * 0.02 : (startU ?? 0.9);
      if (end > 0.93) return;
      // The next word is chosen once and kept until there is room for it. (Re-rolling
      // whenever a word doesn't fit would favour short, low-weight words.)
      const g = sp.next ?? this.newGlyph(end, !last || end < 0.45);
      sp.next = g;
      g.u = end;
      const len = TextIris.len(g, end);
      if (end + len > 0.99) {
        const fit = (0.99 - end) / len;
        if (fit < 0.75) return; // wait until the chain has drifted inward, so rim words stay large
        g.k *= fit;
      }
      sp.next = null;
      sp.glyphs.push(g);
      if (g.hero) return;
    }
  }

  private emit(u: number, angle: number, life: number): void {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % MAX_PARTICLES;
    this.pu[i] = u;
    this.pa[i] = angle;
    this.pl[i] = life;
  }

  draw(ctx: CanvasRenderingContext2D, p: TextIrisParams, dtMs: number): void {
    const dt = Math.min(dtMs, 60) / 1000;
    const s = p.state;
    const e = p.emergent;
    const targetDir = Math.tanh((s.fluidity - s.tension) * 4 + 0.35);
    this.flowDir += (targetDir - this.flowDir) * Math.min(1, dt * 0.4);
    const dir = Math.abs(this.flowDir) < 0.2 ? Math.sign(this.flowDir || 1) * 0.2 : this.flowDir;
    this.surge = Math.max(0, this.surge - dt * 0.3);

    const sq = p.squeeze;
    const sx = 1 + 0.07 * sq;
    const sy = 1 - 0.5 * sq;
    const radial = 1 - 0.15 * Math.max(0, sq);
    const rh = p.pupilR;
    const r0 = rh * 1.06;
    const span = Math.max(1, (p.irisR * 0.98 - r0) * radial);
    const drift = (0.35 + s.energy * 0.6 + s.rhythm * 0.25) * (1 + this.surge * 4);
    const bendAmt = 0.08 + s.fluidity * 0.35 + e.coiledFlow * 0.6;
    const wobbleAmp = 0.02 + s.turbulence * 0.14 + p.agitation * 0.1;
    const wobbleSpeed = 0.2 + s.rhythm * 0.6 + s.energy * 0.5;
    const zig = Math.max(0, s.tension - 0.3) * 0.1;
    // a slow, gentle drag that curls the fibers only near the hole
    const pull = dir * (0.35 + 0.4 * s.energy);
    this.spin += dt * dir * (0.01 + s.energy * 0.03 + e.laminarRush * 0.04);
    const base = this.spin + p.twist;

    const angleAt = (sp: Spoke, u: number, g: number, jit: number) =>
      sp.angle +
      base +
      sp.bend * bendAmt * u +
      pull * Math.pow(1 - u, 3) +
      noise1(p.time * wobbleSpeed + sp.phase + jit * 3, sp.phase) * wobbleAmp * (0.3 + u) +
      (g % 2 ? zig : -zig) * u;
    const X = (a: number, r: number) => p.cx + Math.cos(a) * r * sx;
    const Y = (a: number, r: number) => p.cy + Math.sin(a) * r * sy;

    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    const n = Math.round(SPOKES * Math.min(1, 0.35 + 0.65 * p.density));

    // faint radial threads under the words
    const threads = new Path2D();
    for (let i = 0; i < n; i += 2) {
      const sp = this.spokes[i];
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        const a = angleAt(sp, u, 0, 0);
        const r = r0 + u * span;
        if (k === 0) threads.moveTo(X(a, r), Y(a, r));
        else threads.lineTo(X(a, r), Y(a, r));
      }
    }
    ctx.lineWidth = p.lineScale * 0.6;
    ctx.strokeStyle = rgba(MIST, 0.07 * p.brightness);
    ctx.stroke(threads);

    for (let i = 0; i < SPOKES; i++) {
      const sp = this.spokes[i];
      // advance the chain: everything drifts inward, a little faster near the hole
      for (const g of sp.glyphs) g.u -= dt * drift * (0.008 + 0.03 * Math.pow(1 - g.u, 2));
      while (sp.glyphs.length && sp.glyphs[0].u <= 0.015) sp.glyphs.shift();
      this.refill(sp);
      if (i >= n) continue;

      for (let gi = 0; gi < sp.glyphs.length; gi++) {
        const g = sp.glyphs[gi];
        const sprite = getSprite(g.text, 0, false, emotionColour(g.text));
        if (!sprite) continue;
        const u = g.u;
        const a = angleAt(sp, u, gi, g.jit);
        const r = r0 + u * span;
        const x = X(a, r);
        const y = Y(a, r);
        const dirA = Math.atan2(Math.sin(a) * sy, Math.cos(a) * sx);
        const scale = (TextIris.size(g, u) * span * GLYPH_SCALE) / BASE_PX;
        const pixLen = sprite.w * scale;

        // gradual dissolve: fades with depth, shedding particles along its whole length
        // inner third: a gentle fade; thin band at the pupil: the word becomes particles
        const fade = u < CLEAR_U ? Math.max(0, (u - DISSOLVE_U) / (CLEAR_U - DISSOLVE_U)) : 1;
        const dis = u < DISSOLVE_U ? 1 - u / DISSOLVE_U : 0;
        if (u < CLEAR_U && this.rnd() < (dis * 0.25 + (1 - fade) * 0.03) * dt * 60) {
          const along = this.rnd() * pixLen;
          const px = x + Math.cos(dirA) * along;
          const py = y + Math.sin(dirA) * along;
          const dx = (px - p.cx) / sx;
          const dy = (py - p.cy) / sy;
          this.emit(Math.min(DISSOLVE_U, Math.max(0, (Math.hypot(dx, dy) - r0) / span)), Math.atan2(dy, dx), 0.7 + this.rnd() * 0.3);
        }
        const fadeIn = u > 0.84 ? Math.max(0, (0.97 - u) / 0.13) : 1;
        const alpha = LAYER_ALPHA[g.hero ? 0 : sp.layer] * p.brightness * fadeIn * (0.35 + 0.65 * fade) * Math.pow(1 - dis, 1.6);
        if (alpha < 0.01) continue;
        const flip = Math.cos(dirA) < 0;
        const d2 = flip ? dirA + Math.PI : dirA;
        const c = Math.cos(d2) * scale;
        const sn = Math.sin(d2) * scale;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.setTransform(c, sn, -sn, c, x, y);
        ctx.drawImage(sprite.canvas as CanvasImageSource, flip ? -sprite.w : 0, -sprite.h / 2);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;

    // ── particles: a thin, slow accretion band just outside the horizon
    const nParticles = Math.round(MAX_PARTICLES * Math.min(1, 0.4 + 0.6 * p.density));
    const dots = [new Path2D(), new Path2D(), new Path2D()];
    for (let i = 0; i < nParticles; i++) {
      let u = this.pu[i];
      if (this.pl[i] <= 0) continue;
      const omega = dir * (0.04 + s.energy * 0.08) * Math.pow(1 / (u + 0.25), 1.2);
      this.pa[i] += dt * omega;
      u -= dt * drift * (0.01 + 0.05 * Math.pow(1 - u, 2));
      this.pl[i] -= dt * 0.25;
      if (u <= 0) {
        // fell through the horizon; occasionally re-seed faint ambient dust
        this.pl[i] = this.rnd() < 0.3 ? 0.15 + this.rnd() * 0.25 : 0;
        u = 0.03 + this.rnd() * 0.09; // ambient dust stays in the thin band by the horizon
        this.pa[i] = this.rnd() * TAU;
      }
      this.pu[i] = u;
      const r = r0 + u * span;
      const x = X(this.pa[i], r);
      const y = Y(this.pa[i], r);
      const b = this.pl[i] > 0.75 ? 2 : this.pl[i] > 0.3 ? 1 : 0;
      const sz = p.lineScale * (0.6 + this.pl[i] * 0.9);
      dots[b].rect(x, y, sz, sz);
    }
    ctx.fillStyle = rgba(MIST, 0.3 * p.brightness);
    ctx.fill(dots[0]);
    ctx.fillStyle = rgba(IVORY, 0.45 * p.brightness);
    ctx.fill(dots[1]);
    ctx.fillStyle = rgba(AMBER, 0.6 * p.brightness);
    ctx.fill(dots[2]);

    // ── event horizon
    const glow = ctx.createRadialGradient(p.cx, p.cy, rh * 0.9, p.cx, p.cy, rh * 2);
    glow.addColorStop(0, rgba(AMBER, 0.28 * p.brightness));
    glow.addColorStop(0.35, rgba(AMBER, 0.07 * p.brightness));
    glow.addColorStop(1, rgba(AMBER, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(p.cx, p.cy, rh * 2 * sx, rh * 2 * sy, 0, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    const hole = ctx.createRadialGradient(p.cx, p.cy, 0, p.cx, p.cy, rh * 1.08);
    hole.addColorStop(0, '#000');
    hole.addColorStop(0.9, '#000');
    hole.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.ellipse(p.cx, p.cy, rh * 1.08 * sx, rh * 1.08 * sy, 0, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    const ring = ctx.createConicGradient(this.spin * 3, p.cx, p.cy);
    ring.addColorStop(0, rgba(IVORY, 0.9));
    ring.addColorStop(0.25, rgba(AMBER, 0.5));
    ring.addColorStop(0.5, rgba(AMBER, 0.16));
    ring.addColorStop(0.75, rgba(AMBER, 0.42));
    ring.addColorStop(1, rgba(IVORY, 0.9));
    ctx.strokeStyle = ring;
    ctx.lineWidth = p.lineScale * 1.1;
    ctx.beginPath();
    ctx.ellipse(p.cx, p.cy, rh * 1.02 * sx, rh * 1.02 * sy, 0, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = p.lineScale * 6;
    ctx.globalAlpha = 0.075;
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let k = 0; k < 4; k++) {
      const rr = rh * (1.12 + k * 0.08);
      const a0 = this.spin * (3 - k * 0.5) + p.time * dir * (0.12 - k * 0.02) + k * 1.7;
      ctx.beginPath();
      ctx.ellipse(p.cx, p.cy, rr * sx, rr * sy, 0, a0, a0 + 0.8 + 0.3 * k);
      ctx.strokeStyle = rgba(k % 2 ? IVORY : AMBER, (0.3 - k * 0.05) * p.brightness);
      ctx.lineWidth = p.lineScale * (1.2 - k * 0.15);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = prevOp;
  }
}
