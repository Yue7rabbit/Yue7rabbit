import { VISUAL_KEYS, type VisualState } from '../collective/visualState';
import { dampFactor, lerp } from './math';

/** Move `current` toward `target` in place, frame-rate independently. */
export function dampState(current: VisualState, target: VisualState, dtMs: number, halfLifeMs: number): void {
  const f = dampFactor(dtMs, halfLifeMs);
  for (const k of VISUAL_KEYS) current[k] = lerp(current[k], target[k], f);
}

export function mixStates(a: VisualState, b: VisualState, t: number, out: VisualState = { ...a }): VisualState {
  for (const k of VISUAL_KEYS) out[k] = lerp(a[k], b[k], t);
  return out;
}
