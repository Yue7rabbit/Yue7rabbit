import { VISUAL_KEYS, type VisualState } from './visualState';

export const DEFAULT_HALF_LIFE_MS = 25 * 60 * 1000; // 25 minutes

/** Fraction of the deviation from neutral that survives `elapsedMs`. */
export function decayFactor(elapsedMs: number, halfLifeMs: number = DEFAULT_HALF_LIFE_MS): number {
  if (!(elapsedMs > 0)) return 1;
  if (!(halfLifeMs > 0)) return 0;
  return Math.pow(0.5, elapsedMs / halfLifeMs);
}

/** memory = neutral + (memory - neutral) * factor — time-based, frame-rate independent. */
export function decayState(
  memory: VisualState,
  neutral: VisualState,
  elapsedMs: number,
  halfLifeMs: number = DEFAULT_HALF_LIFE_MS,
): VisualState {
  const f = decayFactor(elapsedMs, halfLifeMs);
  const out = { ...memory };
  for (const k of VISUAL_KEYS) out[k] = neutral[k] + (memory[k] - neutral[k]) * f;
  return out;
}
