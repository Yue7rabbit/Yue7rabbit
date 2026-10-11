import type { VisualState } from '../collective/visualState';
import { clamp01, easeInOutCubic, easeOutCubic, noise1 } from '../utils/math';
import { AMBER, IVORY, MIST, mixRGB, rgba } from './palette';

export const SERIF = '"Cormorant Garamond", "Cormorant", "Iowan Old Style", Georgia, serif';

const T_IN = 1.0;
const T_HOLD = 2.3;
const T_DISSOLVE = 0.45;
const T_END = 6.2;

/**
 * Keyword transformation — one polished effect:
 * the word rises out of the pupil, holds, then its glyph pixels become
 * particles that stretch into streaks and are wound into the iris as fibers.
 */
export class KeywordFX {
  private word = '';
  private secondary = '';
  private t0 = -100;
  private sampled = false;
  private intent: VisualState | null = null;
  private max: number;
  private n = 0;
  private px: Float32Array;
  private py: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private seed: Float32Array;
  private off: HTMLCanvasElement | OffscreenCanvas | null = null;

  constructor(maxParticles: number) {
    this.max = maxParticles;
    this.px = new Float32Array(maxParticles);
    this.py = new Float32Array(maxParticles);
    this.vx = new Float32Array(maxParticles);
    this.vy = new Float32Array(maxParticles);
    this.seed = new Float32Array(maxParticles);
  }

  get active(): boolean {
    return this.word !== '';
  }

  get current(): string[] {
    return this.word ? [this.word, this.secondary].filter(Boolean) : [];
  }

  private echoWord = '';
  private echoT0 = -100;

  /** At commit the visitor's word reappears briefly where the influence trail begins. */
  echo(now: number, word: string): void {
    this.echoWord = word.toUpperCase();
    this.echoT0 = now;
  }

