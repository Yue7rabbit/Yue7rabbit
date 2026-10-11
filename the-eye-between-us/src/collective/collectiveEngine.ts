import { DEFAULT_ALPHA, applyInfluence } from './influenceRules';
import { DEFAULT_HALF_LIFE_MS, decayState } from './memoryDecay';
import { NEUTRAL_STATE, VISUAL_KEYS, cloneState, stateDistance, type VisualKey, type VisualState } from './visualState';

export type IndividualEyeRecord = {
  note?: string;
  id: string;
  seed: number;
  signature: VisualState;
  keywords: string[];
  createdAt: number; // epoch ms
  /** How far this encounter actually moved the collective state (0..~1). */
  influence: number;
  /** Normalized position in the viewport (0..1), fixed at creation. */
  pos: { x: number; y: number };
};

export type CommitInput = {
  note?: string;
  id: string;
  seed: number;
  signature: VisualState;
  keywords: string[];
  pos: { x: number; y: number };
};

export type CommitResult = {
  before: VisualState;
  after: VisualState;
  record: IndividualEyeRecord;
  statement: string;
};

export const MAX_STORED_EYES = 240;

export class CollectiveEngine {
  memory: VisualState;
  eyes: IndividualEyeRecord[] = [];
  participantCount = 0;
  lastDecayAt: number;
  halfLifeMs: number;
  alpha: number;

  constructor(opts: { now?: number; halfLifeMs?: number; alpha?: number } = {}) {
    this.memory = cloneState(NEUTRAL_STATE);
    this.lastDecayAt = opts.now ?? Date.now();
    this.halfLifeMs = opts.halfLifeMs ?? DEFAULT_HALF_LIFE_MS;
    this.alpha = opts.alpha ?? DEFAULT_ALPHA;
  }

  /** Apply time-based decay toward neutral. Safe to call at any rate. */
  tick(now: number): void {
    const elapsed = now - this.lastDecayAt;
    if (elapsed <= 0) return;
    this.memory = decayState(this.memory, NEUTRAL_STATE, elapsed, this.halfLifeMs);
    this.lastDecayAt = now;
  }

  commit(input: CommitInput, now: number): CommitResult {
    this.tick(now);
    const before = cloneState(this.memory);
    const after = applyInfluence(before, input.signature, this.alpha);
    this.memory = after;
    this.participantCount += 1;
    const record: IndividualEyeRecord = {
      ...(input.note ? {note:input.note.trim().slice(0,160)} : {}),
      id: input.id,
      seed: input.seed >>> 0,
      signature: cloneState(input.signature),
      keywords: input.keywords.slice(0, 3), // top-3 emotion keywords, strongest first
      createdAt: now,
      influence: stateDistance(before, after),
      pos: { ...input.pos },
    };
    this.eyes.push(record);
    if (this.eyes.length > MAX_STORED_EYES) this.eyes.splice(0, this.eyes.length - MAX_STORED_EYES);
    return { before, after, record, statement: describeChange(before, after) };
  }

  reset(now: number): void {
    this.memory = cloneState(NEUTRAL_STATE);
    this.eyes = [];
    this.participantCount = 0;
    this.lastDecayAt = now;
  }
}

const PHRASES: Record<VisualKey, [up: string, down: string]> = {
  openness: ['YOU LEFT IT MORE OPEN.', 'YOU LEFT IT MORE GUARDED.'],
  energy: ['YOU QUICKENED IT.', 'YOU STILLED IT.'],
  tension: ['YOU DREW IT TIGHTER.', 'YOU LOOSENED ITS GRIP.'],
  fluidity: ['YOU TAUGHT IT TO FLOW.', 'YOU GAVE IT EDGES.'],
  density: ['YOU THICKENED ITS THREADS.', 'YOU THINNED ITS THREADS.'],
  rhythm: ['YOU CHANGED ITS RHYTHM.', 'YOU SLOWED ITS RHYTHM.'],
  turbulence: ['YOU STIRRED ITS EDGES.', 'YOU CALMED ITS EDGES.'],
};

/** Minimum change considered perceptible enough to name. */
export const STATEMENT_THRESHOLD = 0.012;

/**
 * Describe the single largest actual change. Only names a direction that
 * really happened; falls back to a neutral line if nothing moved enough.
 */
export function describeChange(before: VisualState, after: VisualState): string {
  let bestKey: VisualKey | null = null;
  let bestDelta = 0;
  for (const k of VISUAL_KEYS) {
    const d = after[k] - before[k];
    if (Math.abs(d) > Math.abs(bestDelta)) {
      bestDelta = d;
      bestKey = k;
    }
  }
  if (!bestKey || Math.abs(bestDelta) < STATEMENT_THRESHOLD) return 'YOU MET IT WHERE IT WAS.';
  return PHRASES[bestKey][bestDelta > 0 ? 0 : 1];
}
