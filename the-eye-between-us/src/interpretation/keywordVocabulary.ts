import type { VisualState } from '../collective/visualState';
import { clamp01 } from '../utils/math';

/**
 * Vocabulary grounded in two established affect models:
 *
 * 1. Russell's circumplex model of affect (Russell, 1980): emotions arranged on a
 *    circle spanned by valence (unpleasant ↔ pleasant) and arousal (deactivated ↔
 *    activated). Angles below follow the circumplex ordering of the adjectives.
 * 2. AffectNet's 8 categorical expressions (Mollahosseini et al., 2017), which is
 *    what the HSEmotion model (Savchenko, 2022) predicts alongside valence/arousal.
 *
 * Words describe the *expression the camera saw*, interpreted poetically —
 * not a diagnosis of what anyone feels inside.
 */
export const EMOTION_CLASSES = ['anger', 'contempt', 'disgust', 'fear', 'happiness', 'neutral', 'sadness', 'surprise'] as const;
export type EmotionClass = (typeof EMOTION_CLASSES)[number];

/** Circumplex adjectives at their angle (degrees, 0° = pleasant, 90° = activated). */
const CIRCUMPLEX: [string, number][] = [
  ['happy', 10],
  ['delighted', 28],
  ['excited', 48],
  ['astonished', 70],
  ['alarmed', 95],
  ['tense', 110],
  ['angry', 125],
  ['distressed', 145],
  ['sad', 200],
  ['gloomy', 220],
  ['tired', 250],
  ['calm', 290],
  ['relaxed', 305],
  ['serene', 320],
  ['content', 340],
];

export type KeywordEntry = {
  word: string;
  valence: number; // -1..1
  arousal: number; // -1..1
  intent: VisualState;
  kind: 'circumplex' | 'category' | 'neutral';
};

/** Category words' typical place on the circumplex (AffectNet annotation means, rounded). */
const CATEGORY_VA: Record<EmotionClass, [number, number]> = {
  anger: [-0.5, 0.6],
  contempt: [-0.45, 0.2],
  disgust: [-0.65, 0.35],
  fear: [-0.3, 0.75],
  happiness: [0.7, 0.25],
  neutral: [0, 0],
  sadness: [-0.6, -0.3],
  surprise: [0.15, 0.75],
};

/**
 * Theory-based mapping from affect to the eye's visual behaviour:
 *  arousal  → energy, rhythm (activation = speed & pulse)
 *  valence  → fluidity, openness (pleasant = flowing, open)
 *  unpleasant & activated (tense quadrant) → tension, turbulence
 *  pleasant & deactivated (calm quadrant) → smoothness, low density
 * Category probabilities add specific accents (surprise widens, anger agitates …).
 */
export function intentFromAffect(valence: number, arousal: number, probs?: Partial<Record<EmotionClass, number>>): VisualState {
  const v = Math.max(-1, Math.min(1, valence));
  const a = Math.max(-1, Math.min(1, arousal));
  const pos = Math.max(0, v);
  const neg = Math.max(0, -v);
  const hi = Math.max(0, a);
  const lo = Math.max(0, -a);
  const s: VisualState = {
    energy: 0.4 + 0.5 * a,
    rhythm: 0.42 + 0.48 * a,
    tension: 0.3 + 0.6 * neg * (0.5 + hi) + 0.15 * hi - 0.2 * pos * lo,
    fluidity: 0.5 + 0.38 * pos + 0.25 * lo - 0.35 * neg * hi,
    openness: 0.5 + 0.3 * v + 0.2 * hi * (pos + 0.3) - 0.15 * lo,
    density: 0.5 + 0.25 * neg + 0.15 * hi - 0.15 * lo * pos,
    turbulence: 0.18 + 0.5 * hi * (0.4 + neg) + 0.1 * neg,
  };
  if (probs) {
    const p = (k: EmotionClass) => probs[k] ?? 0;
    s.openness += 0.25 * p('surprise') + 0.1 * p('fear') + 0.1 * p('happiness') - 0.15 * p('sadness');
    s.turbulence += 0.1 * p('surprise') + 0.15 * p('anger') - 0.1 * p('neutral');
    s.tension += 0.2 * p('fear') + 0.2 * p('anger') + 0.1 * p('disgust');
    s.density += 0.15 * (p('disgust') + p('contempt'));
    s.fluidity += 0.12 * p('happiness') - 0.15 * (p('disgust') + p('contempt'));
    s.energy -= 0.15 * p('sadness');
  }
  for (const k of Object.keys(s) as (keyof VisualState)[]) s[k] = clamp01(s[k]);
  return s;
}

const RADIUS = 0.8;
export const VOCABULARY: readonly KeywordEntry[] = [
  ...CIRCUMPLEX.map(([word, deg]) => {
    const r = (deg * Math.PI) / 180;
    const valence = Math.cos(r) * RADIUS;
    const arousal = Math.sin(r) * RADIUS;
    return { word, valence, arousal, intent: intentFromAffect(valence, arousal), kind: 'circumplex' as const };
  }),
  { word: 'still', valence: 0, arousal: 0, intent: intentFromAffect(0, 0, { neutral: 1 }), kind: 'neutral' as const },
  ...EMOTION_CLASSES.filter((c) => c !== 'neutral').map((c) => {
    const [valence, arousal] = CATEGORY_VA[c];
    return { word: c, valence, arousal, intent: intentFromAffect(valence, arousal, { [c]: 1 }), kind: 'category' as const };
  }),
];

export const VOCAB_WORDS: readonly string[] = VOCABULARY.map((v) => v.word);
export const CIRCUMPLEX_WORDS: readonly string[] = CIRCUMPLEX.map(([w]) => w);

export function findKeyword(word: string): KeywordEntry | undefined {
  const w = word.trim().toLowerCase();
  return VOCABULARY.find((v) => v.word === w);
}

/** Nearest circumplex adjective for a (valence, arousal) point; 'still' near the centre. */
export function circumplexWord(valence: number, arousal: number, neutralRadius = 0.12): string {
  if (Math.hypot(valence, arousal) < neutralRadius) return 'still';
  let deg = (Math.atan2(arousal, valence) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  let best = CIRCUMPLEX[0][0];
  let bestD = Infinity;
  for (const [w, d] of CIRCUMPLEX) {
    const diff = Math.min(Math.abs(d - deg), 360 - Math.abs(d - deg));
    if (diff < bestD) {
      bestD = diff;
      best = w;
    }
  }
  return best;
}
