import { EMOTION_CLASSES, type EmotionClass } from '../interpretation/keywordVocabulary';
import { EMPTY_SAMPLE, type LiveSample } from '../tracking/trackingNormalizer';
import { noise1 } from '../utils/math';

export type PresetName = 'excited' | 'serene' | 'tense' | 'gloomy' | 'astonished';

type Preset = {
  movement: number; // face widths / s
  blinkEveryMs: number;
  openness: number;
  gazeAmp: number;
  gazeSpeed: number;
  gazeBias: [number, number];
  valence: number; // what the expression model would report (−1..1)
  arousal: number;
  expression: Partial<Record<EmotionClass, number>>;
};

/** Behaviour + expression scripts that feed the real pipeline exactly like the camera would. */
export const PRESETS: Record<PresetName, Preset> = {
  excited: {
    movement: 0.34, blinkEveryMs: 2600, openness: 0.62, gazeAmp: 0.32, gazeSpeed: 1.3, gazeBias: [0, -0.05],
    valence: 0.42, arousal: 0.48, expression: { happiness: 0.6, surprise: 0.25, neutral: 0.15 },
  },
  serene: {
    movement: 0.08, blinkEveryMs: 4800, openness: 0.45, gazeAmp: 0.12, gazeSpeed: 0.25, gazeBias: [-0.15, 0.1],
    valence: 0.36, arousal: -0.34, expression: { neutral: 0.55, happiness: 0.4, sadness: 0.05 },
  },
  tense: {
    movement: 0.26, blinkEveryMs: 2900, openness: 0.58, gazeAmp: 0.22, gazeSpeed: 1.1, gazeBias: [0.2, -0.05],
    valence: -0.2, arousal: 0.55, expression: { anger: 0.42, fear: 0.18, neutral: 0.3, disgust: 0.1 },
  },
  gloomy: {
    movement: 0.08, blinkEveryMs: 3600, openness: 0.32, gazeAmp: 0.18, gazeSpeed: 0.2, gazeBias: [0.1, 0.25],
    valence: -0.4, arousal: -0.3, expression: { sadness: 0.55, neutral: 0.4, contempt: 0.05 },
  },
  astonished: {
    movement: 0.2, blinkEveryMs: 5200, openness: 0.82, gazeAmp: 0.3, gazeSpeed: 0.7, gazeBias: [0, -0.15],
    valence: 0.2, arousal: 0.6, expression: { surprise: 0.65, fear: 0.1, happiness: 0.1, neutral: 0.15 },
  },
};

export const DEMO_SEQUENCE: PresetName[] = ['excited', 'serene', 'tense'];
export const DEFAULT_PRESENT_MS = 8200;

export class SimulatedParticipant {
  readonly preset: PresetName;
  readonly startedAt: number;
  readonly presentMs: number;
  private nextBlinkAt: number;
  private seed: number;

  constructor(preset: PresetName, now: number, presentMs = DEFAULT_PRESENT_MS) {
    this.preset = preset;
    this.startedAt = now;
    this.presentMs = presentMs;
    this.seed = preset.length * 17 + 3;
    this.nextBlinkAt = now + 1600 + PRESETS[preset].blinkEveryMs * 0.4;
  }

  done(now: number): boolean {
    return now > this.startedAt + this.presentMs + 2600;
  }

  /** What the expression model would output for this frame (with natural fluctuation). */
  emotion(now: number): { probs: Record<EmotionClass, number>; valence: number; arousal: number; t: number } | null {
    const el = now - this.startedAt;
    if (el > this.presentMs) return null;
    const p = PRESETS[this.preset];
    const ts = el / 1000;
    const probs = {} as Record<EmotionClass, number>;
    let sum = 0;
    EMOTION_CLASSES.forEach((c, i) => {
      sum += probs[c] = Math.max(0.005, (p.expression[c] ?? 0.01) * (1 + 0.25 * noise1(ts * 0.8, this.seed + i)));
    });
    for (const c of EMOTION_CLASSES) probs[c] /= sum;
    return {
      probs,
      valence: p.valence + 0.08 * noise1(ts * 0.6, this.seed + 20),
      arousal: p.arousal + 0.08 * noise1(ts * 0.7, this.seed + 30),
      t: now,
    };
  }

  sample(now: number): { sample: LiveSample; blink: boolean } {
    const p = PRESETS[this.preset];
    const el = now - this.startedAt;
    if (el > this.presentMs) return { sample: { ...EMPTY_SAMPLE }, blink: false };
    const ts = el / 1000;
    const gx = p.gazeBias[0] + p.gazeAmp * (Math.sin(ts * p.gazeSpeed * 2.1) * 0.8 + noise1(ts * p.gazeSpeed * 3, this.seed) * 0.6);
    const gy = p.gazeBias[1] + p.gazeAmp * (Math.sin(ts * p.gazeSpeed * 1.6 + 1) * 0.7 + noise1(ts * p.gazeSpeed * 2.5, this.seed + 5) * 0.6);
    let blink = false;
    if (now >= this.nextBlinkAt) {
      blink = true;
      this.nextBlinkAt = now + p.blinkEveryMs * (0.85 + 0.3 * (0.5 + 0.5 * noise1(ts, this.seed + 9)));
    }
    return {
      blink,
      sample: {
        present: true,
        gazeX: Math.max(-1, Math.min(1, gx)),
        gazeY: Math.max(-1, Math.min(1, gy)),
        gazeIsApproximation: true,
        rawOpenness: 0.3,
        openness: p.openness + 0.03 * Math.sin(ts * 0.9),
        movement: p.movement * (0.85 + 0.3 * (0.5 + 0.5 * noise1(ts * 2, this.seed + 2))),
        faceX: 0.5,
        faceY: 0.5,
      },
    };
  }
}
