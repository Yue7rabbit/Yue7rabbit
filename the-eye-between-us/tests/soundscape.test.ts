import { describe, expect, it } from 'vitest';
import { ROOT_HZ, noteHz, soundParams } from '../src/audio/soundscape';
import { NEUTRAL_STATE } from '../src/collective/visualState';

describe('soundscape mapping', () => {
  it('energy brightens the background', () => {
    const calm = soundParams({ ...NEUTRAL_STATE, energy: 0.1 }, 0);
    const lively = soundParams({ ...NEUTRAL_STATE, energy: 0.9 }, 0);
    expect(lively.cutoff).toBeGreaterThan(calm.cutoff + 500);
  });

  it('tension adds dissonance and leans the pad minor', () => {
    const tense = soundParams({ ...NEUTRAL_STATE, tension: 0.9, fluidity: 0.2 }, 0);
    const soft = soundParams({ ...NEUTRAL_STATE, tension: 0.1, fluidity: 0.9, openness: 0.8 }, 0);
    expect(tense.dissonance).toBeGreaterThan(0.5);
    expect(soft.dissonance).toBe(0);
    expect(soft.major).toBeGreaterThan(tense.major + 0.5);
  });

  it('keeps every parameter in a safe range', () => {
    for (const v of [0, 1]) {
      const p = soundParams({ energy: v, tension: v, fluidity: v, density: v, openness: v, rhythm: v, turbulence: v }, v);
      for (const k of ['dissonance', 'reverb', 'upper', 'wind', 'major'] as const) {
        expect(p[k]).toBeGreaterThanOrEqual(0);
        expect(p[k]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('pitches stay in the A-rooted scale', () => {
    expect(noteHz(0, 0)).toBe(ROOT_HZ);
    expect(noteHz(7, 0)).toBeCloseTo(ROOT_HZ * 2, 6);
    expect(noteHz(4, 1)).toBeCloseTo(ROOT_HZ * 2 * Math.pow(2, 7 / 12), 6);
  });
});
