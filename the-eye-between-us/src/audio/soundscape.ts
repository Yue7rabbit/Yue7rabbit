import type { VisualState } from '../collective/visualState';
import { clamp01 } from '../utils/math';

/**
 * Pure mapping from the collective visual state to the soundscape's parameters.
 * Kept separate from Web Audio so it can be unit-tested.
 *
 *   energy      → brightness (filter cutoff)
 *   rhythm      → breathing rate of the pad
 *   tension     → a dissonant minor-second shadow under the drone
 *   fluidity    → reverb depth (space)
 *   openness    → upper voices of the pad
 *   turbulence  → level and movement of the "black hole" wind
 *   mood        → crossfade between a minor and a major third in the pad
 */
export type SoundParams = {
  cutoff: number; // Hz
  breathHz: number;
  dissonance: number; // 0..1
  reverb: number; // 0..1 wet
  upper: number; // 0..1
  wind: number; // 0..1
  windSweepHz: number;
  major: number; // 0 = minor third, 1 = major third
};

export function soundParams(s: VisualState, attention: number): SoundParams {
  const mood = clamp01(0.5 + (s.fluidity + s.openness - s.tension - 0.6) * 0.9);
  return {
    cutoff: 180 + s.energy * 900 + attention * 250,
    breathHz: 0.04 + s.rhythm * 0.14,
    dissonance: clamp01((s.tension - 0.35) * 1.6),
    reverb: clamp01(0.35 + s.fluidity * 0.5),
    upper: clamp01(0.25 + s.openness * 0.75),
    wind: clamp01(0.12 + s.turbulence * 0.7 + attention * 0.1),
    windSweepHz: 0.03 + s.energy * 0.08,
    major: mood,
  };
}

/** A-rooted modal scale (A Dorian) used for every pitched sound. */
export const ROOT_HZ = 55;
export const SCALE = [0, 2, 3, 5, 7, 9, 10]; // semitones

export function noteHz(degree: number, octave: number): number {
  const n = SCALE.length;
  const oct = octave + Math.floor(degree / n);
  const st = SCALE[((degree % n) + n) % n];
  return ROOT_HZ * Math.pow(2, oct + st / 12);
}
