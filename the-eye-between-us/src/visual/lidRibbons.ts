import type { VisualState } from '../collective/visualState';
import { mulberry32 } from '../utils/random';

export const U_MAX = 1;
/** Identical left and right halves; shared by the iris mask and both silk surfaces. */
export function lidProfile(u:number,_upper:boolean):number {
 return Math.pow(Math.max(0,Math.cos(Math.min(1,Math.abs(u))*Math.PI*.5)),1.12);
}
export function lidY(u:number,cy:number,h:number,upper:boolean):number {
 return cy+(upper?-1:1)*h*lidProfile(u,upper);
}
export function eyeOpening(cx:number,cy:number,R:number,hu:number,hl:number):Path2D {
 const p=new Path2D();
 for(let i=0;i<=160;i++){const u=-1+i/80;const y=lidY(u,cy,hu,true);i?p.lineTo(cx+u*R,y):p.moveTo(cx+u*R,y);}
 for(let i=160;i>=0;i--){const u=-1+i/80;p.lineTo(cx+u*R,lidY(u,cy,hl,false));}
 p.closePath();return p;
}
export type SilkOpts={breath:number;flare:number;attention:number;dpr:number};

/** Unbroken satin-light ribbons. Every layer spans the entire lid, without segmented strands. */
export function drawSilkLids(ctx:CanvasRenderingContext2D,cx:number,cy:number,R:number,hu:number,hl:number,_t:number,_s:VisualState,o:SilkOpts):void {
 ctx.save();ctx.globalCompositeOperation='lighter';
 const gather=1-Math.max(0,o.flare)*.78;
 const glow=.88+o.breath*.08+o.attention*.14;
 for(const upper of [true,false]){
  const h=upper?hu:hl;
  const center=new Path2D();
  for(let i=0;i<=160;i++){const u=-1+i/80;const y=lidY(u,cy,h,upper);i?center.lineTo(cx+u*R,y):center.moveTo(cx+u*R,y);}
  const gradient=ctx.createLinearGradient(cx-R,0,cx+R,0);
  gradient.addColorStop(0,'rgba(85,112,158,0)');
  gradient.addColorStop(.08,'rgba(109,139,191,.25)');
  gradient.addColorStop(.3,'rgba(172,192,224,.75)');
  gradient.addColorStop(.5,'rgba(201,212,233,.88)');
  gradient.addColorStop(.7,'rgba(172,192,224,.75)');
  gradient.addColorStop(.92,'rgba(109,139,191,.25)');
  gradient.addColorStop(1,'rgba(85,112,158,0)');
  ctx.save();ctx.filter=`blur(${Math.max(2,R*.013)}px)`;
  ctx.strokeStyle=gradient;ctx.globalAlpha=.24*glow;ctx.lineWidth=R*.038*gather;ctx.stroke(center);ctx.restore();
  // Nested filled strips produce a smooth cross-sectional gradient, with no hard outline.
  for(let layer=22;layer>=1;layer--){
   const k=layer/22,path=new Path2D();
   for(let side=0;side<2;side++){
    for(let n=0;n<=160;n++){
     const i=side?160-n:n,u=-1+i/80;
     const w=R*.022*k*gather*Math.pow(Math.max(0,1-u*u),.65);
     const y=lidY(u,cy,h,upper)+(side?-1:1)*w;
     if(side===0&&n===0)path.moveTo(cx+u*R,y);else path.lineTo(cx+u*R,y);
    }
   }
   path.closePath();ctx.fillStyle=gradient;ctx.globalAlpha=(.025+.03*(1-k))*glow;ctx.fill(path);
  }
 }
 ctx.restore();
}

const rnd=mulberry32(49173);
const orbitalDust=Array.from({length:3600},()=>({
 angle:rnd()*Math.PI*2, radius:(rnd()+rnd()-1), height:rnd()-.5, size:rnd(), speed:.86+rnd()*.28,
}));

/** A tilted 3D annulus projected into the scene. Split passes allow iris occlusion. */
export function drawOrbitalParticles(ctx:CanvasRenderingContext2D,cx:number,cy:number,irisR:number,t:number,blink:number,dpr:number,density:number,front:boolean):void {
 ctx.save();ctx.globalCompositeOperation='lighter';
 const buckets=Array.from({length:6},()=>new Path2D());
 const count=Math.floor(orbitalDust.length*(.65+.35*density));
 const compress=1-Math.max(0,blink)*.84;
 for(let i=0;i<count;i++){
  const p=orbitalDust[i];
  const angle=p.angle+t*.065*p.speed;
  const depth=Math.sin(angle);
  if((depth>=0)!==front)continue;
  const radius=1.56+p.radius*.15;
  const px=Math.cos(angle)*irisR*radius;
  const py=(depth*irisR*.63+p.height*irisR*.045)*compress;
  const x=cx+px,y=cy+py+px*.085;
  const perspective=.88+.12*depth;
  const size=Math.max(.45,dpr*(.45+p.size*.8))*perspective;
  const brightness=Math.min(5,Math.floor((.25+.75*p.size)*(front?1:.55)*6));
  buckets[brightness].rect(x,y,size,size);
 }
 for(let i=0;i<6;i++){ctx.fillStyle=`rgba(${i>3?'198,212,235':'117,147,192'},${.035+i*.075})`;ctx.fill(buckets[i]);}
 ctx.restore();
}
