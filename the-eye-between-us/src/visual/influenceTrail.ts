import { clamp01, easeInOutCubic } from '../utils/math';
import { AMBER, IVORY, MIST, mixRGB, rgba, type RGB } from './palette';

type Trail = {
  t0: number;
  dur: number;
  sx: number;
  sy: number;
  colour: RGB;
  bendSign: number;
  arrived: boolean;
  onArrive?: () => void;
  persistence: number; // seconds the thread lingers after arrival
};

type Spark = { x: number; y: number; vx: number; vy: number; life: number; colour: RGB };

const MAX_SPARKS = 90;

/**
 * Luminous line travelling from an individual eye into the collective iris.
 * After arrival, a faint thread remains for a while (trail persistence).
 */
export class InfluenceTrails {
  private trails: Trail[] = [];
  private sparks: Spark[] = [];
  private sparkIdx = 0;

  constructor() {
    for (let i = 0; i < MAX_SPARKS; i++) this.sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, colour: IVORY });
  }

  launch(now: number, sx: number, sy: number, energy: number, fluidity: number, durMs = 850, onArrive?: () => void): void {
    const colour = mixRGB(mixRGB(IVORY, MIST, fluidity * 0.7), AMBER, energy * 0.8);
    this.trails.push({
      t0: now,
      dur: durMs / 1000,
      sx,
      sy,
      colour,
      bendSign: sx < 0 ? 1 : -1,
      arrived: false,
      onArrive,
      persistence: 6,
    });
  }

  get active(): boolean {
    return this.trails.some((t) => !t.arrived);
  }

  draw(ctx: CanvasRenderingContext2D, now: number, dtMs: number, ex: number, ey: number, w: number, dpr: number): void {
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      const age = now - tr.t0;
      const p = clamp01(age / tr.dur);
      const ep = easeInOutCubic(p);
      // Control points: a gentle arc
      const dx = ex - tr.sx;
      const dy = ey - tr.sy;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * tr.bendSign * len * 0.25;
      const ny = (dx / len) * tr.bendSign * len * 0.25;
      const c1x = tr.sx + dx * 0.3 + nx;
      const c1y = tr.sy + dy * 0.3 + ny;
      const c2x = tr.sx + dx * 0.75 + nx * 0.4;
      const c2y = tr.sy + dy * 0.75 + ny * 0.4;
      const at = (u: number) => {
        const v = 1 - u;
        return [
          v * v * v * tr.sx + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * ex,
          v * v * v * tr.sy + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * ey,
        ];
      };

      // Lingering thread
      const linger = tr.arrived ? Math.max(0, 1 - (age - tr.dur) / tr.persistence) : Math.min(1, ep * 1.5);
      if (linger > 0) {
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) {
          const u = (k / 40) * (tr.arrived ? 1 : ep);
          const [x, y] = at(u);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(tr.colour, 0.12 * linger);
        ctx.lineWidth = dpr * 0.8;
        ctx.stroke();
      }

      if (!tr.arrived) {
        // Bright tail
        const tail = 0.35;
        const SEG = 22;
        for (let k = 0; k < SEG; k++) {
          const u0 = Math.max(0, ep - tail + (tail * k) / SEG);
          const u1 = Math.max(0, ep - tail + (tail * (k + 1)) / SEG);
          const [x0, y0] = at(u0);
          const [x1, y1] = at(u1);
          const a = (k + 1) / SEG;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.strokeStyle = rgba(tr.colour, a * 0.85);
          ctx.lineWidth = dpr * (0.6 + a * 2.6);
          ctx.stroke();
        }
        const [hx, hy] = at(ep);
        const rad = w * 0.018;
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, rad);
        g.addColorStop(0, rgba(IVORY, 0.95));
        g.addColorStop(0.3, rgba(tr.colour, 0.5));
        g.addColorStop(1, rgba(tr.colour, 0));
        ctx.fillStyle = g;
        ctx.fillRect(hx - rad, hy - rad, rad * 2, rad * 2);
        for (let s = 0; s < 2; s++) this.spawnSpark(hx, hy, tr.colour, dpr);
        if (p >= 1) {
          tr.arrived = true;
          tr.onArrive?.();
        }
      } else if (linger <= 0) {
        this.trails.splice(i, 1);
      }
    }

    // Sparks
    const dt = Math.min(dtMs, 100) / 1000;
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt * 1.4;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.96;
      s.vy *= 0.96;
      ctx.fillStyle = rgba(s.colour, Math.max(0, s.life) * 0.7);
      ctx.fillRect(s.x, s.y, dpr * 1.4, dpr * 1.4);
    }
    ctx.globalCompositeOperation = prevOp;
  }

  private spawnSpark(x: number, y: number, colour: RGB, dpr: number): void {
    const s = this.sparks[this.sparkIdx];
    this.sparkIdx = (this.sparkIdx + 1) % MAX_SPARKS;
    const a = Math.random() * Math.PI * 2;
    const v = (10 + Math.random() * 40) * dpr;
    s.x = x;
    s.y = y;
    s.vx = Math.cos(a) * v;
    s.vy = Math.sin(a) * v;
    s.life = 0.6 + Math.random() * 0.4;
    s.colour = colour;
  }
}
