import { CollectiveEngine, MAX_STORED_EYES, type IndividualEyeRecord } from './collectiveEngine';
import { normalizeState } from './visualState';
import { clamp01 } from '../utils/math';

/**
 * Only derived, non-biometric data is persisted: collective visual state,
 * eye seeds + visual signatures, poetic keywords, counts and timestamps.
 * No camera frames, landmarks or face templates ever reach storage.
 */
export const STORAGE_KEY = 'eye-between-us/v2-single-origin';
export const SCHEMA_VERSION = 1;

export type PersistedState = {
  version: number;
  memory: Record<string, number>;
  lastDecayAt: number;
  participantCount: number;
  halfLifeMs: number;
  eyes: IndividualEyeRecord[];
};

export function serialize(engine: CollectiveEngine): string {
  const data: PersistedState = {
    version: SCHEMA_VERSION,
    memory: { ...engine.memory },
    lastDecayAt: engine.lastDecayAt,
    participantCount: engine.participantCount,
    halfLifeMs: engine.halfLifeMs,
    eyes: engine.eyes.map((e) => ({ ...e, signature: { ...e.signature }, pos: { ...e.pos }, keywords: [...e.keywords] })),
  };
  return JSON.stringify(data);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function parseEye(raw: unknown): IndividualEyeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.seed !== 'number') return null;
  const pos = (r.pos ?? {}) as Record<string, unknown>;
  return {
    ...(typeof r.note === 'string' && r.note.trim() ? {note:r.note.trim().slice(0,160)} : {}),
    id: r.id,
    seed: r.seed >>> 0,
    signature: normalizeState(r.signature),
    keywords: Array.isArray(r.keywords) ? r.keywords.filter((k): k is string => typeof k === 'string').slice(0, 3) : [],
    createdAt: num(r.createdAt, 0),
    influence: Math.max(0, num(r.influence, 0)),
    pos: { x: clamp01(num(pos.x, 0.5)), y: clamp01(num(pos.y, 0.5)) },
  };
}

/** Restore into `engine`. Returns false (leaving engine untouched) on invalid input. */
export function deserializeInto(engine: CollectiveEngine, json: string): boolean {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return false;
  }
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.version !== SCHEMA_VERSION) return false;
  engine.memory = normalizeState(d.memory);
  engine.lastDecayAt = num(d.lastDecayAt, Date.now());
  engine.participantCount = Math.max(0, Math.floor(num(d.participantCount, 0)));
  engine.halfLifeMs = Math.max(1000, num(d.halfLifeMs, engine.halfLifeMs));
  engine.eyes = Array.isArray(d.eyes)
    ? d.eyes.map(parseEye).filter((e): e is IndividualEyeRecord => e !== null).slice(-MAX_STORED_EYES)
    : [];
  return true;
}

export function saveToStorage(engine: CollectiveEngine, storage: Storage | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, serialize(engine));
  } catch {
    /* storage full or blocked — the artwork keeps running in memory */
  }
}

export function loadFromStorage(engine: CollectiveEngine, storage: Storage | undefined = safeLocalStorage()): boolean {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? deserializeInto(engine, raw) : false;
  } catch {
    return false;
  }
}

export function clearStorage(storage: Storage | undefined = safeLocalStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
