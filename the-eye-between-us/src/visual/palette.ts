export const BG = '#03050b';
export type RGB = readonly [number, number, number];
export const IVORY: RGB = [231, 227, 218];
export const MIST: RGB = [141, 169, 200];
export const AMBER: RGB = [175, 183, 204];
export const GRAY: RGB = [116, 123, 137];

export function rgba(c: RGB, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a < 0 ? 0 : a > 1 ? 1 : a.toFixed(3)})`;
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export type Quality = 'high' | 'medium' | 'low';
export const QUALITY: Record<Quality, { fibers: number; atmosphere: number; dprCap: number; glyphParticles: number }> = {
  high: { fibers: 1, atmosphere: 90, dprCap: 2, glyphParticles: 900 },
  medium: { fibers: 0.72, atmosphere: 65, dprCap: 1.5, glyphParticles: 650 },
  low: { fibers: 0.45, atmosphere: 60, dprCap: 1, glyphParticles: 400 },
};
