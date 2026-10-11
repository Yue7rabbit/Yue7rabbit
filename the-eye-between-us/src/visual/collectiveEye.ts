import type { EmergentTraits } from '../collective/influenceRules';
import type { VisualState } from '../collective/visualState';
import { TAU, clamp01, easeOutCubic } from '../utils/math';
import { drawSilkLids, drawOrbitalParticles, eyeOpening } from './lidRibbons';
import { TextIris } from './textIris';
import { AMBER, GRAY, IVORY, MIST, rgba } from './palette';

export type EyeInput = {
  cx: number;
  cy: number;
  R: number; // half-width of the almond
  state: VisualState;
  emergent: EmergentTraits;
  lid: number; // 0 closed … 1 normal … 1.2 wide
  pupilX: number; // -1..1
  pupilY: number;
  pupilScale: number;
  blink: number; // >0 squeezed by a blink, <0 springy overshoot while reopening
  reorg: number; // 0..1 commit reorganisation envelope
  liveAgitation: number;
  attention: number; // 0..1 someone is present
  fiberMultiplier: number;
  dpr: number;
  ghost: { lid: number; state: VisualState; alpha: number } | null;
};

export type EyeGeometry = { irisX: number; irisY: number; irisR: number; pupilR: number; hu: number; hl: number };

type Ring = { t0: number; strength: number; colour: 'ivory' | 'amber' | 'mist'; from: number; to: number; dur: number };

export class CollectiveEye {
  readonly textIris = new TextIris();
  private rotation = 0;
  private time = 0;
  private rings: Ring[] = [];
  geometry: EyeGeometry = { irisX: 0, irisY: 0, irisR: 1, pupilR: 1, hu: 1, hl: 1 };

  /** Expanding ring, e.g. on blink or when influence arrives. Radii are multiples of irisR. */
  pulse(strength: number, colour: Ring['colour'] = 'ivory', from = 1, to = 2.2, dur = 1.1): void {
    this.rings.push({ t0: this.time, strength, colour, from, to, dur });
    if (this.rings.length > 8) this.rings.shift();
  }

  draw(ctx: CanvasRenderingContext2D, inp: EyeInput, dtMs: number): void {
    const dt = Math.min(dtMs, 100) / 1000;
    this.time += dt;
    const s = inp.state;
    const e = inp.emergent;
    const t = this.time;
    this.rotation += dt * (0.004 + s.energy * 0.012 + e.laminarRush * 0.018 + s.rhythm * 0.006);

    const { cx, cy, R } = inp;
    const shape = 1 - s.tension * 0.1;
    const hu = R * 0.5 * inp.lid * (0.74 + 0.52 * s.openness) * shape;
    const hl = R * 0.37 * inp.lid * (0.8 + 0.4 * s.openness) * shape;

    const irisR = R * 0.47 * (0.94 + 0.12 * s.openness) * (1 + inp.reorg * 0.05);
    // Small, steady range; independent of lid height so blinks never jolt the pupil.
    const irisX = cx + inp.pupilX * R * 0.13;
    const irisY = cy + inp.pupilY * R * 0.07;
    const breathPulse = 1 + 0.035 * Math.sin(t * (0.6 + s.rhythm * 2.2));
    const pupilR =
      irisR *
      (0.30 + 0.1 * s.openness - 0.04 * s.tension + 0.08 * e.frayedHorizon) *
      inp.pupilScale *
      breathPulse;
    this.geometry = { irisX, irisY, irisR, pupilR, hu, hl };

    // 1. Aura & echo contours
    const aura = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.5);
    aura.addColorStop(0, rgba(MIST, 0.05 + inp.attention * 0.04 + inp.reorg * 0.06));
    aura.addColorStop(1, rgba(MIST, 0));
    ctx.fillStyle = aura;
    ctx.fillRect(cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2);

    const lidPath = eyeOpening(cx, cy, R, hu, hl);

    // 2. Sclera field
    const sclera = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    sclera.addColorStop(0, 'rgba(14,17,24,0.95)');
    sclera.addColorStop(1, 'rgba(9,11,16,0.95)');
    ctx.fillStyle = sclera;
    ctx.fill(lidPath);

    // Far half of the annulus goes behind the iris.
    drawOrbitalParticles(ctx, irisX, irisY, irisR, t, inp.blink, inp.dpr, s.density, false);

