import { EMOTION_CLASSES, type EmotionClass } from '../interpretation/keywordVocabulary';
import type { EmotionSummary } from '../interpretation/schemas';

/** Running mean of expression estimates over one session (constant memory). */
export class EmotionAccumulator {
  private n = 0;
  private v = 0;
  private a = 0;
  private p = new Float64Array(EMOTION_CLASSES.length);

  reset(): void {
    this.n = this.v = this.a = 0;
    this.p.fill(0);
  }

  add(sample: { probs: Record<EmotionClass, number>; valence: number; arousal: number }): void {
    this.n++;
    this.v += sample.valence;
    this.a += sample.arousal;
    EMOTION_CLASSES.forEach((c, i) => (this.p[i] += sample.probs[c] ?? 0));
  }

  get samples(): number {
    return this.n;
  }

  summary(): EmotionSummary | null {
    if (this.n === 0) return null;
    const probs = {} as Record<EmotionClass, number>;
    EMOTION_CLASSES.forEach((c, i) => (probs[c] = this.p[i] / this.n));
    return { valence: this.v / this.n, arousal: this.a / this.n, probs, samples: this.n };
  }
}
