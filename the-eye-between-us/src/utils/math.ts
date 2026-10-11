export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t: number): number {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t: number): number {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Frame-rate independent exponential smoothing factor.
 * Returns the fraction to move toward the target this frame so that
 * half the remaining distance is covered every `halfLifeMs`.
 */
export function dampFactor(dtMs: number, halfLifeMs: number): number {
  if (halfLifeMs <= 0) return 1;
  return 1 - Math.pow(0.5, dtMs / halfLifeMs);
}

export function damp(current: number, target: number, dtMs: number, halfLifeMs: number): number {
  return lerp(current, target, dampFactor(dtMs, halfLifeMs));
}

/** Cheap smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i + seed * 131.7);
  const b = hash1(i + 1 + seed * 131.7);
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2 - 1;
}

function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
