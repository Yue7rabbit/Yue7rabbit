/**
 * Adaptive blink detector with hysteresis.
 *
 * - Learns each face's own "open" level (no single global threshold).
 * - Close / reopen thresholds are fractions of that baseline (hysteresis band).
 * - A blink only counts if the eye stays closed for [minClosedMs, maxClosedMs].
 * - Cooldown + debounce stop rapid repeated triggers.
 * - Tracking loss while closed cancels the candidate; after reacquisition a
 *   short settle window is required before a new blink can start.
 */
export type BlinkConfig = {
  closeRatio: number;
  openRatio: number;
  minClosedMs: number;
  maxClosedMs: number;
  cooldownMs: number;
  settleMs: number;
  minCalibrationSamples: number;
};

export const DEFAULT_BLINK_CONFIG: BlinkConfig = {
  closeRatio: 0.6,
  openRatio: 0.8,
  minClosedMs: 45,
  maxClosedMs: 650,
  cooldownMs: 280,
  settleMs: 200,
  minCalibrationSamples: 12,
};

export type BlinkEvent = { t: number; durationMs: number };

export class BlinkDetector {
  cfg: BlinkConfig;
  baseline = 0;
  samples = 0;
  closed = false;
  closedSince = 0;
  lastBlinkAt = -Infinity;
  reacquiredAt = -Infinity;
  private wasValid = false;
  blinkCount = 0;

  constructor(cfg: Partial<BlinkConfig> = {}) {
    this.cfg = { ...DEFAULT_BLINK_CONFIG, ...cfg };
  }

  get calibrated(): boolean {
    return this.samples >= this.cfg.minCalibrationSamples && this.baseline > 0;
  }

  /** openness: raw eye-aspect value, or null when tracking is invalid this frame. */
  update(openness: number | null, t: number): BlinkEvent | null {
    if (openness === null || !Number.isFinite(openness) || openness < 0) {
      // Tracking loss: never let a lost face read as a closed eye.
      this.closed = false;
      this.wasValid = false;
      return null;
    }
    if (!this.wasValid) {
      this.wasValid = true;
      this.reacquiredAt = t;
    }

    const { closeRatio, openRatio } = this.cfg;
    // Baseline adaptation only from clearly-open frames.
    if (this.samples === 0) this.baseline = openness;
    else if (!this.closed && openness > this.baseline * openRatio) {
      const rate = openness > this.baseline ? 0.12 : 0.03;
      this.baseline += (openness - this.baseline) * rate;
    }
    this.samples++;
    if (!this.calibrated) return null;

    if (!this.closed) {
      const settled = t - this.reacquiredAt >= this.cfg.settleMs;
      const cooled = t - this.lastBlinkAt >= this.cfg.cooldownMs;
      if (openness < this.baseline * closeRatio && settled && cooled) {
        this.closed = true;
        this.closedSince = t;
      }
      return null;
    }

    // Currently closed
    if (openness > this.baseline * openRatio) {
      this.closed = false;
      const dur = t - this.closedSince;
      if (dur >= this.cfg.minClosedMs && dur <= this.cfg.maxClosedMs) {
        this.lastBlinkAt = t;
        this.blinkCount++;
        return { t, durationMs: dur };
      }
    }
    return null;
  }

  reset(): void {
    this.baseline = 0;
    this.samples = 0;
    this.closed = false;
    this.wasValid = false;
    this.lastBlinkAt = -Infinity;
    this.blinkCount = 0;
  }
}
