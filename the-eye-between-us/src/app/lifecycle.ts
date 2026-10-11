import type { LifecycleState } from '../interaction/stateMachine';

/**
 * Minimal typographic overlay (DOM/CSS). Shows only what a visitor needs:
 * the invitation, a gentle hint while engaged, and a residue statement that
 * names the change that actually happened.
 */
export class Overlay {
  private root = document.getElementById('overlay')!;
  private invite = this.el('invite');
  private hint = this.el('hint');
  private statement = this.el('statement');
  private statementLine = this.el('statement-line');
  private statementSub = this.el('statement-sub');
  private count = this.el('count');
  private notice = this.el('notice');
  private demoTag = this.el('demo-tag');
  private statementUntil = 0;

  private el(id: string): HTMLElement {
    const e = document.getElementById(id);
    if (!e) throw new Error(`#${id} missing`);
    return e;
  }

  clearStatement(): void { this.statementUntil = 0; this.statementLine.textContent = ''; this.statementSub.textContent = ''; }

  setCount(n: number): void {
    this.count.textContent = n === 1 ? '1 ENCOUNTER' : `${n} ENCOUNTERS`;
  }

  setNotice(text: string): void {
    this.notice.textContent = text;
    this.notice.classList.toggle('on', text !== '');
  }

  showStatement(line: string, sub: string, durationMs = 5200): void {
    this.statementLine.textContent = line;
    this.statementSub.textContent = sub;
    this.statementUntil = performance.now() + durationMs;
  }

  update(now: number, state: LifecycleState, info: { simulated: boolean; engagedMs: number }): void {
    this.invite.classList.toggle('on', state === 'IDLE' && !info.simulated);
    this.hint.classList.toggle('on', (state === 'ENGAGED' || state === 'INTERPRETING') && info.engagedMs < 5500);
    this.statement.classList.toggle('on', now < this.statementUntil);
    this.demoTag.classList.toggle('on', info.simulated);
    this.root.dataset.state = state;
  }
}
