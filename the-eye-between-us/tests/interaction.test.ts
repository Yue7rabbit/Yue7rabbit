import { describe, expect, it } from 'vitest';
import { SessionManager, type SessionEvent } from '../src/interaction/sessionManager';
import { BlinkDetector } from '../src/tracking/blinkDetector';
import { selectFace } from '../src/tracking/faceTracker';

const OPEN = 0.3;
const CLOSED = 0.08;

/** Feed a timeline of (duration, value) at ~30 Hz; returns blink count. */
function play(det: BlinkDetector, segments: [number, number | null][], start = 0): number {
  let t = start;
  let blinks = 0;
  for (const [dur, v] of segments) {
    const end = t + dur;
    for (; t < end; t += 33) if (det.update(v, t)) blinks++;
  }
  return blinks;
}

describe('blink detector', () => {
  it('detects a normal blink after calibration', () => {
    const d = new BlinkDetector();
    expect(play(d, [[1000, OPEN], [120, CLOSED], [500, OPEN]])).toBe(1);
  });

  it('adapts to faces with naturally narrow eyes (no fixed threshold)', () => {
    const d = new BlinkDetector();
    expect(play(d, [[1000, 0.16], [120, 0.04], [500, 0.16]])).toBe(1);
  });

  it('ignores a single-frame dip (debounce / minimum closed duration)', () => {
    const d = new BlinkDetector();
    let t = 0;
    for (; t < 1000; t += 33) d.update(OPEN, t);
    d.update(CLOSED, t);
    t += 10;
    expect(d.update(OPEN, t)).toBeNull();
  });

  it('ignores long deliberate closures', () => {
    const d = new BlinkDetector();
    expect(play(d, [[1000, OPEN], [1500, CLOSED], [500, OPEN]])).toBe(0);
  });

  it('applies a cooldown against rapid repeated triggers', () => {
    const d = new BlinkDetector({ cooldownMs: 500 });
    expect(play(d, [[1000, OPEN], [100, CLOSED], [70, OPEN], [100, CLOSED], [500, OPEN]])).toBe(1);
  });

  it('never treats tracking loss as a blink', () => {
    const d = new BlinkDetector();
    expect(play(d, [[1000, OPEN], [400, null], [500, OPEN]])).toBe(0);
    // loss *while closed* cancels the candidate
    expect(play(d, [[90, CLOSED], [200, null], [500, OPEN]], 3000)).toBe(0);
  });
});

function run(sm: SessionManager, from: number, to: number, present: boolean, step = 33): SessionEvent[] {
  const out: SessionEvent[] = [];
  for (let t = from; t < to; t += step) out.push(...sm.update(t, present));
  return out;
}
const count = (ev: SessionEvent[], type: SessionEvent['type']) => ev.filter((e) => e.type === type).length;

describe('session manager', () => {
  it('requires stable detection before starting', () => {
    const sm = new SessionManager();
    const ev = run(sm, 0, 500, true);
    expect(count(ev, 'sessionStart')).toBe(0);
    expect(sm.state).toBe('DETECTING');
    run(sm, 500, 1000, true);
    expect(sm.state).toBe('ENGAGED');
  });

  it('commits exactly once when a participant leaves', () => {
    const sm = new SessionManager();
    const ev = [...run(sm, 0, 6000, true), ...run(sm, 6000, 20000, false)];
    expect(count(ev, 'sessionStart')).toBe(1);
    expect(count(ev, 'requestInterpretation')).toBe(1);
    expect(count(ev, 'commit')).toBe(1);
    expect(sm.state).toBe('IDLE');
  });

  it('survives short tracking loss without ending or duplicating the session', () => {
    const sm = new SessionManager();
    const ev = [
      ...run(sm, 0, 3000, true),
      ...run(sm, 3000, 4200, false), // 1.2 s loss < 1.5 s tolerance
      ...run(sm, 4200, 7000, true),
      ...run(sm, 7000, 9000, false), // real departure
    ];
    expect(count(ev, 'sessionStart')).toBe(1);
    expect(count(ev, 'abort')).toBe(0);
    expect(count(ev, 'commit')).toBe(1);
  });

  it('discards encounters shorter than the minimum engagement', () => {
    const sm = new SessionManager();
    const ev = [...run(sm, 0, 2500, true), ...run(sm, 2500, 6000, false)];
    expect(count(ev, 'commit')).toBe(0);
    expect(count(ev, 'abort')).toBe(1);
  });

  it('after a complete session, the same person must leave before a new one starts', () => {
    const sm = new SessionManager({ maxSessionMs: 5000 });
    const ev = run(sm, 0, 40000, true); // never leaves
    expect(count(ev, 'commit')).toBe(1);
    expect(count(ev, 'sessionStart')).toBe(1);
    const ev2 = [...run(sm, 40000, 42000, false), ...run(sm, 42000, 46000, true)];
    expect(count(ev2, 'sessionStart')).toBe(1);
  });

  it('manual commit cannot double-commit a session', () => {
    const sm = new SessionManager();
    run(sm, 0, 4000, true);
    expect(count(sm.forceCommit(4000), 'commit')).toBe(1);
    expect(count(sm.forceCommit(4010), 'commit')).toBe(0);
    const ev = run(sm, 4010, 20000, false);
    expect(count(ev, 'commit')).toBe(0);
    expect(sm.commitCount).toBe(1);
  });
});

describe('multi-face selection', () => {
  const faces = [
    { cx: 0.2, cy: 0.5, size: 0.3 },
    { cx: 0.7, cy: 0.5, size: 0.4 },
  ];
  it('picks the largest face when unlocked', () => {
    expect(selectFace(faces, null)).toBe(1);
  });
  it('stays with the locked participant even if someone closer appears', () => {
    expect(selectFace(faces, { x: 0.22, y: 0.5 })).toBe(0);
  });
  it('reports absence rather than switching to a stranger', () => {
    expect(selectFace([faces[1]], { x: 0.2, y: 0.5 })).toBe(-1);
  });
});
