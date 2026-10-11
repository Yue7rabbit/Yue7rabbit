import { clamp01 } from '../utils/math';

export type VisualState = {
  energy: number;
  tension: number;
  fluidity: number;
  density: number;
  openness: number;
  rhythm: number;
  turbulence: number;
};

export type VisualKey = keyof VisualState;

export const VISUAL_KEYS: readonly VisualKey[] = [
  'energy',
  'tension',
  'fluidity',
  'density',
  'openness',
  'rhythm',
  'turbulence',
] as const;

export const NEUTRAL_STATE: Readonly<VisualState> = Object.freeze({
  energy: 0.35,
  tension: 0.35,
  fluidity: 0.5,
  density: 0.5,
  openness: 0.5,
  rhythm: 0.45,
  turbulence: 0.25,
});

export function cloneState(s: VisualState): VisualState {
  return { ...s };
}

/**
 * Coerce arbitrary input into a valid VisualState.
 * Missing / non-numeric fields fall back to `fallback`; everything is clamped to [0,1].
 */
export function normalizeState(input: unknown, fallback: VisualState = NEUTRAL_STATE): VisualState {
  const out = cloneState(fallback);
  if (!input || typeof input !== 'object') return out;
  const rec = input as Record<string, unknown>;
  for (const k of VISUAL_KEYS) {
    const v = rec[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = clamp01(v);
  }
  return out;
}

export function stateDistance(a: VisualState, b: VisualState): number {
  let s = 0;
  for (const k of VISUAL_KEYS) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s);
}
