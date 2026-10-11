import type { IndividualEyeRecord } from '../collective/collectiveEngine';
import { mulberry32 } from '../utils/random';
export type OrbitBody={id:string;x:number;y:number;radius:number;scale:number;spin:number;depth:number;glow:number;ox:number;oy:number;vx:number;vy:number;phase:number;speed:number;band:number;spinSpeed:number;cooldown:number};
/** Shared artwork sizing leaves room for satellites on short landscape screens. */
export const mainEyeRadius=(w:number,h:number):number=>Math.min(w*.35,h*.46);
export const satelliteRadius=(w:number,h:number):number=>Math.min(w*.042,h*.05);
export function orbitClearance(w:number,h:number,radius:number){
 const eye=mainEyeRadius(w,h),gap=Math.min(w,h)*.018;
 return {x:eye+radius+gap,top:eye*.66+radius+gap,bottom:eye*.48+radius+gap};
}
export class SatelliteMotion {
 bodies=new Map<string,OrbitBody>();
 clear():void{this.bodies.clear();}
 step(records:IndividualEyeRecord[],w:number,h:number,time:number,dt:number):OrbitBody[]{
  const visible=records.slice(-48);const ids=new Set(visible.map(e=>e.id));
  for(const id of this.bodies.keys())if(!ids.has(id))this.bodies.delete(id);
  const d=Math.min(.05,Math.max(0,dt));const base=satelliteRadius(w,h);
  for(const e of visible){
   if(!this.bodies.has(e.id)){
    const r=mulberry32(e.seed);const phase=r()*Math.PI*2,scale=.6+r()*.95;
    this.bodies.set(e.id,{id:e.id,x:0,y:0,radius:0,scale,phase,speed:.018+r()*.025,band:.88+r()*.12,spinSpeed:.035+r()*.055,spin:0,depth:0,glow:0,ox:0,oy:0,vx:0,vy:0,cooldown:0});
   }
  }
  const bodies=[...this.bodies.values()];
  for(const b of bodies){
   const a=b.phase+time*b.speed;b.depth=Math.sin(a);b.spin=b.phase+time*b.spinSpeed;
   b.vx+=(-b.ox*.65-b.vx*1.7)*d;b.vy+=(-b.oy*.65-b.vy*1.7)*d;
   b.ox+=b.vx*d;b.oy+=b.vy*d;
   const perspective=.88+.12*b.depth;b.radius=base*b.scale*perspective*.86;
   const clearance=orbitClearance(w,h,b.radius);
   const spread=1+(1-b.band)*.18;
   const rx=clearance.x*spread;
   const ry=(Math.cos(a)>=0?Math.max(clearance.top,h*.29):Math.max(clearance.bottom,h*.25))*spread;
   b.x=w*.5+Math.sin(a)*rx+b.ox;
   b.y=h*.5-Math.cos(a)*ry+b.oy;
   b.glow=Math.max(0,b.glow-d*.55);b.cooldown=Math.max(0,b.cooldown-d);
  }
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   const a=bodies[i],b=bodies[j],dx=b.x-a.x,dy=b.y-a.y;
   const distance=Math.hypot(dx,dy),limit=a.radius+b.radius;
   if(distance>=limit)continue;
   const nx=distance>.001?dx/distance:1,ny=distance>.001?dy/distance:0;
   const push=(limit-distance)*.52;
   a.ox-=nx*push;a.oy-=ny*push;b.ox+=nx*push;b.oy+=ny*push;
   a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
   if(a.cooldown===0&&b.cooldown===0){
    const impulse=base*.13;a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;
    a.glow=b.glow=1;a.cooldown=b.cooldown=1.5;
   }
  }
  // Collision deflections must never push an imprint back across the eye.
  for(const b of bodies){
   const bounds=orbitClearance(w,h,b.radius),dx=b.x-w*.5,dy=b.y-h*.5;
   const ry=dy<0?bounds.top:bounds.bottom;
   const distance=Math.hypot(dx/bounds.x,dy/ry);
   if(distance<1){
    const correction=1/Math.max(distance,.001);
    b.x=w*.5+dx*correction;b.y=h*.5+dy*correction;
    b.ox+=b.x-(w*.5+dx);b.oy+=b.y-(h*.5+dy);
   }
  }
  return bodies;
 }
}
