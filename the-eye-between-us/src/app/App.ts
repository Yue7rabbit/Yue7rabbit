import { wordsForFeeling } from '../interpretation/imprintWords';
import { withOrigin } from '../visual/originImprint';
import { AudioEngine } from '../audio/audioEngine';
import { CollectiveEngine, type CommitResult } from '../collective/collectiveEngine';
import { deriveEmergent } from '../collective/influenceRules';
import { clearStorage, loadFromStorage, saveToStorage, serialize } from '../collective/persistence';
import { NEUTRAL_STATE, VISUAL_KEYS, cloneState, type VisualState } from '../collective/visualState';
import { DebugPanel } from '../debug/debugPanel';
import { DEMO_SEQUENCE, PRESETS, SimulatedParticipant, type PresetName } from '../debug/simulatedParticipant';
import { EmotionAccumulator } from '../interaction/emotionAccumulator';
import { FeatureAccumulator } from '../interaction/featureAccumulator';
import { SessionManager, type SessionEvent } from '../interaction/sessionManager';
import { Interpreter } from '../interpretation/aiInterpreter';
import { VOCAB_WORDS, findKeyword } from '../interpretation/keywordVocabulary';
import type { WordWeight } from '../visual/textIris';
import { interpretLocally, rankKeywords, type RankedWord } from '../interpretation/localInterpreter';
import type { Interpretation } from '../interpretation/schemas';
import { BlinkDetector } from '../tracking/blinkDetector';
import { Camera } from '../tracking/camera';
import { EmotionModel, type EmotionSample } from '../tracking/emotionModel';
import { FaceTracker, selectFace } from '../tracking/faceTracker';
import { EMPTY_SAMPLE, TrackingNormalizer, type LiveSample } from '../tracking/trackingNormalizer';
import { clamp, clamp01, damp, easeInOutCubic, noise1 } from '../utils/math';
import { dampState, mixStates } from '../utils/interpolation';
import { randomId, randomSeed } from '../utils/random';
import type { Quality } from '../visual/palette';
import { Renderer } from '../visual/renderer';
import { Overlay } from './lifecycle';
import { BLINK_CLOSE_AT, BLINK_MS } from './timing';

const EMOTION_EVERY_MS = 330; // ~3 expression estimates per second
const COMMIT_FORM_MS = 600;
const TRAIL_MS = 800;
const SIGNATURE_LOCAL_WEIGHT = 0.3;
const VISUAL_GAIN = 1.7;

type CommitAnim = {
  t0: number;
  result: CommitResult;
  ghost: VisualState;
  trailLaunched: boolean;
  arrivedAt: number | null;
};

