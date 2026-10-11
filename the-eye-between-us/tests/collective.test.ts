import { describe, expect, it } from 'vitest';
import { CollectiveEngine, describeChange } from '../src/collective/collectiveEngine';
import { applyInfluence, deriveEmergent } from '../src/collective/influenceRules';
import { decayFactor, decayState } from '../src/collective/memoryDecay';
import { deserializeInto, serialize } from '../src/collective/persistence';
import { NEUTRAL_STATE, VISUAL_KEYS, normalizeState, type VisualState } from '../src/collective/visualState';
import { clamp01 } from '../src/utils/math';

const HIGH: VisualState = { energy: 1, tension: 1, fluidity: 1, density: 1, openness: 1, rhythm: 1, turbulence: 1 };

describe('state normalisation & clamping', () => {
  it('clamps out-of-range and NaN values', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(7)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
    const s = normalizeState({ energy: 2, tension: -1, fluidity: 'x', density: NaN, openness: 0.3 });
    expect(s.energy).toBe(1);
    expect(s.tension).toBe(0);
    expect(s.fluidity).toBe(NEUTRAL_STATE.fluidity);
    expect(s.density).toBe(NEUTRAL_STATE.density);
    expect(s.openness).toBe(0.3);
  });

  it('returns neutral for garbage input', () => {
    expect(normalizeState(null)).toEqual({ ...NEUTRAL_STATE });
    expect(normalizeState('nope')).toEqual({ ...NEUTRAL_STATE });
  });
});

describe('influence', () => {
  it('moves each dimension alpha of the way toward the participant', () => {
    const next = applyInfluence(NEUTRAL_STATE, HIGH, 0.22);
    for (const k of VISUAL_KEYS) expect(next[k]).toBeCloseTo(NEUTRAL_STATE[k] + 0.22 * (1 - NEUTRAL_STATE[k]), 10);
  });

  it('stays bounded in [0,1] even with extreme alpha', () => {
    const next = applyInfluence(NEUTRAL_STATE, HIGH, 5);
    for (const k of VISUAL_KEYS) expect(next[k]).toBeLessThanOrEqual(1);
  });

  it('B starts from the state A left (no reset between participants)', () => {
    const e = new CollectiveEngine({ now: 0 });
    const a = e.commit({ id: 'a', seed: 1, signature: HIGH, keywords: ['restless'], pos: { x: 0.1, y: 0.1 } }, 0);
    const b = e.commit({ id: 'b', seed: 2, signature: { ...NEUTRAL_STATE, energy: 0 }, keywords: ['soft'], pos: { x: 0.9, y: 0.1 } }, 0);
    expect(b.before).toEqual(a.after);
    expect(e.memory).not.toEqual(NEUTRAL_STATE);
    expect(e.participantCount).toBe(2);
  });

  it('emergent traits only appear when both dimensions are high', () => {
    expect(deriveEmergent(NEUTRAL_STATE as VisualState).laminarRush).toBe(0);
    expect(deriveEmergent({ ...NEUTRAL_STATE, energy: 0.95, fluidity: 0.2 }).laminarRush).toBe(0);
    expect(deriveEmergent({ ...NEUTRAL_STATE, energy: 0.95, fluidity: 0.95 }).laminarRush).toBeGreaterThan(0.9);
    expect(deriveEmergent({ ...NEUTRAL_STATE, tension: 0.9, fluidity: 0.9 }).coiledFlow).toBeGreaterThan(0.8);
    expect(deriveEmergent({ ...NEUTRAL_STATE, openness: 0.9, turbulence: 0.9 }).frayedHorizon).toBeGreaterThan(0.8);
  });
});

describe('statements', () => {
  it('names the largest real change and its true direction', () => {
    expect(describeChange(NEUTRAL_STATE, { ...NEUTRAL_STATE, openness: 0.6 })).toBe('YOU LEFT IT MORE OPEN.');
    expect(describeChange(NEUTRAL_STATE, { ...NEUTRAL_STATE, openness: 0.4 })).toBe('YOU LEFT IT MORE GUARDED.');
    expect(describeChange(NEUTRAL_STATE, { ...NEUTRAL_STATE, rhythm: 0.6, openness: 0.52 })).toBe('YOU CHANGED ITS RHYTHM.');
  });
  it('does not invent a change that did not happen', () => {
    expect(describeChange(NEUTRAL_STATE, { ...NEUTRAL_STATE, energy: NEUTRAL_STATE.energy + 0.001 })).toBe('YOU MET IT WHERE IT WAS.');
  });
});

