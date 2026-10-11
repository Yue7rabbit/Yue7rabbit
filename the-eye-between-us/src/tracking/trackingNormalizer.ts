import { clamp, clamp01, damp } from '../utils/math';
import type { Landmark } from './faceTracker';

/** Immediate per-frame interaction signal. Never written into collective memory. */
export type LiveSample = {
  present: boolean;
  /** -1..1, screen space (negative = screen left). Approximate: head pose + iris, auto-centred. */
  gazeX: number;
  gazeY: number;
  gazeIsApproximation: boolean;
  /** Raw eye aspect ratio (for blink detection). */
  rawOpenness: number;
  /** 0..1, 0.5 = this face's typical openness. */
  openness: number;
  /** Face widths per second. */
  movement: number;
  /** Face centre in the camera image (0..1) — used only to keep tracking the same person. */
  faceX: number;
  faceY: number;
};

export const EMPTY_SAMPLE: LiveSample = {
  present: false,
  gazeX: 0,
  gazeY: 0,
  gazeIsApproximation: true,
  rawOpenness: 0,
  openness: 0.5,
  movement: 0,
  faceX: 0.5,
  faceY: 0.5,
};

// MediaPipe Face Mesh indices
const EYE_A = [33, 160, 158, 133, 153, 144];
const EYE_B = [362, 385, 387, 263, 373, 380];
const IRIS_A = 468;
const IRIS_B = 473;

function dist(a: Landmark, b: Landmark, aspect: number): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

export function eyeAspectRatio(lm: Landmark[], idx: number[], aspect: number): number {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => lm[i]);
  const w = dist(p1, p4, aspect);
  if (w <= 1e-6) return 0;
  return (dist(p2, p6, aspect) + dist(p3, p5, aspect)) / (2 * w);
}

export class TrackingNormalizer {
  /** Mirror horizontal gaze if the camera is mounted/mirrored unusually. */
  invertX = false;
  private sample: LiveSample = { ...EMPTY_SAMPLE };
  private openBaseline = 0;
  private centerX = 0;
  private centerY = 0;
  private centerSamples = 0;
  private prevNose: { x: number; y: number; t: number } | null = null;

  /** Start a new participant: re-learn their neutral gaze and openness. */
  recalibrate(): void {
    this.centerSamples = 0;
    this.openBaseline = 0;
    this.prevNose = null;
  }

  process(lm: Landmark[] | null, aspect: number, t: number, dtMs: number): LiveSample {
    const s = this.sample;
    if (!lm || lm.length < 478) {
      s.present = false;
      s.movement = damp(s.movement, 0, dtMs, 300);
      this.prevNose = null;
      return { ...s };
    }

    // Eye openness (EAR), adaptive to this face.
    const ear = (eyeAspectRatio(lm, EYE_A, aspect) + eyeAspectRatio(lm, EYE_B, aspect)) / 2;
    if (this.openBaseline === 0) this.openBaseline = ear;
    else if (ear > this.openBaseline * 0.8) this.openBaseline = damp(this.openBaseline, ear, dtMs, 2500);
    const rel = this.openBaseline > 0 ? ear / this.openBaseline : 1;

    // Head orientation from nose relative to face outline.
    const nose = lm[1];
    const cheekL = lm[234];
    const cheekR = lm[454];
    const top = lm[10];
    const chin = lm[152];
    const yaw = ((nose.x - cheekL.x) / Math.max(1e-4, cheekR.x - cheekL.x) - 0.5) * 2;
    const pitch = ((nose.y - top.y) / Math.max(1e-4, chin.y - top.y) - 0.55) * 2;

    // Iris position within each eye opening.
    const irisRatioX =
      ((lm[IRIS_A].x - lm[33].x) / Math.max(1e-4, lm[133].x - lm[33].x) +
        (lm[IRIS_B].x - lm[362].x) / Math.max(1e-4, lm[263].x - lm[362].x)) / 2;
    const irisRatioY =
      ((lm[IRIS_A].y - lm[159].y) / Math.max(1e-4, lm[145].y - lm[159].y) +
        (lm[IRIS_B].y - lm[386].y) / Math.max(1e-4, lm[374].y - lm[386].y)) / 2;

    // Image space → screen space: an unmirrored camera sees the viewer's left on image right.
    let gx = -(yaw * 0.9 + (irisRatioX - 0.5) * 2.6);
    let gy = pitch * 0.9 + (irisRatioY - 0.5) * 1.2;
    if (this.invertX) gx = -gx;

    // Auto-centre: the first ~second establishes this person's neutral, then drift slowly.
    this.centerSamples++;
    const hl = this.centerSamples < 30 ? 120 : 9000;
    this.centerX = damp(this.centerX, gx, dtMs, hl);
    this.centerY = damp(this.centerY, gy, dtMs, hl);
    const faceScreenX = (this.invertX ? 1 : -1) * ((nose.x - 0.5) * 2);
    const targetX = clamp((gx - this.centerX) * 1.6 + faceScreenX * 0.6, -1, 1);
    const targetY = clamp((gy - this.centerY) * 1.8 + (nose.y - 0.5) * 0.8, -1, 1);

    // Movement: nose displacement in face widths / second.
    const faceW = Math.max(1e-3, dist(cheekL, cheekR, aspect));
    let speed = 0;
    if (this.prevNose && t > this.prevNose.t) {
      const d = Math.hypot((nose.x - this.prevNose.x) * aspect, nose.y - this.prevNose.y) / faceW;
      speed = d / ((t - this.prevNose.t) / 1000);
    }
    this.prevNose = { x: nose.x, y: nose.y, t };

    s.present = true;
    s.gazeIsApproximation = true;
    s.gazeX = damp(s.gazeX, targetX, dtMs, 90);
    s.gazeY = damp(s.gazeY, targetY, dtMs, 110);
    s.rawOpenness = ear;
    s.openness = damp(s.openness, clamp01(0.5 + (rel - 1) * 1.4), dtMs, 40);
    s.movement = damp(s.movement, Math.min(speed, 3), dtMs, 250);
    s.faceX = (cheekL.x + cheekR.x) / 2;
    s.faceY = (top.y + chin.y) / 2;
    return { ...s };
  }
}