  show(now: number, words: string[], intent: VisualState): void {
    this.word = (words[0] ?? '').toUpperCase();
    this.secondary = (words[1] ?? '').toUpperCase();
    this.t0 = now;
    this.sampled = false;
    this.n = 0;
    this.intent = intent;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    now: number,
    dtMs: number,
    g: { cx: number; cy: number; R: number; irisX: number; irisY: number; irisR: number; dpr: number },
  ): void {
    const ea = now - this.echoT0;
    if (this.echoWord && ea < 1.8) {
      const fontPx = Math.round(g.R * 0.11);
      ctx.font = `300 ${fontPx}px ${SERIF}`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(AMBER, Math.sin((Math.PI * ea) / 1.8) * 0.85);
      drawTracked(ctx, this.echoWord, g.cx, g.cy + g.R * 0.66 - ea * g.R * 0.05, fontPx * 0.45);
    }
    if (!this.word) return;
    const age = now - this.t0;
    if (age > T_END) {
      this.word = '';
      return;
    }
    const s = this.intent!;
    const fontPx = Math.round(g.R * 0.17);
    const labelY = g.cy + g.R * 0.66;
    const tracking = fontPx * (0.18 + 0.22 * easeOutCubic(age / T_IN));

    // Text phase
    const textAlpha =
      age < T_IN ? easeOutCubic(age / T_IN) : age < T_HOLD ? 1 : 1 - clamp01((age - T_HOLD) / T_DISSOLVE);
    const rise = easeInOutCubic(age / T_IN);
    const y = g.irisY + (labelY - g.irisY) * rise;
    if (textAlpha > 0.01) {
      ctx.font = `300 ${fontPx}px ${SERIF}`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(IVORY, textAlpha);
      drawTracked(ctx, this.word, g.cx, y, tracking);
      if (this.secondary) {
        ctx.font = `300 ${Math.round(fontPx * 0.42)}px ${SERIF}`;
        ctx.fillStyle = rgba(MIST, textAlpha * 0.8);
        drawTracked(ctx, this.secondary, g.cx, y + fontPx * 0.85, fontPx * 0.2);
      }
    }

    // Dissolve: sample glyphs once
    if (age >= T_HOLD && !this.sampled) {
      this.sampled = true;
      this.sample(ctx, fontPx, tracking, g.cx, labelY, g.dpr);
    }
    if (!this.sampled || this.n === 0) return;

    const pt = age - T_HOLD;
    const dt = Math.min(dtMs, 50) / 1000;
    const jitter = (0.2 + s.turbulence * 1.3) * g.R * 0.25;
    const swirl = 0.6 + s.energy * 1.6;
    const smooth = 0.9 + s.fluidity * 0.08; // velocity retention
    const pull = clamp01((pt - 0.35) / 1.2);
    const fade = 1 - clamp01((age - (T_END - 1.6)) / 1.6);
    const colour = mixRGB(IVORY, AMBER, s.energy * 0.6);

    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(colour, 0.55 * fade);
    ctx.lineWidth = g.dpr * 0.9;
    ctx.beginPath();
    for (let i = 0; i < this.n; i++) {
      const dx = this.px[i] - g.irisX;
      const dy = this.py[i] - g.irisY;
      const d = Math.hypot(dx, dy) || 1;
      const target = g.irisR * (0.62 + 0.4 * this.seed[i]);
      // radial spring toward the iris band + tangential swirl
      const radial = (target - d) * 2.2 * pull;
      const tang = swirl * g.irisR * 1.1 * pull;
      let ax = (dx / d) * radial + (-dy / d) * tang;
      let ay = (dy / d) * radial + (dx / d) * tang;
      const nz = noise1(now * (1 + s.rhythm * 3) + this.seed[i] * 40, i);
      ax += nz * jitter * (1 - pull * 0.5);
      ay += noise1(now * 1.3 + this.seed[i] * 70, i + 9) * jitter * (1 - pull * 0.5);
      if (pt < 0.35) ay -= g.R * 0.15; // initial lift
      this.vx[i] = this.vx[i] * smooth + ax * dt;
      this.vy[i] = this.vy[i] * smooth + ay * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      const k = 0.05 + 0.06 * pull; // streak length ∝ velocity: letters stretch into fibers
      ctx.moveTo(this.px[i], this.py[i]);
      ctx.lineTo(this.px[i] - this.vx[i] * k, this.py[i] - this.vy[i] * k);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = prevOp;
  }

  private sample(ctx: CanvasRenderingContext2D, fontPx: number, tracking: number, cx: number, cy: number, dpr: number): void {
    const font = `300 ${fontPx}px ${SERIF}`;
    ctx.font = font;
    const width = Math.ceil(measureTracked(ctx, this.word, tracking)) + 8;
    const height = Math.ceil(fontPx * 1.4);
    if (width <= 8 || height <= 0) return;
    if (!this.off || this.off.width < width || this.off.height < height) {
      this.off =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(width, height)
          : Object.assign(document.createElement('canvas'), { width, height });
    }
    const oc = this.off.getContext('2d') as CanvasRenderingContext2D | null;
    if (!oc) return;
    oc.clearRect(0, 0, this.off.width, this.off.height);
    oc.font = font;
    oc.textBaseline = 'middle';
    oc.fillStyle = '#fff';
    drawTracked(oc, this.word, width / 2, height / 2, tracking);
    const img = oc.getImageData(0, 0, width, height).data;
    const pts: number[] = [];
    const step = Math.max(2, Math.round(dpr * 2));
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        if (img[(y * width + x) * 4 + 3] > 120) pts.push(x, y);
      }
    }
    const total = pts.length / 2;
    const stride = Math.max(1, total / this.max);
    this.n = 0;
    for (let f = 0; f < total && this.n < this.max; f += stride) {
      const j = Math.floor(f) * 2;
      const i = this.n++;
      this.px[i] = cx - width / 2 + pts[j];
      this.py[i] = cy - height / 2 + pts[j + 1];
      this.vx[i] = 0;
      this.vy[i] = 0;
      const h = Math.sin(i * 12.9898) * 43758.5453;
      this.seed[i] = h - Math.floor(h);
    }
  }
}

function measureTracked(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + tracking;
  return w - tracking;
}

function drawTracked(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, tracking: number): void {
  const total = measureTracked(ctx, text, tracking);
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + tracking;
  }
}
