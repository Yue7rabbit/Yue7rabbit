import { VISUAL_KEYS } from '../collective/visualState';
import { clamp, clamp01 } from '../utils/math';
import { EMOTION_CLASSES, VOCABULARY, circumplexWord, intentFromAffect, type EmotionClass } from './keywordVocabulary';
import { normalizeFeatures, type BehaviorFeatures, type EmotionSummary, type Interpretation } from './schemas';

/** Minimum probability for a categorical expression to be named as a second word. */
export const CATEGORY_THRESHOLD = 0.3;

/** Where on the circumplex this encounter sits (expression model if present, else behaviour). */
function affectPoint(f: BehaviorFeatures, emotion?: EmotionSummary | null): { v: number; a: number; probs?: Record<EmotionClass, number> } {
  if (emotion && emotion.samples > 0) {
    // The model's V/A are conservative (most faces sit near the centre), so stretch slightly.
    return { v: clamp(emotion.valence * 1.35, -1, 1), a: clamp(emotion.arousal * 1.35, -1, 1), probs: emotion.probs };
  }
  return {
    a: clamp(-0.7 + 1.5 * (0.45 * f.movementIntensity + 0.3 * f.blinkRate + 0.25 * f.gazeVariation), -1, 1),
    v: clamp(0.25 * (f.stability - 0.5) + 0.2 * (f.eyeOpenness - 0.5), -1, 1),
  };
}

export type RankedWord = { word: string; weight: number };

/**
 * The top-5 emotion keywords for an encounter, strongest first, weights summing to 1.
 * Circumplex adjectives are scored by closeness to the (valence, arousal) point; AffectNet
 * categories by their predicted probability. The circumplex word nearest the point is
 * always ranked first, so it matches the interpretation's primary keyword.
 */
export function rankKeywords(input: Partial<BehaviorFeatures>, emotion?: EmotionSummary | null, top = 5): RankedWord[] {
  const f = normalizeFeatures(input);
  const { v, a, probs } = affectPoint(f, emotion);
  const scored = VOCABULARY.map((e) => {
    let score: number;
    if (e.kind === 'category') {
      score = probs ? (probs[e.word as EmotionClass] ?? 0) * 1.1 : 0.4 * Math.exp(-((v - e.valence) ** 2 + (a - e.arousal) ** 2) / 0.12);
    } else {
      score = Math.exp(-((v - e.valence) ** 2 + (a - e.arousal) ** 2) / 0.18);
      if (e.kind === 'neutral' && probs) score = Math.max(score, probs.neutral);
    }
    return { word: e.word, weight: score };
  }).sort((x, y) => y.weight - x.weight || x.word.localeCompare(y.word));
  const primary = circumplexWord(v, a);
  const head = scored.find((x) => x.word === primary)!;
  const rest = scored.filter((x) => x.word !== primary);
  const picked = [{ word: primary, weight: Math.max(head.weight, rest[0]?.weight ?? 0) * 1.05 }, ...rest.slice(0, top - 1)];
  const total = picked.reduce((sum, x) => sum + x.weight, 0) || 1;
  return picked.map((x) => ({ word: x.word, weight: x.weight / total }));
}

/**
 * Deterministic interpretation, fully offline.
 *
 * With a facial-expression estimate (HSEmotion):
 *   primary   = circumplex adjective nearest to the mean (valence, arousal)
 *   secondary = the dominant AffectNet category, if it is clear and not neutral
 *   intent    = intentFromAffect(v, a, category probabilities) + small behaviour nudges
 *
 * Without one (model unavailable): arousal is approximated from movement, blinking
 * and gaze activity; valence is treated as unknown (≈0) except for a slight lift
 * from steady, open eyes. This is explicitly an approximation.
 */
export function interpretLocally(input: Partial<BehaviorFeatures>, emotion?: EmotionSummary | null): Interpretation {
  const f = normalizeFeatures(input);
  const { v, a, probs } = affectPoint(f, emotion);
  const keywords: string[] = [circumplexWord(v, a)];
  if (probs) {
    let top: EmotionClass = 'neutral';
    for (const c of EMOTION_CLASSES) if (probs[c] > probs[top]) top = c;
    if (top !== 'neutral' && probs[top] >= CATEGORY_THRESHOLD && !keywords.includes(top)) keywords.push(top);
  }

  const intent = intentFromAffect(v, a, probs);
  // Behaviour still colours the reading so two "calm" encounters differ.
  intent.energy += (f.movementIntensity - 0.4) * 0.12;
  intent.rhythm += (f.blinkRate - 0.35) * 0.15;
  intent.openness += (f.eyeOpenness - 0.5) * 0.2;
  intent.turbulence += (f.gazeVariation - 0.4) * 0.12;
  intent.density += (f.stability - 0.5) * 0.1;
  for (const k of VISUAL_KEYS) intent[k] = clamp01(intent[k]);

  return { keywords, visualIntent: intent, source: 'local' };
}
