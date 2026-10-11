import type { VisualState } from '../collective/visualState';
import { BLINK_CLOSE_AT, BLINK_MS } from '../app/timing';
import { ROOT_HZ, noteHz, soundParams } from './soundscape';

/** When the lids meet in the blink animation. */
const BLINK_CLOSE_S = (BLINK_MS * BLINK_CLOSE_AT) / 1000;

/**
 * Immersive generative sound, synthesised live with the Web Audio API (no audio files).
 *
 * Background (the only sound when nobody is interacting): a low drone, a breathing pad
 * and a filtered-noise "black hole wind", all sent into a long synthetic reverb. Every layer follows
 * the collective state, so the room sounds different after each visitor.
 *
 * Interaction cues — and only these, only when their interaction happens: presence swell,
 * blink hush, keyword chime, influence shimmer, arrival bloom, residue tone.
 *
 * Browsers only allow audio after a user gesture, so `start()` must be called from one.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  muted = false;
  volume = 0.7;
  private master!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private bed!: GainNode;
  private reverb!: ConvolverNode;
  private padFilter!: BiquadFilterNode;
  private padGain!: GainNode;
  private breathLfo!: OscillatorNode;
  private minorThird!: GainNode;
  private majorThird!: GainNode;
  private upperGain!: GainNode;
  private dissonance!: GainNode;
  private windFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private windLfo!: OscillatorNode;
  private lastUpdate = 0;

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  async start(): Promise<boolean> {
    try {
      if (!this.ctx) this.build();
      await this.ctx!.resume();
      return this.running;
    } catch {
      return false;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolume();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.9, this.ctx.currentTime, 0.4);
  }

  // ------------------------------------------------------------------ graph
  private build(): void {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 6, 2.6);
    this.wet = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.dry.gain.value = 0.6;
    this.reverb.connect(this.wet).connect(this.master);
    this.dry.connect(this.master);
    // Background layers share a bus so interaction cues can briefly duck them.
    this.bed = ctx.createGain();
    this.bed.connect(this.dry);
    this.bed.connect(this.reverb);
    const send = (node: AudioNode) => node.connect(this.bed);

    // Drone: detuned low sines on the root and fifth
    const drone = ctx.createGain();
    drone.gain.value = 0.16;
    for (const [f, d] of [[ROOT_HZ, -4], [ROOT_HZ, 5], [ROOT_HZ * 1.5, 2], [ROOT_HZ * 2, -3]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(drone);
      o.start();
    }
    // tension shadow: a minor second above the root, faded in by tension
    this.dissonance = ctx.createGain();
    this.dissonance.gain.value = 0;
    const dis = ctx.createOscillator();
    dis.type = 'sine';
    dis.frequency.value = ROOT_HZ * 2 * Math.pow(2, 1 / 12);
    dis.connect(this.dissonance).connect(drone);
    dis.start();
    send(drone);

    // Pad: slow-breathing chord through a moving low-pass
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 400;
    this.padFilter.Q.value = 0.7;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.05;
    this.padFilter.connect(this.padGain);
    send(this.padGain);
    // breathing: LFO on pad level
    this.breathLfo = ctx.createOscillator();
    this.breathLfo.frequency.value = 0.08;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.03;
    this.breathLfo.connect(breathDepth).connect(this.padGain.gain);
    this.breathLfo.start();
    const voice = (hz: number, out: AudioNode, type: OscillatorType = 'triangle') => {
      for (const d of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = hz;
        o.detune.value = d;
        o.connect(out);
        o.start();
      }
    };
    voice(ROOT_HZ * 2, this.padFilter); // A2
    voice(ROOT_HZ * 3, this.padFilter); // E3
    this.minorThird = ctx.createGain();
    this.majorThird = ctx.createGain();
    this.minorThird.connect(this.padFilter);
    this.majorThird.connect(this.padFilter);
    voice(ROOT_HZ * 4 * Math.pow(2, 3 / 12), this.minorThird); // C4
    voice(ROOT_HZ * 4 * Math.pow(2, 4 / 12), this.majorThird); // C#4
    this.upperGain = ctx.createGain();
    this.upperGain.connect(this.padFilter);
    voice(ROOT_HZ * 4 * Math.pow(2, 7 / 12), this.upperGain, 'sine'); // E4
    voice(ROOT_HZ * 8 * Math.pow(2, 2 / 12), this.upperGain, 'sine'); // B4

    // Wind: looping noise through a slowly sweeping band-pass
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 4);
    noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 1.4;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.03;
    noise.connect(this.windFilter).connect(this.windGain);
    send(this.windGain);
    this.windLfo = ctx.createOscillator();
    this.windLfo.frequency.value = 0.05;
    const sweep = ctx.createGain();
    sweep.gain.value = 300;
    this.windLfo.connect(sweep).connect(this.windFilter.frequency);
    this.windLfo.start();
    noise.start();

    this.applyVolume();
  }

  /** Follow the collective state (call every frame; throttled internally). */
  update(state: VisualState, attention: number, nowMs: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (nowMs - this.lastUpdate > 250) {
      this.lastUpdate = nowMs;
      const p = soundParams(state, attention);
      const t = ctx.currentTime;
      const glide = 2.5;
      this.padFilter.frequency.setTargetAtTime(p.cutoff, t, glide);
      this.breathLfo.frequency.setTargetAtTime(p.breathHz, t, glide);
      this.dissonance.gain.setTargetAtTime(p.dissonance * 0.35, t, glide);
      this.wet.gain.setTargetAtTime(p.reverb, t, glide);
      this.upperGain.gain.setTargetAtTime(p.upper * 0.6, t, glide);
      this.minorThird.gain.setTargetAtTime(1 - p.major, t, glide);
      this.majorThird.gain.setTargetAtTime(p.major, t, glide);
      this.windGain.gain.setTargetAtTime(p.wind * 0.09, t, glide);
      this.windLfo.frequency.setTargetAtTime(p.windSweepHz, t, glide);
    }
  }

  // ------------------------------------------------------------------ cues
  /** Someone has stepped in front of the eye: a slow, low swell. */
  presence(): void {
    const ctx = this.ctx;
    if (!this.running || !ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(noteHz(0, 1), t);
    o.frequency.exponentialRampToValueAtTime(noteHz(4, 1), t + 2.5);
    // audible at once, then swells as the eye turns toward the visitor
    this.oneShot(o, shape(ctx, t, [[0.02, 0.05], [1.2, 0.11], [4.2, 0.0001]]), t, 4.5);
  }

  /** A blink: a soft breath of noise closing and opening, with a low touch. */
  blink(): void {
    const ctx = this.ctx;
    if (!this.running || !ctx) return;
    const t = ctx.currentTime;
    const meet = t + BLINK_CLOSE_S; // the instant the lids meet in the animation
    const reopen = t + (BLINK_MS / 1000) * 0.32;

    // the room holds its breath for a moment, so the blink stands out
    this.duck(0.45, t, BLINK_MS / 1000 + 0.15);

    // breath of air: the filter closes with the lids and opens again
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.9);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(600, meet);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.55);
    src.connect(f);
    this.oneShot(f, shape(ctx, t, [[0.015, 0.2], [BLINK_CLOSE_S, 0.14], [0.65, 0.0001]]), t, 0.8, src);

    // soft tick + low touch exactly when the lids meet (pitched to carry on small speakers)
    const tickSrc = ctx.createBufferSource();
    tickSrc.buffer = noiseBuffer(ctx, 0.08);
    const tick = ctx.createBiquadFilter();
    tick.type = 'highpass';
    tick.frequency.value = 1500;
    tickSrc.connect(tick);
    this.oneShot(tick, shape(ctx, meet, [[0.002, 0.12], [0.05, 0.0001]]), meet, 0.08, tickSrc);
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(220, meet);
    thud.frequency.exponentialRampToValueAtTime(110, meet + 0.25);
    this.oneShot(thud, shape(ctx, meet, [[0.004, 0.16], [0.35, 0.0001]]), meet, 0.45);

    // a small glint of light as the eye reopens
    this.chime(0.045, 5, 4, reopen - t);
  }

  /** Briefly lower the background bed (seconds), then let it return. */
  private duck(depth: number, t: number, dur: number): void {
    const g = this.bed.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1 - depth, t + 0.04);
    g.setTargetAtTime(1, t + dur, 0.25);
  }

  /** The keyword appears: a bell-like chord. */
  keyword(): void {
    if (!this.running) return;
    [0, 2, 4].forEach((d, i) => this.chime(0.07 - i * 0.015, 4 + (i === 2 ? 1 : 0), d, i * 0.05)); // first note instantly
  }

  /** The influence trail flies into the iris: a rising shimmer. */
  trail(durationMs: number): void {
    const ctx = this.ctx;
    if (!this.running || !ctx) return;
    const t = ctx.currentTime;
    const dur = durationMs / 1000;
    for (const [d, g] of [[0, 0.05], [7, 0.03]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.detune.value = d;
      o.frequency.setValueAtTime(noteHz(0, 3), t);
      o.frequency.exponentialRampToValueAtTime(noteHz(4, 5), t + dur);
      // starts with the trail and brightens as it flies; ends as it lands
      this.oneShot(o, shape(ctx, t, [[0.02, g * 0.6], [dur, g], [dur + 0.7, 0.0001]]), t, dur + 1);
    }
  }

  /** Influence arrives: a deep bloom with a widening chord. */
  arrival(): void {
    const ctx = this.ctx;
    if (!this.running || !ctx) return;
    const t = ctx.currentTime;
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(ROOT_HZ * 2, t);
    boom.frequency.exponentialRampToValueAtTime(ROOT_HZ, t + 1.2);
    this.oneShot(boom, shape(ctx, t, [[0.005, 0.22], [3.5, 0.0001]]), t, 4);
    [0, 4, 6, 9].forEach((d, i) => this.chime(0.05, 3 + Math.floor(d / 7), d, i * 0.07)); // opens with the boom
  }

  /** The residue statement: a single soft tone. */
  residue(): void {
    if (!this.running) return;
    this.chime(0.05, 4, 4, 0);
  }

  private chime(gain: number, octave: number, degree = Math.floor(Math.random() * 7), delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const hz = noteHz(degree, octave);
    // simple FM bell: carrier + inharmonic modulator, both decaying
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = hz;
    const mod = ctx.createOscillator();
    mod.frequency.value = hz * 2.76;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(hz * 0.6, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + 2);
    mod.connect(modGain).connect(car.frequency);
    mod.start(t);
    mod.stop(t + 4.5);
    this.oneShot(car, env(ctx, t, 0.01, 4, gain), t, 4.5);
  }

  /** Route a source through an envelope into the mix, and clean up when done. */
  private oneShot(node: AudioNode, gain: GainNode, t: number, dur: number, src?: AudioScheduledSourceNode): void {
    node.connect(gain);
    gain.connect(this.dry);
    gain.connect(this.reverb);
    const s = src ?? (node as AudioScheduledSourceNode);
    s.start(t);
    s.stop(t + dur);
    s.onended = () => {
      node.disconnect();
      gain.disconnect();
    };
  }
}

function env(ctx: AudioContext, t: number, attack: number, release: number, peak: number): GainNode {
  return shape(ctx, t, [[attack, peak], [attack + release, 0.0001]]);
}

/** Gain envelope through [time offset, level] breakpoints (exponential segments). */
function shape(ctx: AudioContext, t: number, points: [number, number][]): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (const [dt, v] of points) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), t + dt);
  return g;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < d.length; i++) {
    b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); // softened (pinkish) noise
    d[i] = b * 3;
  }
  return buf;
}

/** Synthetic stereo impulse response: exponentially decaying noise (a large dark hall). */
function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp = 0.7 * lp + 0.3 * (Math.random() * 2 - 1);
      d[i] = lp * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}