    // 3. Iris (clipped by lids)
    if (hu + hl > R * 0.02) {
      ctx.save();
      ctx.clip(lidPath);

      const limbus = ctx.createRadialGradient(irisX, irisY, pupilR, irisX, irisY, irisR * 1.08);
      limbus.addColorStop(0, 'rgba(8,10,15,1)');
      limbus.addColorStop(0.8, 'rgba(12,15,22,1)');
      limbus.addColorStop(0.97, rgba(MIST, 0.015));
      limbus.addColorStop(1, 'rgba(9,11,16,0)');
      ctx.fillStyle = limbus;
      ctx.beginPath();
      ctx.arc(irisX, irisY, irisR * 1.08, 0, TAU);
      ctx.fill();

      // Black-hole iris: words, fibers, sheets and particles spiralling into the pupil
      const sq = inp.blink;
      this.textIris.draw(
        ctx,
        {
          cx: irisX,
          cy: irisY,
          pupilR,
          irisR,
          time: t,
          rotation: this.rotation,
          state: s,
          emergent: e,
          squeeze: sq,
          twist: inp.reorg * 1.4,
          flowX: inp.pupilX,
          flowY: inp.pupilY,
          brightness: 0.9 + inp.reorg * 0.6 + inp.attention * 0.15,
          agitation: inp.liveAgitation,
          density: Math.min(1, inp.fiberMultiplier * (0.35 + 0.65 * s.density)),
          lineScale: inp.dpr * Math.max(0.7, R / 420),
        },
        dtMs,
      );

      // Lid shadow for depth
      const sh = ctx.createLinearGradient(0, cy - hu, 0, cy - hu + R * 0.25);
      sh.addColorStop(0, 'rgba(9,11,16,0.85)');
      sh.addColorStop(1, 'rgba(9,11,16,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(cx - R, cy - hu, R * 2, R * 0.25);
      ctx.restore();
    }

    // Near half passes in front, making the orbital direction and depth visible.
    drawOrbitalParticles(ctx, irisX, irisY, irisR, t, inp.blink, inp.dpr, s.density, true);

    // 4. Eyelids: sheaves of luminous silk that breathe; on a blink they collapse into one bright seam
    drawSilkLids(ctx, cx, cy, R, hu, hl, t, s, {
      breath: 0.5 + 0.5 * Math.sin(t * (0.6 + s.rhythm * 1.4)),
      flare: Math.max(0, inp.blink),
      attention: inp.attention,
      dpr: inp.dpr,
    });

    // 5. Ghost of the previous state during commit (before/after contrast)
    if (inp.ghost && inp.ghost.alpha > 0.01) {
      const g = inp.ghost;
      const ghu = R * 0.5 * g.lid * (0.74 + 0.52 * g.state.openness) * (1 - g.state.tension * 0.1);
      const ghl = R * 0.37 * g.lid * (0.8 + 0.4 * g.state.openness) * (1 - g.state.tension * 0.1);
      ctx.setLineDash([inp.dpr * 3, inp.dpr * 6]);
      ctx.strokeStyle = rgba(GRAY, 0.6 * g.alpha);
      ctx.lineWidth = inp.dpr * 1.1;
      ctx.stroke(eyeOpening(cx, cy, R, ghu, ghl));
      const gIris = R * 0.47 * (0.94 + 0.12 * g.state.openness);
      ctx.beginPath();
      ctx.arc(irisX, irisY, gIris * (0.25 + 0.15 * g.state.openness - 0.06 * g.state.tension), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 6. Pulse rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      const p = (t - r.t0) / r.dur;
      if (p >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      const ep = easeOutCubic(p);
      const rad = irisR * (r.from + (r.to - r.from) * ep);
      const col = r.colour === 'amber' ? AMBER : r.colour === 'mist' ? MIST : IVORY;
      ctx.beginPath();
      ctx.ellipse(irisX, irisY, rad, rad * (0.55 + 0.45 * clamp01(hu / irisR)), 0, 0, TAU);
      ctx.strokeStyle = rgba(col, (1 - p) * 0.45 * r.strength);
      ctx.lineWidth = inp.dpr * (1 + (1 - p) * 2.5);
      ctx.stroke();
    }
  }
}
