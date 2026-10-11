import type { BehaviorFeatures } from '../interpretation/schemas';
import { clamp01 } from '../utils/math';

/**
 * Accumulates per-frame live samples into summary behaviour features
 * using running sums only (constant memory, nothing identifying is kept).
 */
export class FeatureAccumulator {
  private time = 0;
  private presentTime = 0;
  private moveSum = 0;
  private openSum = 0;
  private gx = 0;
  private gy = 0;
  private gx2 = 0;
  private gy2 = 0;
  blinks = 0;

  reset(): void {
    this.time = this.presentTime = this.moveSum = this.openSum = 0;
    this.gx = this.gy = this.gx2 = this.gy2 = 0;
    this.blinks = 0;
  }

  /** dtMs: frame duration; movement: face-widths per second; openness: 0..1 (0.5 = typical). */
  add(dtMs: number, present: boolean, movement: number, openness: number, gazeX: number, gazeY: number): void {
    const dt = Math.min(dtMs, 200) / 1000;
    this.time += dt;
    if (!present) return;
    this.presentTime += dt;
    this.moveSum += movement * dt;
    this.openSum += openness * dt;
    this.gx += gazeX * dt;
    this.gy += gazeY * dt;
    this.gx2 += gazeX * gazeX * dt;
    this.gy2 += gazeY * gazeY * dt;
  }

  addBlink(): void {
    this.blinks++;
  }

  get seconds(): number {
    return this.presentTime;
  }

  features(): BehaviorFeatures {
    const T = Math.max(this.presentTime, 1e-3);
    const move = this.moveSum / T;
    const mx = this.gx / T;
    const my = this.gy / T;
    const sx = Math.sqrt(Math.max(0, this.gx2 / T - mx * mx));
    const sy = Math.sqrt(Math.max(0, this.gy2 / T - my * my));
    const blinksPerMin = (this.blinks / T) * 60;
    const lossFrac = this.time > 0 ? 1 - this.presentTime / this.time : 0;
    const movementIntensity = clamp01(move / 0.5);
    return {
      movementIntensity,
      blinkRate: clamp01(blinksPerMin / 36),
      eyeOpenness: clamp01(this.openSum / T),
      gazeVariation: clamp01((sx + sy) / 0.7),
      stability: clamp01(1 - movementIntensity * 0.6 - lossFrac * 0.9 - (sx + sy) * 0.25),
    };
  }
}