describe('memory decay', () => {
  it('halves the deviation after one half-life', () => {
    const m = { ...NEUTRAL_STATE, energy: 0.95 };
    const d = decayState(m, NEUTRAL_STATE, 1000, 1000);
    expect(d.energy - NEUTRAL_STATE.energy).toBeCloseTo((0.95 - NEUTRAL_STATE.energy) / 2, 10);
  });

  it('is frame-rate independent', () => {
    const start = { ...NEUTRAL_STATE, energy: 0.95, openness: 0.1 };
    const H = 25 * 60_000;
    const total = 10 * 60_000;
    const run = (stepMs: number) => {
      let s = start;
      for (let t = 0; t < total; t += stepMs) s = decayState(s, NEUTRAL_STATE, stepMs, H);
      return s;
    };
    const at60 = run(1000 / 60);
    const at24 = run(1000 / 24);
    const once = decayState(start, NEUTRAL_STATE, total, H);
    for (const k of VISUAL_KEYS) {
      expect(at60[k]).toBeCloseTo(once[k], 6);
      expect(at24[k]).toBeCloseTo(once[k], 6);
    }
  });

  it('engine.tick decays by elapsed wall time, not by call count', () => {
    const a = new CollectiveEngine({ now: 0, halfLifeMs: 60_000 });
    const b = new CollectiveEngine({ now: 0, halfLifeMs: 60_000 });
    a.memory.energy = b.memory.energy = 0.9;
    for (let t = 100; t <= 30_000; t += 100) a.tick(t);
    b.tick(30_000);
    expect(a.memory.energy).toBeCloseTo(b.memory.energy, 9);
    expect(decayFactor(-5)).toBe(1);
  });

  it('does not effectively reset between participants (default half-life)', () => {
    const e = new CollectiveEngine({ now: 0 });
    e.commit({ id: 'a', seed: 1, signature: HIGH, keywords: ['restless'], pos: { x: 0, y: 0 } }, 0);
    const after = e.memory.energy;
    e.tick(60_000); // next visitor arrives a minute later
    expect(e.memory.energy - NEUTRAL_STATE.energy).toBeGreaterThan((after - NEUTRAL_STATE.energy) * 0.95);
  });
});

describe('persistence', () => {
  it('round-trips the collective state', () => {
    const e = new CollectiveEngine({ now: 1000 });
    e.commit({ id: 'x1', seed: 42, signature: HIGH, keywords: ['curious', 'restless'], pos: { x: 0.2, y: 0.3 } }, 1000);
    const json = serialize(e);
    const f = new CollectiveEngine();
    expect(deserializeInto(f, json)).toBe(true);
    expect(f.memory).toEqual(e.memory);
    expect(f.eyes).toEqual(e.eyes);
    expect(f.participantCount).toBe(1);
  });

  it('never serialises anything but derived visual data', () => {
    const e = new CollectiveEngine({ now: 0 });
    e.commit({ id: 'x', seed: 3, signature: HIGH, keywords: ['soft'], pos: { x: 0.5, y: 0.1 } }, 0);
    const keys = Object.keys(JSON.parse(serialize(e)).eyes[0]).sort();
    expect(keys).toEqual(['createdAt', 'id', 'influence', 'keywords', 'pos', 'seed', 'signature']);
  });

  it('rejects corrupt or foreign data without touching the engine', () => {
    const e = new CollectiveEngine({ now: 0 });
    e.memory.energy = 0.77;
    expect(deserializeInto(e, '{not json')).toBe(false);
    expect(deserializeInto(e, JSON.stringify({ version: 99 }))).toBe(false);
    expect(e.memory.energy).toBe(0.77);
  });

  it('sanitises out-of-range values in stored data', () => {
    const e = new CollectiveEngine();
    const ok = deserializeInto(
      e,
      JSON.stringify({
        version: 1,
        memory: { energy: 4 },
        lastDecayAt: 5,
        participantCount: -2,
        halfLifeMs: 60000,
        eyes: [{ id: 'q', seed: 9, signature: { tension: -1 }, pos: { x: 3, y: -1 } }, { bogus: true }],
      }),
    );
    expect(ok).toBe(true);
    expect(e.memory.energy).toBe(1);
    expect(e.participantCount).toBe(0);
    expect(e.eyes).toHaveLength(1);
    expect(e.eyes[0].signature.tension).toBe(0);
    expect(e.eyes[0].pos).toEqual({ x: 1, y: 0 });
  });
});
