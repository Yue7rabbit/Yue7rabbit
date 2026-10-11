import { NEUTRAL_STATE, normalizeState, type VisualState } from '../collective/visualState';
import { clamp01 } from '../utils/math';
import { EMOTION_CLASSES, findKeyword, type EmotionClass } from './keywordVocabulary';

/** Summarised, non-biometric interaction features. All values in [0,1]. */
export type BehaviorFeatures = {
  movementIntensity: number;
  blinkRate: number;
  eyeOpenness: number;
  gazeVariation: number;
  stability: number;
};

export const FEATURE_KEYS: readonly (keyof BehaviorFeatures)[] = [
  'movementIntensity',
  'blinkRate',
  'eyeOpenness',
  'gazeVariation',
  'stability',
];

/** Session-averaged facial-expression estimate (HSEmotion / AffectNet). */
export type EmotionSummary = {
  valence: number; // -1..1
  arousal: number; // -1..1
  probs: Record<EmotionClass, number>; // sums to ~1
  samples: number;
};

export type Interpretation = {
  keywords: string[]; // 1–2 words, always from the controlled vocabulary
  visualIntent: VisualState;
  source: 'ai' | 'local';
};

export function normalizeFeatures(input: Partial<BehaviorFeatures> | undefined): BehaviorFeatures {
  const out = { movementIntensity: 0.3, blinkRate: 0.3, eyeOpenness: 0.5, gazeVariation: 0.3, stability: 0.6 };
  if (!input) return out;
  for (const k of FEATURE_KEYS) {
    const v = input[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = clamp01(v);
  }
  return out;
}

export function normalizeEmotion(input: unknown): EmotionSummary | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const samples = Math.max(0, Math.floor(num(r.samples)));
  if (samples === 0) return null;
  const rawProbs = (r.probs ?? {}) as Record<string, unknown>;
  const probs = {} as Record<EmotionClass, number>;
  let sum = 0;
  for (const c of EMOTION_CLASSES) sum += probs[c] = Math.max(0, num(rawProbs[c]));
  if (sum > 0) for (const c of EMOTION_CLASSES) probs[c] /= sum;
  else probs.neutral = 1;
  return {
    valence: Math.max(-1, Math.min(1, num(r.valence))),
    arousal: Math.max(-1, Math.min(1, num(r.arousal))),
    probs,
    samples,
  };
}

/**
 * Validate an untrusted interpretation (e.g. from a remote model).
 * - keywords are filtered to the controlled vocabulary, deduped, max 2
 * - visualIntent fields are clamped; missing ones are filled from the primary keyword
 * Returns null if nothing usable remains.
 */
export function validateInterpretation(raw: unknown, source: 'ai' | 'local' = 'ai'): Interpretation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.keywords)) return null;
  const keywords: string[] = [];
  for (const k of r.keywords) {
    if (typeof k !== 'string') continue;
    const entry = findKeyword(k);
    if (entry && !keywords.includes(entry.word)) keywords.push(entry.word);
    if (keywords.length === 2) break;
  }
  if (keywords.length === 0) return null;
  const base = findKeyword(keywords[0])?.intent ?? NEUTRAL_STATE;
  return { keywords, visualIntent: normalizeState(r.visualIntent, base), source };
}
