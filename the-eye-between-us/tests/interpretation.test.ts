import { describe, expect, it, vi } from 'vitest';
import { CollectiveEngine } from '../src/collective/collectiveEngine';
import { NEUTRAL_STATE, VISUAL_KEYS, stateDistance } from '../src/collective/visualState';
import { DEMO_SEQUENCE, PRESETS, SimulatedParticipant, type PresetName } from '../src/debug/simulatedParticipant';
import { EmotionAccumulator } from '../src/interaction/emotionAccumulator';
import { FeatureAccumulator } from '../src/interaction/featureAccumulator';
import { SessionManager } from '../src/interaction/sessionManager';
import { Interpreter } from '../src/interpretation/aiInterpreter';
import { VOCAB_WORDS, circumplexWord, intentFromAffect } from '../src/interpretation/keywordVocabulary';
import { interpretLocally, rankKeywords } from '../src/interpretation/localInterpreter';
import { normalizeEmotion, validateInterpretation, type EmotionSummary } from '../src/interpretation/schemas';
import { decode, faceCrop, toTensor } from '../src/tracking/emotionModel';

const FEATURES = { movementIntensity: 0.7, blinkRate: 0.6, eyeOpenness: 0.5, gazeVariation: 0.7, stability: 0.3 };

describe('AI output validation', () => {
  it('accepts a well-formed response', () => {
    const r = validateInterpretation({ keywords: ['Excited', 'surprise'], visualIntent: { energy: 0.8, openness: 0.7 } });
    expect(r?.keywords).toEqual(['excited', 'surprise']);
    expect(r?.visualIntent.energy).toBe(0.8);
  });

  it('drops words outside the controlled vocabulary', () => {
    const r = validateInterpretation({ keywords: ['depressed', 'unstable', 'serene'], visualIntent: {} });
    expect(r?.keywords).toEqual(['serene']);
  });

  it('rejects responses with no usable keyword', () => {
    expect(validateInterpretation({ keywords: ['psychotic'], visualIntent: {} })).toBeNull();
    expect(validateInterpretation({ keywords: 'calm' })).toBeNull();
    expect(validateInterpretation(null)).toBeNull();
  });

  it('clamps and fills visual intent', () => {
    const r = validateInterpretation({ keywords: ['tense'], visualIntent: { energy: 9, tension: -2, density: 'lots' } })!;
    expect(r.visualIntent.energy).toBe(1);
    expect(r.visualIntent.tension).toBe(0);
    for (const k of VISUAL_KEYS) expect(r.visualIntent[k]).toBeGreaterThanOrEqual(0);
  });

  it('falls back to local interpretation on malformed, failing or slow AI', async () => {
    const local = interpretLocally(FEATURES);

    const bad = new Interpreter('ai');
    expect(await bad.interpret(FEATURES, null, (async () => new Response('{"keywords":["evil"]}')) as typeof fetch)).toEqual(local);
    expect(bad.status).toBe('fallback:invalid');

    const err = new Interpreter('ai');
    const r2 = await err.interpret(FEATURES, null, (async () => {
      throw new TypeError('offline');
    }) as typeof fetch);
    expect(r2).toEqual(local);
    expect(err.status).toBe('fallback:error');

    vi.useFakeTimers();
    const slow = new Interpreter('ai');
    const hang = ((_: unknown, init: RequestInit) =>
      new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' }))))) as typeof fetch;
    const p = slow.interpret(FEATURES, null, hang);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toEqual(local);
    expect(slow.status).toBe('fallback:timeout');
    vi.useRealTimers();
  });

  it('switches to local permanently when the proxy has no key', async () => {
    const i = new Interpreter('ai');
    await i.interpret(FEATURES, null, (async () => new Response('{}', { status: 503 })) as typeof fetch);
    expect(i.available).toBe(false);
  });
});

describe('circumplex vocabulary (Russell 1980)', () => {
  it('places words in the right quadrants', () => {
    expect(circumplexWord(0.7, 0.6)).toBe('excited');
    expect(circumplexWord(0.6, -0.5)).toBe('serene');
    expect(circumplexWord(-0.5, 0.7)).toBe('angry');
    expect(circumplexWord(-0.6, -0.4)).toBe('gloomy');
    expect(circumplexWord(0.02, -0.03)).toBe('still');
  });

  it('maps arousal to energy and valence to fluidity', () => {
    expect(intentFromAffect(0, 0.9).energy).toBeGreaterThan(intentFromAffect(0, -0.9).energy + 0.6);
    expect(intentFromAffect(0.9, 0).fluidity).toBeGreaterThan(intentFromAffect(-0.9, 0.5).fluidity + 0.3);
    expect(intentFromAffect(-0.8, 0.8).tension).toBeGreaterThan(intentFromAffect(0.8, -0.8).tension + 0.4);
  });

  it('every vocabulary word is English only', () => {
    for (const w of VOCAB_WORDS) expect(w).toMatch(/^[a-z]+$/);
  });
});

describe('expression model I/O', () => {
  it('decodes 8 logits + valence + arousal', () => {
    const out = decode([0, 0, 0, 0, 5, 0, 0, 0, 0.4, -0.2], 1);
    expect(out.probs.happiness).toBeGreaterThan(0.9);
    expect(Object.values(out.probs).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(out.valence).toBeCloseTo(0.4);
    expect(out.arousal).toBeCloseTo(-0.2);
    expect(decode([0, 0, 0, 0, 0, 0, 0, 0, 7, NaN], 1).valence).toBe(1);
  });

  it('normalises pixels with ImageNet mean/std into CHW', () => {
    const px = new Uint8ClampedArray(224 * 224 * 4).fill(255);
    const t = toTensor(px, new Float32Array(3 * 224 * 224));
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(t[224 * 224]).toBeCloseTo((1 - 0.456) / 0.224, 5);
  });

  it('crops a square inside the frame', () => {
    const c = faceCrop([{ x: 0.9, y: 0.1, z: 0 }, { x: 0.99, y: 0.3, z: 0 }], 640, 480);
    expect(c.x + c.size).toBeLessThanOrEqual(640);
    expect(c.y).toBeGreaterThanOrEqual(0);
  });

  it('rejects malformed emotion summaries', () => {
    expect(normalizeEmotion(null)).toBeNull();
    expect(normalizeEmotion({ samples: 0 })).toBeNull();
    const e = normalizeEmotion({ samples: 3, valence: 4, arousal: -9, probs: { happiness: 2, anger: 2 } })!;
    expect(e.valence).toBe(1);
    expect(e.probs.happiness).toBeCloseTo(0.5);
  });
});

describe('top-5 emotion keywords', () => {
  const emo: EmotionSummary = {
    valence: -0.3,
    arousal: 0.5,
    probs: { anger: 0.5, contempt: 0.02, disgust: 0.08, fear: 0.2, happiness: 0.02, neutral: 0.12, sadness: 0.03, surprise: 0.03 },
    samples: 12,
  };
  it('returns 5 distinct vocabulary words, weights summing to 1', () => {
    const r = rankKeywords(FEATURES, emo);
    expect(r).toHaveLength(5);
    expect(new Set(r.map((x) => x.word)).size).toBe(5);
    for (const x of r) expect(VOCAB_WORDS).toContain(x.word);
    expect(r.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 6);
  });
  it('ranks the primary interpretation word first, strongest weight', () => {
    const r = rankKeywords(FEATURES, emo);
    expect(r[0].word).toBe(interpretLocally(FEATURES, emo).keywords[0]);
    for (const x of r.slice(1)) expect(r[0].weight).toBeGreaterThanOrEqual(x.weight);
  });
  it('includes strongly predicted expression categories', () => {
    expect(rankKeywords(FEATURES, emo).map((x) => x.word)).toContain('anger');
  });
});

describe('local interpreter', () => {
  it('uses the expression model when present', () => {
    const emo: EmotionSummary = {
      valence: 0.5,
      arousal: 0.5,
      probs: { anger: 0, contempt: 0, disgust: 0, fear: 0, happiness: 0.7, neutral: 0.2, sadness: 0, surprise: 0.1 },
      samples: 10,
    };
    expect(interpretLocally(FEATURES, emo).keywords).toEqual(['excited', 'happiness']);
  });

  it('falls back to behaviour-only arousal without a model', () => {
    const calm = interpretLocally({ movementIntensity: 0.02, blinkRate: 0.1, eyeOpenness: 0.5, gazeVariation: 0.05, stability: 0.95 });
    const busy = interpretLocally({ movementIntensity: 0.95, blinkRate: 0.8, eyeOpenness: 0.5, gazeVariation: 0.9, stability: 0.2 });
    expect(busy.visualIntent.energy).toBeGreaterThan(calm.visualIntent.energy + 0.4);
    for (const w of [...calm.keywords, ...busy.keywords]) expect(VOCAB_WORDS).toContain(w);
  });

  it('is deterministic', () => {
    expect(interpretLocally(FEATURES)).toEqual(interpretLocally(FEATURES));
  });
});

/** Drive a simulated participant through the real session, behaviour and expression pipeline. */
function simulate(preset: PresetName) {
  const sm = new SessionManager();
  const acc = new FeatureAccumulator();
  const emo = new EmotionAccumulator();
  const sim = new SimulatedParticipant(preset, 0);
  let result: ReturnType<typeof interpretLocally> | null = null;
  let lastEmo = -Infinity;
  for (let t = 0; !sim.done(t); t += 16) {
    const { sample, blink } = sim.sample(t);
    if (sm.inSession) {
      acc.add(16, sample.present, sample.movement, sample.openness, sample.gazeX, sample.gazeY);
      if (blink) acc.addBlink();
      if (t - lastEmo > 330) {
        lastEmo = t;
        const e = sim.emotion(t);
        if (e) emo.add(e);
      }
    }
    for (const ev of sm.update(t, sample.present)) {
      if (ev.type === 'sessionStart') {
        acc.reset();
        emo.reset();
      }
      if (ev.type === 'commit') result = interpretLocally(acc.features(), emo.summary());
    }
  }
  return result;
}

describe('demo participants A → B → C', () => {
  it('each preset is read as intended', () => {
    for (const name of Object.keys(PRESETS) as PresetName[]) expect(simulate(name)?.keywords[0]).toBe(name);
  });

  it('A, B and C change the same eye in sequence', () => {
    const engine = new CollectiveEngine({ now: 0 });
    const intents = [];
    let now = 0;
    let prevAfter = engine.memory;
    for (const preset of DEMO_SEQUENCE) {
      const interp = simulate(preset)!;
      const res = engine.commit({ id: preset, seed: intents.length, signature: interp.visualIntent, keywords: interp.keywords, pos: { x: 0.5, y: 0.85 } }, (now += 20_000));
      expect(stateDistance(res.before, res.after)).toBeGreaterThan(0.03);
      expect(stateDistance(res.before, prevAfter)).toBeLessThan(0.005); // B starts where A left the eye (minus 20 s of decay)
      prevAfter = res.after;
      intents.push(interp.visualIntent);
    }
    expect(stateDistance(intents[0], intents[1])).toBeGreaterThan(0.4);
    expect(stateDistance(intents[1], intents[2])).toBeGreaterThan(0.4);
    expect(stateDistance(engine.memory, NEUTRAL_STATE)).toBeGreaterThan(0.05);
    expect(engine.participantCount).toBe(3);
  });
});
