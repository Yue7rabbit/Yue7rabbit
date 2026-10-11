import { mainEyeRadius } from './satelliteMotion';
import { SatelliteMotion } from './satelliteMotion';
import type { IndividualEyeRecord } from '../collective/collectiveEngine';
import { drawSatellite } from './satellites';
import type { EmergentTraits } from '../collective/influenceRules';
import type { VisualState } from '../collective/visualState';
import { CollectiveEye } from './collectiveEye';
import { InfluenceTrails } from './influenceTrail';
import { BG, QUALITY, type Quality } from './palette';
import { Atmosphere } from './particles';
import { KeywordFX } from './typography';

export type Scene = {
  state: VisualState;
  emergent: EmergentTraits;
  lid: number;
  pupilX: number;
  pupilY: number;
  pupilScale: number;
  blink: number;
  reorg: number;
  liveAgitation: number;
  attention: number;
  ghost: { lid: number; state: VisualState; alpha: number } | null;
};

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  quality: Quality = 'high';
  eye = new CollectiveEye();
  trails = new InfluenceTrails();
  keyword = new KeywordFX(QUALITY.high.glyphParticles);
  private atmosphere = new Atmosphere();
  private vignette: CanvasGradient | null = null;
  private t = 0;
  records: IndividualEyeRecord[] = [];
  motion=new SatelliteMotion();
  recordPosition(id:string):{x:number;y:number}|undefined{return this.motion.bodies.get(id);}
  hitTest(x:number,y:number):IndividualEyeRecord|undefined {
    const hit=[...this.motion.bodies.values()].reverse().find(b=>Math.hypot(b.x-x,b.y-y)<b.radius*1.2);
    return hit?this.records.find(r=>r.id===hit.id):undefined;
  }
  nextPosition(n: number): {x:number;y:number} {
    const anchors=[[.17,.25],[.82,.27],[.15,.73],[.84,.74],[.36,.19],[.65,.81],[.09,.47],[.92,.49],[.62,.17],[.37,.81],[.25,.82],[.76,.18]];
    const a=anchors[n%anchors.length]; return {x:a[0],y:a[1]};
  }
  clearTraces():void {this.motion.clear();this.records=[];this.trails=new InfluenceTrails();this.keyword=new KeywordFX(QUALITY[this.quality].glyphParticles);}


  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dprCap);
    const cw = Math.max(1, Math.floor(window.innerWidth * this.dpr));
    const ch = Math.max(1, Math.floor(window.innerHeight * this.dpr));
    if (cw !== this.canvas.width || ch !== this.canvas.height) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.w = cw;
    this.h = ch;
    const v = this.ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
    v.addColorStop(0, 'rgba(9,11,16,0)');
    v.addColorStop(1, 'rgba(3,4,6,0.85)');
    this.vignette = v;
  }

  /** Half-width of the eye's almond. Leaves room for the silk tails on either side. */
  get R(): number {
    return mainEyeRadius(this.w, this.h);
  }

  /** Where the visitor's word sits under the eye — origin of the influence trail. */
  wordAnchor(): { x: number; y: number } {
    return { x: this.w / 2, y: this.h / 2 + this.R * 0.66 };
  }

  draw(scene: Scene, dtMs: number): void {
    const { ctx, w, h, dpr } = this;
    this.t += Math.min(dtMs, 100) / 1000;
    const t = this.t;
    const q = QUALITY[this.quality];
    const R = this.R;
    const cx = w / 2;
    const cy = h / 2;

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    this.atmosphere.draw(ctx, w, h, t, q.atmosphere, scene.state.energy, scene.pupilX, scene.pupilY, dpr);

    const bodies=this.motion.step(this.records,w,h,t,dtMs/1000);
    const drawBodies=(front:boolean)=>{
      for(const body of bodies){if((body.depth>=0)!==front)continue;const record=this.records.find(r=>r.id===body.id)!;drawSatellite(ctx,record,w,h,t,dpr,body);}
    };
    drawBodies(false);
    // Central collective eye
    this.eye.draw(
      ctx,
      {
        cx,
        cy,
        R,
        state: scene.state,
        emergent: scene.emergent,
        lid: scene.lid,
        pupilX: scene.pupilX,
        pupilY: scene.pupilY,
        pupilScale: scene.pupilScale,
        blink: scene.blink,
        reorg: scene.reorg,
        liveAgitation: scene.liveAgitation,
        attention: scene.attention,
        fiberMultiplier: q.fibers * (1 + Math.min(.5, this.records.length * .035)),
        dpr,
        ghost: null,
      },
      dtMs,
    );

    drawBodies(true);
    const gg = this.eye.geometry;
    this.trails.draw(ctx, t, dtMs, gg.irisX, gg.irisY, w, dpr);
    this.keyword.draw(ctx, t, dtMs, { cx, cy, R, irisX: gg.irisX, irisY: gg.irisY, irisR: gg.irisR, dpr });

    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** Renderer-local clock in seconds (used by trails/keywords). */
  get time(): number {
    return this.t;
  }
}