export class App {
  readonly engine = new CollectiveEngine();
  readonly session = new SessionManager({commitOnDeparture:false,maxSessionMs:Infinity});
  readonly interpreter = new Interpreter('local');
  readonly camera = new Camera();
  readonly tracker = new FaceTracker();
  readonly blink = new BlinkDetector();
  readonly normalizer = new TrackingNormalizer();
  readonly acc = new FeatureAccumulator();
  readonly emotion = new EmotionModel();
  readonly audio = new AudioEngine();
  readonly emoAcc = new EmotionAccumulator();
  liveEmotion: EmotionSample | null = null;
  private lastEmotionAt = 0;
  private pendingPrompt: {message:string;mood:string}|null = null;
  addImprint(message:string,mood:string):boolean {
    if(!message.trim()||!findKeyword(mood)||this.session.state==='COMMITTING'||this.session.state==='RESIDUE')return false;
    this.pendingPrompt={message:message.trim().slice(0,160),mood};
    this.leaveTrace();return true;
  }
  inputMode: 'mouse' | 'camera' = 'mouse';
  mouse = { x: 0, y: 0, movedAt: -Infinity };
  private mouseAbsentUntil = 0;
  private cameraAttempt = 0;
  private started = false;
  setPointer(x: number, y: number): void { this.mouse = {x, y, movedAt: performance.now()}; }
  useMouse(): void {
    this.cameraAttempt++;
    this.camera.stop(); this.inputMode = 'mouse';
    this.overlay.setNotice('');
  }
  async enableCamera(): Promise<void> {
    const attempt = ++this.cameraAttempt;
    this.inputMode = 'camera';
    this.overlay.setNotice('Opening your camera…');
    const ok = await this.camera.start();
    if (attempt !== this.cameraAttempt) return;
    if (!ok) { this.inputMode = 'mouse'; this.overlay.setNotice('Camera unavailable or permission declined. Mouse mode is ready; you can try again.'); return; }
    this.overlay.setNotice('Camera connected. Loading on-device tracking…');
    const ready = this.tracker.status === 'ready' || await this.tracker.init();
    if (attempt !== this.cameraAttempt) return;
    if (!ready) { this.camera.stop(); this.inputMode = 'mouse'; this.overlay.setNotice('Tracking could not load. Mouse mode is ready.'); return; }
    this.overlay.setNotice('');
    if (!this.emotion.ready && this.emotion.status !== 'loading') void this.emotion.init();
  }
  leaveTrace(): void {
    if (this.session.state === 'COMMITTING' || this.session.state === 'RESIDUE') return;
    if (!this.session.inSession) {
      this.session.awaitingDeparture = false;
      this.session.cooldownUntil = -Infinity;
      this.session.fsm.go('IDLE', performance.now());
      for (const ev of this.session.update(performance.now(), true)) this.handleEvent(ev, performance.now());
      for (const ev of this.session.update(performance.now() + this.session.cfg.detectStableMs + 1, true)) this.handleEvent(ev, performance.now());
    }
    this.forceCommit();
    if (this.inputMode === 'mouse') this.mouseAbsentUntil = performance.now() + 10000;
  }

  readonly renderer: Renderer;
  readonly overlay: Overlay;
  readonly debug: DebugPanel;

  /** Collective memory as currently shown (lags engine.memory during the commit choreography). */
  displayMemory: VisualState = cloneState(NEUTRAL_STATE);
  /** The smoothly rendered combination of live interaction + collective memory. */
  rendered: VisualState = cloneState(NEUTRAL_STATE);
  /** Live interpretation of the current participant (temporary, never persisted). */
  liveIntent: VisualState | null = null;
  liveWeight = 0;
  liveWeightTarget = 0;
  interpretation: Interpretation | null = null;
  /** Current participant's top-5 emotion keywords (strongest first). */
  ranking: RankedWord[] | null = null;

  live: LiveSample = { ...EMPTY_SAMPLE };
  faceCount = 0;
  lastBlinkAt = -Infinity;
  blinkCount = 0;
  private faceLock: { x: number; y: number } | null = null;
  private lastDetectAt = 0;

  sim: SimulatedParticipant | null = null;
  demoQueue: PresetName[] = [];
  demoLoop = false;

  private commitAnim: CommitAnim | null = null;
  private lastStatement = '';

  // live visual layer
  private pupilX = 0;
  private pupilY = 0;
  private pupilVX = 0;
  private pupilVY = 0;
  private pupilScale = 1;
  private lidLive = 1;
  private attention = 0;
  private agitation = 0;
  private blinkPulseFired = true;

