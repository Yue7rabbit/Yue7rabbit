import type { App } from '../app/App';
import { VISUAL_KEYS, type VisualState } from '../collective/visualState';
import type { Quality } from '../visual/palette';
import { PRESETS, type PresetName } from './simulatedParticipant';
import { EMOTION_CLASSES } from '../interpretation/keywordVocabulary';

/** Hidden operator panel (toggle with D). Never visible in exhibition mode. */
export class DebugPanel {
  private app: App;
  private root: HTMLElement;
  private info: HTMLElement;
  private visible = false;
  private lastUpdate = 0;

  constructor(app: App) {
    this.app = app;
    this.root = document.createElement('aside');
    this.root.id = 'debug';
    this.root.innerHTML = `
      <header>OPERATOR <span class="k">D</span> to hide</header>
      <pre class="info"></pre>
      <div class="btns">
        <button data-a="demo">▶ Demo A→B→C</button>
        <button data-a="sim">Simulate participant</button>
        <button data-a="blink">Trigger blink</button>
        <button data-a="excited">Inject EXCITED</button>
        <button data-a="serene">Inject SERENE</button>
        <button data-a="tense">Inject TENSE</button>
        <button data-a="commit">Commit participant</button>
        <button data-a="ai">Toggle AI / local</button>
        <button data-a="export">Export state JSON</button>
        <button data-a="fullscreen">Fullscreen</button>
        <button data-a="reset" class="danger">Reset visual memory</button>
      </div>
      <label>Memory half-life <input type="range" min="1" max="120" step="1" data-r="halflife"> <span data-v="halflife"></span> min</label>
      <label>Influence α <input type="range" min="0.05" max="0.6" step="0.01" data-r="alpha"> <span data-v="alpha"></span></label>
      <label>Quality <select data-r="quality"><option value="auto">auto</option><option>high</option><option>medium</option><option>low</option></select></label>
      <label>Sound volume <input type="range" min="0" max="1" step="0.05" data-r="volume"> <span data-v="sound"></span></label>
      <label><input type="checkbox" data-r="invert"> Invert gaze X (mirrored camera)</label>
      <label><input type="checkbox" data-r="loop"> Demo attract loop</label>
    `;
    document.body.appendChild(this.root);
    this.info = this.root.querySelector('.info')!;

    this.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a;
      if (a) this.action(a);
    });
    const hl = this.root.querySelector<HTMLInputElement>('[data-r="halflife"]')!;
    const al = this.root.querySelector<HTMLInputElement>('[data-r="alpha"]')!;
    const ql = this.root.querySelector<HTMLSelectElement>('[data-r="quality"]')!;
    const inv = this.root.querySelector<HTMLInputElement>('[data-r="invert"]')!;
    const loop = this.root.querySelector<HTMLInputElement>('[data-r="loop"]')!;
    const sync = () => {
      hl.value = String(Math.round(app.engine.halfLifeMs / 60000));
      al.value = String(app.engine.alpha);
      this.root.querySelector('[data-v="halflife"]')!.textContent = hl.value;
      this.root.querySelector('[data-v="alpha"]')!.textContent = Number(al.value).toFixed(2);
      loop.checked = app.demoLoop;
    };
    sync();
    hl.addEventListener('input', () => {
      app.engine.tick(Date.now());
      app.engine.halfLifeMs = Number(hl.value) * 60000;
      sync();
    });
    al.addEventListener('input', () => {
      app.engine.alpha = Number(al.value);
      sync();
    });
    ql.addEventListener('change', () => {
      if (ql.value === 'auto') app.setQuality('high', true);
      else app.setQuality(ql.value as Quality, false);
    });
    inv.addEventListener('change', () => (app.normalizer.invertX = inv.checked));
    const vol = this.root.querySelector<HTMLInputElement>('[data-r="volume"]')!;
    vol.value = String(app.audio.volume);
    vol.addEventListener('input', () => app.audio.setVolume(Number(vol.value)));
    loop.addEventListener('change', () => (app.demoLoop = loop.checked));
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('on', this.visible);
  }

  action(a: string): void {
    const app = this.app;
    switch (a) {
      case 'demo':
        app.runDemo(app.demoLoop);
        break;
      case 'sim': {
        const names = Object.keys(PRESETS) as PresetName[];
        app.startSimulated(names[Math.floor(Math.random() * names.length)]);
        break;
      }
      case 'blink':
        app.triggerBlink();
        break;
      case 'excited':
      case 'serene':
      case 'tense':
        app.injectKeyword(a);
        break;
      case 'commit':
        app.forceCommit();
        break;
      case 'ai':
        app.interpreter.mode = app.interpreter.mode === 'ai' ? 'local' : 'ai';
        app.interpreter.available = true;
        break;
      case 'export': {
        const blob = new Blob([app.exportState()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), {
          href: url,
          download: `eye-between-us-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case 'fullscreen':
        toggleFullscreen();
        break;
      case 'reset':
        if (confirm('Reset the collective memory? Every past encounter will be forgotten.')) app.resetMemory();
        break;
    }
  }

  update(now: number): void {
    if (!this.visible || now - this.lastUpdate < 200) return;
    this.lastUpdate = now;
    const app = this.app;
    const l = app.live;
    const fmt = (s: VisualState) => VISUAL_KEYS.map((k) => `${k.slice(0, 4)} ${s[k].toFixed(2)}`).join('  ');
    const f = app.acc.features();
    this.info.textContent = [
      `camera    ${app.camera.status}   tracker ${app.tracker.status}${app.tracker.error ? ' (' + app.tracker.error.slice(0, 40) + ')' : ''}`,
      `faces     ${app.faceCount}   present ${l.present ? 'yes' : 'no'}   sim ${app.sim ? app.sim.preset : '—'}`,
      `gaze      x ${l.gazeX.toFixed(2)}  y ${l.gazeY.toFixed(2)}  (${l.gazeIsApproximation ? 'approx: head pose + iris, auto-centred' : 'calibrated'})`,
      `openness  ${l.openness.toFixed(2)}  raw ${l.rawOpenness.toFixed(3)}  baseline ${app.blink.baseline.toFixed(3)}`,
      `blinks    ${app.blinkCount}   ${now - app.lastBlinkAt < 600 ? '● BLINK' : ''}`,
      `session   ${app.session.state}  #${app.session.sessionId}  engaged ${(app.session.engagedMs(now) / 1000).toFixed(1)}s  commits ${app.session.commitCount}${app.session.awaitingDeparture ? '  (awaiting departure)' : ''}`,
      `features  mov ${f.movementIntensity.toFixed(2)} blk ${f.blinkRate.toFixed(2)} open ${f.eyeOpenness.toFixed(2)} gaze ${f.gazeVariation.toFixed(2)} stab ${f.stability.toFixed(2)}`,
      `emotion   model ${app.emotion.status}${app.emotion.error ? ' (' + app.emotion.error.slice(0, 40) + ')' : ''}  ${app.emotion.inferMs.toFixed(0)}ms  ${emo(app)}`,
      `keywords  ${app.interpretation ? app.interpretation.keywords.join(' · ') + '  [' + app.interpretation.source + ']' : '—'}`,
      `sound     ${app.audio.running ? (app.audio.muted ? 'muted (M)' : 'on') : 'waiting for a click'}   volume ${app.audio.volume.toFixed(2)}`,
      `AI        mode ${app.interpreter.mode}  status ${app.interpreter.status}${app.interpreter.available ? '' : '  (proxy has no key → local)'}`,
      ``,
      `live      ${app.liveIntent ? fmt(app.liveIntent) : '—'}  w ${app.liveWeight.toFixed(2)}`,
      `memory    ${fmt(app.engine.memory)}`,
      `rendered  ${fmt(app.rendered)}`,
      ``,
      `encounters ${app.engine.participantCount}   stored eyes ${app.engine.eyes.length}   fps ${app.fps.toFixed(0)}   quality ${app.renderer.quality}${app.autoQuality ? ' (auto)' : ''}`,
    ].join('\n');
  }
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

function emo(app: App): string {
  const e = app.liveEmotion;
  if (!e) return '—';
  const top = [...EMOTION_CLASSES].sort((a, b) => e.probs[b] - e.probs[a]).slice(0, 2);
  return `V ${e.valence.toFixed(2)} A ${e.arousal.toFixed(2)}  ${top.map((c) => `${c} ${(e.probs[c] * 100).toFixed(0)}%`).join('  ')}  (session n=${app.emoAcc.samples})`;
}
