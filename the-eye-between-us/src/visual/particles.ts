import { noise1 } from '../utils/math';
import { mulberry32 } from '../utils/random';
import { IVORY, MIST, rgba } from './palette';

const MAX_ATMOS = 200;

/** Subordinate depth layer: slow dust drifting with gentle parallax. Fixed-size pool. */
export class Atmosphere {
  private x = new Float32Array(MAX_ATMOS);
  private y = new Float32Array(MAX_ATMOS);
  private z = new Float32Array(MAX_ATMOS);
  private ph = new Float32Array(MAX_ATMOS);

  constructor() {
    const r = mulberry32(77);
    for (let i = 0; i < MAX_ATMOS; i++) {
      this.x[i] = r();
      this.y[i] = r();
      this.z[i] = 0.2 + r() * 0.8;
      this.ph[i] = r() * 100;
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, count: number, energy: number, gx: number, gy: number, dpr: number): void {
    const n = Math.min(count, MAX_ATMOS);
    const speed = 0.004 + energy * 0.012;
    for (let i = 0; i < n; i++) {
      const z = this.z[i];
      this.x[i] = (this.x[i] + noise1(t * 0.05 + this.ph[i], i) * speed * z * 0.016 + 1) % 1;
      this.y[i] = (this.y[i] - speed * z * 0.01 + 1) % 1;
      const px = this.x[i] * w - gx * z * w * 0.012;
      const py = this.y[i] * h - gy * z * h * 0.012;
      const tw = 0.5 + 0.5 * Math.sin(t * (0.3 + z) + this.ph[i]);
      ctx.fillStyle = rgba(i % 5 === 0 ? MIST : IVORY, (0.03 + 0.09 * z) * tw);
      const s = dpr * (0.6 + z * 1.2);
      ctx.fillRect(px, py, s, s);
    }
  }
}
