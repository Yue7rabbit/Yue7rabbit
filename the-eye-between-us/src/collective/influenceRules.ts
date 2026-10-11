import { clamp01, smoothstep } from '../utils/math';
import { VISUAL_KEYS, type VisualState } from './visualState';

export const DEFAULT_ALPHA = 0.22;

/** Bounded blend: next = current + alpha * (participant - current), per dimension. */
export function applyInfluence(
  current: VisualState,
  participant: VisualState,
  alpha: number = DEFAULT_ALPHA,
): VisualState {
  const a = clamp01(alpha);
  const out = { ...current };
  for (const k of VISUAL_KEYS) {
    out[k] = clamp01(current[k] + a * (participant[k] - current[k]));
  }
  return out;
}

/**
 * Emergent traits: non-linear combinations of dimensions that the renderer
 * turns into qualitatively different behaviour (not just "more" or "less").
 * Each value is in [0,1] and only becomes significant when BOTH inputs are high.
 */
export type EmergentTraits = {
  /** high energy + high fluidity → fast but smooth, long laminar sweeps */
  laminarRush: number;
  /** high tension + high fluidity → tightly curled flowing filaments */
  coiledFlow: number;
  /** high openness + high turbulence → wide pupil field, irregular periphery */
  frayedHorizon: number;
};

function pair(a: number, b: number): number {
  // Only lights up when both are above ~0.5; saturates near 0.85.
  return smoothstep(0.45, 0.85, a) * smoothstep(0.45, 0.85, b);
}

export function deriveEmergent(s: VisualState): EmergentTraits {
  return {
    laminarRush: pair(s.energy, s.fluidity),
    coiledFlow: pair(s.tension, s.fluidity),
    frayedHorizon: pair(s.openness, s.turbulence),
  };
}
