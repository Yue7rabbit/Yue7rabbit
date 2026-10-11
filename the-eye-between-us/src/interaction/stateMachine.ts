export type LifecycleState = 'IDLE' | 'DETECTING' | 'ENGAGED' | 'INTERPRETING' | 'COMMITTING' | 'RESIDUE';

const ALLOWED: Record<LifecycleState, LifecycleState[]> = {
  IDLE: ['DETECTING', 'ENGAGED'],
  DETECTING: ['IDLE', 'ENGAGED'],
  ENGAGED: ['INTERPRETING', 'COMMITTING', 'IDLE'],
  INTERPRETING: ['COMMITTING', 'IDLE'],
  COMMITTING: ['RESIDUE'],
  RESIDUE: ['IDLE'],
};

/** Tiny guarded state machine; illegal transitions are ignored and reported. */
export class StateMachine {
  state: LifecycleState = 'IDLE';
  enteredAt = 0;

  canGo(to: LifecycleState): boolean {
    return ALLOWED[this.state].includes(to);
  }

  go(to: LifecycleState, t: number): boolean {
    if (!this.canGo(to)) return false;
    this.state = to;
    this.enteredAt = t;
    return true;
  }

  elapsed(t: number): number {
    return t - this.enteredAt;
  }
}
