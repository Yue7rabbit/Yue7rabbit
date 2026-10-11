import { satelliteRadius } from './satelliteMotion';
import type { IndividualEyeRecord } from '../collective/collectiveEngine';
import { mulberry32 } from '../utils/random';
import { emotionColour } from './emotionPalette';
import { rgba } from './palette';
import type { OrbitBody } from './satelliteMotion';

/** Small galactic nuclei: circular iris, dark pupil and a depth-sorted dust annulus. No lids. */
export function drawSatellite(ctx:CanvasRenderingContext2D,eye:IndividualEyeRecord,w:number,h:number,t:number,dpr:number,body?:OrbitBody):void {
 const rnd=mulberry32(eye.seed);
 const R=satelliteRadius(w,h)*(body?body.scale*(.88+.12*body.depth):1),x=body?.x??eye.pos.x*w,y=body?.y??eye.pos.y*h;
 const age=Math.max(0,Math.min(1,(Date.now()-eye.createdAt)/1800));
 const col=emotionColour(eye.keywords[0] ?? 'still');
 const tilt=(rnd()-.5)*.7+(body?.spin??t*.025);
 const phase=rnd()*Math.PI*2;
 const orbit=Array.from({length:560},()=>({a:rnd()*Math.PI*2,r:.76+(rnd()+rnd()-1)*.065,z:(rnd()-.5)*.026,b:rnd()}));
 const ring=(front:boolean)=>{
  ctx.globalCompositeOperation='lighter';
  const bands=[new Path2D(),new Path2D(),new Path2D()];
  for(const p of orbit){
   const a=p.a+t*.048+phase,depth=Math.sin(a);
   if((depth>=0)!==front)continue;
   const px=Math.cos(a)*R*p.r,py=depth*R*.27+p.z*R;
   const xx=x+px*Math.cos(tilt)-py*Math.sin(tilt), yy=y+px*Math.sin(tilt)+py*Math.cos(tilt);
   const sz=dpr*(.42+p.b*.45)*(front?1:.8);
   bands[Math.min(2,Math.floor(p.b*3))].rect(xx,yy,sz,sz);
  }
  for(let i=0;i<3;i++){ctx.fillStyle=rgba(col,age*(front?.12:.065)*(i+1));ctx.fill(bands[i]);}
 };
 ctx.save();ring(false);
 // Transparent iris: overlapping galaxies retain their light. Only the pupil is dark.
 ctx.globalCompositeOperation='lighter';
 const haze=ctx.createRadialGradient(x,y,R*.17,x,y,R*.51);
 haze.addColorStop(0,rgba(col,.08*age));haze.addColorStop(.5,rgba(col,.035*age));haze.addColorStop(1,rgba(col,0));
 ctx.fillStyle=haze;ctx.beginPath();ctx.arc(x,y,R*.51,0,Math.PI*2);ctx.fill();
 const iris=new Path2D();
 for(let i=0;i<720;i++){
  const a=rnd()*Math.PI*2+t*.018,r=R*(.19+Math.pow(rnd(),1.25)*.25);
  const sz=dpr*(.38+rnd()*.4);iris.rect(x+Math.cos(a)*r,y+Math.sin(a)*r,sz,sz);
 }
 ctx.fillStyle=rgba(col,.25*age);ctx.fill(iris);
 // Delicate radial filaments keep the iris distinct from the orbital ring.
 ctx.beginPath();for(let i=0;i<36;i++){const a=i*Math.PI/18+phase+t*.018;ctx.moveTo(x+Math.cos(a)*R*.2,y+Math.sin(a)*R*.2);ctx.lineTo(x+Math.cos(a+.045)*R*.42,y+Math.sin(a+.045)*R*.42);}
 ctx.strokeStyle=rgba(col,.075*age);ctx.lineWidth=dpr*.5;ctx.stroke();
 ctx.globalCompositeOperation='source-over';ctx.fillStyle='#000';ctx.beginPath();ctx.arc(x,y,R*.175,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=rgba(col,.29*age);ctx.lineWidth=dpr*.55;ctx.stroke();
 ring(true);
 if(body&&body.glow>0){
  const glow=ctx.createRadialGradient(x,y,R*.25,x,y,R*1.4);
  glow.addColorStop(0,rgba(col,0));glow.addColorStop(.5,rgba(col,body.glow*.13));glow.addColorStop(1,rgba(col,0));
  ctx.fillStyle=glow;ctx.fillRect(x-R*1.4,y-R*1.4,R*2.8,R*2.8);
 }
 ctx.restore();
}
