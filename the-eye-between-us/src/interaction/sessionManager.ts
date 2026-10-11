import { StateMachine, type LifecycleState } from './stateMachine';

export type SessionConfig = {
  commitOnDeparture: boolean;
  detectStableMs: number;
  interpretAtMs: number;
  minEngageMs: number;
  lossToleranceMs: number;
  maxSessionMs: number;
  commitDurationMs: number;
  residueMs: number;
  cooldownMs: number;
};

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  commitOnDeparture: true,
  detectStableMs: 850,
  interpretAtMs: 2200,
  minEngageMs: 3000,
  lossToleranceMs: 1500,
  maxSessionMs: 15000,
  commitDurationMs: 3600,
  residueMs: 4500,
  cooldownMs: 1200,
};

export type SessionEvent =
  | { type: 'detecting' }
  | { type: 'sessionStart'; sessionId: number }
  | { type: 'requestInterpretation'; sessionId: number }
  | { type: 'commit'; sessionId: number; reason: 'departed' | 'complete' | 'manual' }
  | { type: 'abort'; sessionId: number }
  | { type: 'residue'; sessionId: number }
  | { type: 'idle' };

/**
 * Participant lifecycle. Pure logic driven by (time, presence) so it is fully testable.
 * Guarantees: at most one commit per session; brief tracking loss never ends a session;
 * after a "complete" commit the same person must leave before a new session can start.
 */
export class SessionManager {
  cfg: SessionConfig;
  fsm = new StateMachine();
  sessionId = 0;
  committed = false;
  engageStart = 0;
  lastSeenAt = -Infinity;
  awaitingDeparture = false;
  cooldownUntil = -Infinity;
  commitCount = 0;

  constructor(cfg: Partial<SessionConfig> = {}) {
    this.cfg = { ...DEFAULT_SESSION_CONFIG, ...cfg };
  }

  get state(): LifecycleState {
    return this.fsm.state;
  }

  get inSession(): boolean {
    return this.state === 'ENGAGED' || this.state === 'INTERPRETING';
  }

  engagedMs(t: number): number {
    return this.inSession ? t - this.engageStart : 0;
  }

  update(t: number, present: boolean): SessionEvent[] {
    const ev: SessionEvent[] = [];
    if (present) this.lastSeenAt = t;
    const absentFor = t - this.lastSeenAt;
    if (this.awaitingDeparture && !present && absentFor > this.cfg.lossToleranceMs) this.awaitingDeparture = false;

    switch (this.fsm.state) {
      case 'IDLE':
        if (present && !this.awaitingDeparture && t >= this.cooldownUntil) {
          this.fsm.go('DETECTING', t);
          ev.push({ type: 'detecting' });
        }
        break;

      case 'DETECTING':
        if (!present && absentFor > 250) {
          this.fsm.go('IDLE', t);
          ev.push({ type: 'idle' });
        } else if (present && this.fsm.elapsed(t) >= this.cfg.detectStableMs) {
          this.startSession(t, ev);
        }
        break;

      case 'ENGAGED':
      case 'INTERPRETING': {
        const engaged = t - this.engageStart;
        if (!present && absentFor > this.cfg.lossToleranceMs) {
          const validMs = this.lastSeenAt - this.engageStart;
          if (this.cfg.commitOnDeparture && validMs >= this.cfg.minEngageMs) this.doCommit(t, 'departed', ev);
          else {
            ev.push({ type: 'abort', sessionId: this.sessionId });
            this.fsm.go('IDLE', t);
            this.cooldownUntil = t + this.cfg.cooldownMs;
            ev.push({ type: 'idle' });
          }
          break;
        }
        if (this.fsm.state === 'ENGAGED' && engaged >= this.cfg.interpretAtMs) {
          this.fsm.go('INTERPRETING', t);
          ev.push({ type: 'requestInterpretation', sessionId: this.sessionId });
        }
        if (engaged >= this.cfg.maxSessionMs) this.doCommit(t, 'complete', ev);
        break;
      }

      case 'COMMITTING':
        if (this.fsm.elapsed(t) >= this.cfg.commitDurationMs) {
          this.fsm.go('RESIDUE', t);
          ev.push({ type: 'residue', sessionId: this.sessionId });
        }
        break;

      case 'RESIDUE':
        if (this.fsm.elapsed(t) >= this.cfg.residueMs) {
          this.fsm.go('IDLE', t);
          this.cooldownUntil = t + this.cfg.cooldownMs;
          ev.push({ type: 'idle' });
        }
        break;
    }
    return ev;
  }

  /** Operator/demo: commit the current session now (no-op unless engaged). */
  forceCommit(t: number): SessionEvent[] {
    const ev: SessionEvent[] = [];
    if (this.inSession) this.doCommit(t, 'manual', ev);
    return ev;
  }

  private startSession(t: number, ev: SessionEvent[]): void {
    this.sessionId++;
    this.committed = false;
    this.engageStart = t;
    this.fsm.go('ENGAGED', t);
    ev.push({ type: 'sessionStart', sessionId: this.sessionId });
  }

  private doCommit(t: number, reason: 'departed' | 'complete' | 'manual', ev: SessionEvent[]): void {
    if (this.committed) return;
    this.committed = true;
    this.commitCount++;
    this.awaitingDeparture = reason !== 'departed';
    this.fsm.go('COMMITTING', t);
    ev.push({ type: 'commit', sessionId: this.sessionId, reason });
  }
}