  private last = performance.now();
  private lastTick = 0;
  private lastSave = 0;
  private lastPoolAt = -Infinity;
  fps = 60;
  private lowFpsFor = 0;
  autoQuality = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.overlay = new Overlay();
    this.camera.onStatus = status => {
      if (status === 'unavailable' && this.inputMode === 'camera') {
        this.useMouse(); this.overlay.setNotice('Camera disconnected. Switched to mouse mode.');
      }
    };
    const restored = loadFromStorage(this.engine);
    this.engine.tick(Date.now());
    this.displayMemory = cloneState(this.engine.memory);
    this.rendered = cloneState(this.engine.memory);
    this.debug = new DebugPanel(this);
    this.overlay.setCount(this.engine.participantCount);
    if (restored) console.info(`[eye] restored ${this.engine.participantCount} encounters`);
  }

  async start(opts: { camera: boolean; demo: boolean }): Promise<void> {
    if (!this.started) { this.started = true; requestAnimationFrame(this.frame); }
    if (opts.demo) this.runDemo(true);
    if (opts.camera) await this.enableCamera();
  }

  // ---------------------------------------------------------------- main loop
  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(100, Math.max(0.1, now - this.last));
    this.last = now;
    this.fps = this.fps * 0.95 + (1000 / dt) * 0.05;
    try {
      this.step(now, dt);
    } catch (err) {
      console.error('[eye] frame error', err); // never let one bad frame stop the artwork
    }
  };

  private step(now: number, dt: number): void {
    this.readInput(now, dt);

    if (this.session.inSession) {
      this.acc.add(dt, this.live.present, this.live.movement, this.live.openness, this.live.gazeX, this.live.gazeY);
    }
    for (const ev of this.session.update(now, this.live.present)) this.handleEvent(ev, now);
    if (this.session.state === 'IDLE' && !this.session.awaitingDeparture) this.faceLock = null;

    this.advanceDemo(now);
    this.updateCommitAnim(now);

    // Collective memory decay (time-based) — once a second is plenty.
    if (now - this.lastTick > 1000) {
      this.lastTick = now;
      this.engine.tick(Date.now());
      if (!this.commitAnim) this.displayMemory = cloneState(this.engine.memory);
    }
    if (now - this.lastSave > 30000) {
      this.lastSave = now;
      saveToStorage(this.engine);
    }

    // RenderedVisualState = memory ⊕ live interpretation, smoothly interpolated
    this.liveWeight = damp(this.liveWeight, this.liveWeightTarget, dt, this.liveWeightTarget < this.liveWeight ? 220 : 700);
    const target = this.liveIntent ? mixStates(this.displayMemory, this.liveIntent, this.liveWeight) : this.displayMemory;
    const reorgActive = this.commitAnim?.arrivedAt != null;
    dampState(this.rendered, target, dt, reorgActive ? 260 : 800);

    if (now - this.lastPoolAt > 400) {
      this.lastPoolAt = now;
      if (this.session.inSession) this.updateRanking();
      this.renderer.eye.textIris.setPool(this.wordPool());
    }
    const scene = this.buildScene(now, dt);
    this.renderer.records = withOrigin(this.engine.eyes);
    this.renderer.draw(scene, dt);
    this.audio.update(scene.state, this.attention, now);

    this.overlay.update(now, this.session.state, {
      simulated: this.sim !== null,
      engagedMs: this.session.engagedMs(now),
    });
    this.debug.update(now);
    this.manageQuality(dt);
  }

  private readInput(now: number, dt: number): void {
    if (this.sim) {
      const { sample, blink } = this.sim.sample(now);
      this.live = sample;
      this.faceCount = sample.present ? 1 : 0;
      if (blink) this.onBlink(now);
      if (now - this.lastEmotionAt > EMOTION_EVERY_MS) {
        this.lastEmotionAt = now;
        const e = this.sim.emotion(now);
        if (e) this.onEmotion(e);
      }
      if (this.sim.done(now)) this.sim = null;
      return;
    }
    if (this.inputMode === 'mouse') {
      this.live = {...EMPTY_SAMPLE, present: now >= this.mouseAbsentUntil && now - this.mouse.movedAt < 18000,
        gazeX: this.mouse.x, gazeY: this.mouse.y, openness: 0.75, rawOpenness: 0.3,
        movement: Math.min(1, Math.abs(this.mouse.x - this.live.gazeX) + Math.abs(this.mouse.y - this.live.gazeY)) * 5};
      this.faceCount = 0;
      return;
    }
    if (!this.camera.ready || this.tracker.status !== 'ready') {
      this.live = { ...EMPTY_SAMPLE };
      return;
    }
    if (now - this.lastDetectAt < 30) return; // ~33 Hz tracking, independent of render rate
    const faces = this.tracker.detect(this.camera.video, now);
    if (faces === null) return;
    const trackDt = now - this.lastDetectAt;
    this.lastDetectAt = now;
    this.faceCount = faces.length;
    const idx = selectFace(faces, this.faceLock);
    const aspect = this.camera.video.videoWidth / Math.max(1, this.camera.video.videoHeight);
    this.live = this.normalizer.process(idx >= 0 ? faces[idx].landmarks : null, aspect, now, Math.min(trackDt, 200));
    if (this.live.present && this.session.state !== 'IDLE') this.faceLock = { x: this.live.faceX, y: this.live.faceY };
    else if (this.live.present && this.session.state === 'IDLE') this.faceLock = null;
    const ev = this.blink.update(this.live.present ? this.live.rawOpenness : null, now);
    if (ev) this.onBlink(now);
    if (idx >= 0 && this.emotion.ready && now - this.lastEmotionAt > EMOTION_EVERY_MS) {
      this.lastEmotionAt = now;
      void this.emotion.analyse(this.camera.video, faces[idx].landmarks, now).then((e) => e && this.onEmotion(e));
    }
    void dt;
  }

  private onEmotion(e: EmotionSample): void {
    this.liveEmotion = e;
    if (this.session.inSession) this.emoAcc.add(e);
  }

  // ---------------------------------------------------------------- events
  private handleEvent(ev: SessionEvent, now: number): void {
    switch (ev.type) {
      case 'detecting':
        this.audio.presence();
        this.blink.reset();
        this.normalizer.recalibrate();
        if (this.live.present) this.faceLock = { x: this.live.faceX, y: this.live.faceY };
        break;
      case 'sessionStart':
        this.acc.reset();
        this.emoAcc.reset();
        this.ranking = null;
        this.interpretation = null;
        this.liveIntent = null;
        this.liveWeightTarget = 0;
        this.renderer.eye.pulse(0.35, 'mist', 0.95, 1.5, 1.4);
        break;
      case 'requestInterpretation': {
        const sid = ev.sessionId;
        const features = this.acc.features();
        void this.interpreter.interpret(features, this.emoAcc.summary()).then((res) => {
          if (this.session.sessionId === sid && this.session.inSession && !this.interpretation) this.applyInterpretation(res);
        });
        break;
      }
      case 'commit':
        this.commit(now);
        break;
      case 'abort':
        this.interpretation = null;
        this.liveWeightTarget = 0;
        break;
      case 'residue':
        this.audio.residue();
        this.overlay.showStatement(this.lastStatement, `ENCOUNTER ${String(this.engine.participantCount).padStart(3, '0')} · IT WILL REMEMBER`);
        break;
      case 'idle':
        this.liveIntent = null;
        break;
    }
  }

  applyInterpretation(res: Interpretation): void {
    this.interpretation = res;
    this.liveIntent = cloneState(res.visualIntent);
    this.liveWeightTarget = 0.62;
    this.renderer.keyword.show(this.renderer.time, [res.keywords[0]], res.visualIntent); // only the top word pops out
    this.updateRanking();
    this.renderer.eye.textIris.setPool(this.wordPool(), true); // their top 5 flow in faster
    this.renderer.eye.pulse(0.6, 'mist', 0.9, 1.7, 1.2);
    this.audio.keyword();
  }

  onBlink(now: number): void {
    if (now - this.lastBlinkAt < BLINK_MS * 0.8) return; // choreography already running
    this.lastBlinkAt = now;
    this.blinkCount++;
    this.blinkPulseFired = false;
    this.audio.blink();
    if (this.session.inSession) this.acc.addBlink();
  }

  /** Finalise the participant: one eye, one influence, exactly once per session. */
  private commit(now: number): void {
    const features = this.acc.features();
    const prompt=this.pendingPrompt;this.pendingPrompt=null;
    const entry=prompt?findKeyword(prompt.mood):undefined;
    const local = entry ? {keywords:[entry.word],visualIntent:cloneState(entry.intent),source:'local' as const} : interpretLocally(features, this.emoAcc.summary());
    if(prompt)this.interpretation=local;
    if (!this.interpretation) this.applyInterpretation(local);
    const interp = this.interpretation!;
    if(prompt)this.ranking=wordsForFeeling(prompt.mood).map((word,i)=>({word,weight:1-i*.2}));else this.updateRanking(); // explicit participant mood or tracked interpretation
    const signature = mixStates(interp.visualIntent, local.visualIntent, SIGNATURE_LOCAL_WEIGHT);
    const result = this.engine.commit(
      { ...(prompt ? {note:prompt.message}:{}), id: randomId(), seed: randomSeed(), signature, keywords: this.ranking!.map((r) => r.word), pos: this.renderer.nextPosition(this.engine.participantCount) },
      Date.now(),
    );
    saveToStorage(this.engine);
    this.lastStatement = result.statement;
    this.commitAnim = { t0: now, result, ghost: cloneState(this.displayMemory), trailLaunched: false, arrivedAt: null };
    this.liveWeightTarget = 0; // the participant's live influence gathers back into their word…
    this.renderer.keyword.echo(this.renderer.time, interp.keywords[0]);
    this.overlay.setCount(this.engine.participantCount);
  }

  private updateCommitAnim(now: number): void {
    const c = this.commitAnim;
    if (!c) return;
    const el = now - c.t0;
    if (!c.trailLaunched && el >= COMMIT_FORM_MS) {
      c.trailLaunched = true;
      const from = this.renderer.recordPosition(c.result.record.id) ?? { x: c.result.record.pos.x * this.renderer.w, y: c.result.record.pos.y * this.renderer.h };
      const sig = c.result.record.signature;
      // …then travels as light into the collective eye, which reorganises on arrival.
      this.audio.trail(TRAIL_MS);
      this.renderer.trails.launch(this.renderer.time, from.x, from.y, sig.energy, sig.fluidity, TRAIL_MS, () => {
        this.audio.arrival();
        c.arrivedAt = performance.now();
        this.displayMemory = cloneState(c.result.after);
        this.liveIntent = null;
        this.renderer.eye.pulse(0.35, 'mist', 1, 1.35, 2.4);
        this.renderer.eye.textIris.setPool(this.wordPool(), true); // the iris rewrites itself
        this.renderer.eye.pulse(0.16, 'ivory', 0.9, 1.2, 2);
      });
    }
    if (c.arrivedAt != null && now - c.arrivedAt > 3200) {
      this.commitAnim = null;
      this.displayMemory = cloneState(this.engine.memory);
    }
  }

  /**
   * The words the iris is written with — always the top-5 emotion keywords:
   *  · while someone is looking (until their influence arrives): *their* live top 5,
   *    re-ranked continuously from the expression model as the encounter unfolds;
   *  · otherwise: the collective top 5 across past encounters (recent ones heavier).
   * Weights set how often and how large each word appears; the first is the largest.
   */
  wordPool(): WordWeight[] {
    const c = this.commitAnim;
    const participantActive = this.session.inSession || (c != null && c.arrivedAt == null);
    if (participantActive && this.ranking) return this.ranking.map((r) => ({ word: r.word, weight: r.weight * 10 }));
    return this.collectiveTop5();
  }

  private collectiveTop5(): WordWeight[] {
    const known = new Set(VOCAB_WORDS);
    const w = new Map<string, number>();
    const eyes = this.engine.eyes.slice(-60);
    eyes.forEach((e, i) => {
      const recency = 0.35 + 0.65 * ((i + 1) / eyes.length);
      e.keywords.forEach((k, j) => known.has(k) && w.set(k, (w.get(k) ?? 0) + ((5 - Math.min(j, 4)) / 5) * recency));
    });
    const ranked = [...w].map(([word, weight]) => ({ word, weight })).sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word));
    if (ranked.length >= 5) return ranked.slice(0, 5).map((r) => ({ word: r.word, weight: r.weight * 10 }));
    // too little history: fill with the neutral reading of the circumplex
    for (const r of rankKeywords({}, null)) if (!ranked.some((x) => x.word === r.word)) ranked.push({ word: r.word, weight: r.weight * 0.5 });
    return ranked.slice(0, 5).map((r) => ({ word: r.word, weight: Math.max(0.05, r.weight) * 10 }));
  }

  /** Re-rank the current participant's top 5, keeping the interpretation's primary word first. */
  private updateRanking(): void {
    const ranked = rankKeywords(this.acc.features(), this.emoAcc.summary());
    const primary = this.interpretation?.keywords[0];
    if (primary && ranked[0].word !== primary) {
      const rest = ranked.filter((r) => r.word !== primary).slice(0, 4);
      this.ranking = [{ word: primary, weight: (rest[0]?.weight ?? 0.2) * 1.1 }, ...rest];
    } else this.ranking = ranked;
  }

  // ---------------------------------------------------------------- scene
  private buildScene(now: number, dt: number) {
    const st = this.session.state;
    const present = this.live.present;
    const t = now / 1000;
    const engagedish = st === 'DETECTING' || st === 'ENGAGED' || st === 'INTERPRETING';

    this.attention = damp(this.attention, present && engagedish ? 1 : present ? 0.4 : 0, dt, 400);
    this.agitation = damp(this.agitation, present ? clamp01(this.live.movement / 1.1) : 0, dt, 250);

    // Pupil: follows the participant slowly and heavily; drifts when alone.
    // Soft limit (tanh) instead of a hard clamp, so it never "hits" an edge, and a
    // critically damped spring so it eases in and settles without overshoot or bounce.
    let tx: number, ty: number, omega: number;
    if (present) {
      tx = Math.tanh(this.live.gazeX * 0.9);
      ty = Math.tanh(this.live.gazeY * 0.9);
      omega = 2.4; // rad/s — ~1 s to settle
    } else {
      tx = noise1(t * 0.06, 3) * 0.4;
      ty = noise1(t * 0.05, 8) * 0.25;
      omega = 1.1;
    }
    const h = dt / 1000;
    const ax = omega * omega * (tx - this.pupilX) - 2 * omega * this.pupilVX;
    const ay = omega * omega * (ty - this.pupilY) - 2 * omega * this.pupilVY;
    this.pupilVX += ax * h;
    this.pupilVY += ay * h;
    this.pupilX += this.pupilVX * h;
    this.pupilY += this.pupilVY * h;

    // Lid follows widened / narrowed eyes; deep closures are left to the blink choreography.
    const lidTarget = present && engagedish ? 0.8 + 0.5 * clamp(this.live.openness, 0.3, 1) : 1;
    this.lidLive = damp(this.lidLive, lidTarget, dt, 170);
    const s = this.rendered;
    const breath = 1 + 0.035 * Math.sin(t * ((Math.PI * 2) / (5.2 - s.rhythm * 2.6)));

    // Blink choreography: compress contour → contract pupil → compress fibers → pulse → recover
    let closeAmt = 0;
    const bp = (now - this.lastBlinkAt) / BLINK_MS;
    if (bp >= 0 && bp < 1) {
      // fast close → brief hold → springy reopen (overshoots open, then settles)
      if (bp < BLINK_CLOSE_AT) closeAmt = easeInOutCubic(bp / BLINK_CLOSE_AT);
      else if (bp < 0.32) closeAmt = 1;
      else {
        const q = (bp - 0.32) / 0.68;
        closeAmt = Math.pow(1 - q, 2) * Math.cos(q * Math.PI * 1.35);
      }
      if (!this.blinkPulseFired && bp >= 0.32) {
        this.blinkPulseFired = true;
        this.renderer.eye.pulse(0.7, 'ivory', 0.5, 1.6, 0.6);
      }
    }

    const ackDilate = st === 'DETECTING' ? 1.12 : 1;
    const wideDilate = present ? 1 + (this.live.openness - 0.5) * 0.25 : 1;
    this.pupilScale = damp(this.pupilScale, ackDilate * wideDilate, dt, 250);

    // Commit choreography envelopes
    let reorg = 0;
    let ghost: { lid: number; state: VisualState; alpha: number } | null = null;
    const c = this.commitAnim;
    if (c?.arrivedAt != null) {
      const p = (now - c.arrivedAt) / 1100;
      reorg = p < 1 ? Math.sin(Math.PI * clamp01(p)) : 0;
      const ga = 1 - clamp01((now - c.arrivedAt - 400) / 2400);
      ghost = { lid: breath, state: c.ghost, alpha: ga };
    }

    // Perceptual gain: collective shifts are small per encounter (α = 0.22); the renderer
    // exaggerates deviation from neutral so the change is legible from across a room.
    const shown = cloneState(s);
    for (const k of VISUAL_KEYS) shown[k] = clamp01(NEUTRAL_STATE[k] + (s[k] - NEUTRAL_STATE[k]) * VISUAL_GAIN);

    shown.density = clamp01(shown.density + Math.min(.4, this.engine.eyes.length * .035));
    return {
      state: shown,
      emergent: deriveEmergent(shown),
      lid: breath * this.lidLive * (1 - 0.94 * closeAmt),
      pupilX: this.pupilX,
      pupilY: this.pupilY,
      pupilScale: this.pupilScale * (1 - 0.3 * closeAmt) * (1 + reorg * 0.15),
      blink: closeAmt,
      reorg,
      liveAgitation: this.agitation,
      attention: this.attention,
      ghost,
    };
  }

  // ---------------------------------------------------------------- demo / operator
  startSimulated(preset: PresetName): void {
    if (this.sim || this.session.inSession) return;
    this.sim = new SimulatedParticipant(preset, performance.now());
  }

  runDemo(loop = false): void {
    this.demoQueue = [...DEMO_SEQUENCE];
    this.demoLoop = loop;
  }

  private advanceDemo(now: number): void {
    if (this.sim || this.demoQueue.length === 0) {
      if (!this.sim && this.demoQueue.length === 0 && this.demoLoop && this.session.state === 'IDLE' && now > this.session.cooldownUntil + 6000) {
        const pool = Object.keys(PRESETS) as PresetName[];
        this.demoQueue = [pool[Math.floor(Math.random() * pool.length)]];
      }
      if (this.sim || this.demoQueue.length === 0) return;
    }
    if (this.session.state === 'IDLE' && !this.session.awaitingDeparture && now >= this.session.cooldownUntil + 600) {
      this.sim = new SimulatedParticipant(this.demoQueue.shift()!, now);
    }
  }

  injectKeyword(word: string): void {
    const entry = findKeyword(word);
    if (!entry) return;
    if (this.session.inSession) {
      this.applyInterpretation({ keywords: [entry.word], visualIntent: cloneState(entry.intent), source: 'local' });
    } else if (word in PRESETS) {
      this.startSimulated(word as PresetName);
    }
  }

  triggerBlink(): void {
    this.onBlink(performance.now());
  }

  forceCommit(): void {
    for (const ev of this.session.forceCommit(performance.now())) this.handleEvent(ev, performance.now());
  }

  resetMemory(): void {
    this.engine.reset(Date.now());
    clearStorage();
    this.session.sessionId++;
    this.session.fsm.go('IDLE', performance.now());
    this.session.awaitingDeparture = false;
    this.session.committed = false;
    this.session.cooldownUntil = performance.now() + 2000;
    this.interpretation = null; this.ranking = null; this.liveIntent = null;
    this.liveWeight = 0; this.liveWeightTarget = 0;
    this.acc.reset(); this.emoAcc.reset(); this.sim = null; this.demoQueue = []; this.demoLoop = false;
    this.rendered = cloneState(NEUTRAL_STATE);
    this.renderer.clearTraces();
    this.pendingPrompt=null;
    this.renderer.eye.textIris.setPool(this.wordPool(), true);
    this.displayMemory = cloneState(NEUTRAL_STATE);
    this.commitAnim = null;
    this.overlay.setCount(0);
    this.overlay.clearStatement();
    saveToStorage(this.engine);
  }

  exportState(): string {
    return serialize(this.engine);
  }

  setQuality(q: Quality, auto = false): void {
    this.autoQuality = auto;
    this.renderer.setQuality(q);
  }

  private manageQuality(dt: number): void {
    if (!this.autoQuality) return;
    if (this.fps < 28) this.lowFpsFor += dt;
    else this.lowFpsFor = Math.max(0, this.lowFpsFor - dt);
    if (this.lowFpsFor > 4000) {
      this.lowFpsFor = 0;
      const q = this.renderer.quality;
      if (q === 'high') this.renderer.setQuality('medium');
      else if (q === 'medium') this.renderer.setQuality('low');
    }
  }
}
