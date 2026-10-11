import {expect,test} from 'vitest';
import {SatelliteMotion,orbitClearance} from '../src/visual/satelliteMotion';
import {CollectiveEngine,type IndividualEyeRecord} from '../src/collective/collectiveEngine';
import {serialize,deserializeInto} from '../src/collective/persistence';
import {NEUTRAL_STATE} from '../src/collective/visualState';
const record=(id:string,seed:number):IndividualEyeRecord=>({id,seed,signature:{...NEUTRAL_STATE},keywords:['serene'],createdAt:1,influence:.1,pos:{x:.3,y:.3}});
test('orbital bodies advance and retain distinct seeded sizes',()=>{const m=new SatelliteMotion();const rs=[record('a',1),record('b',2)];const before=m.step(rs,1200,800,0,.016).map(b=>({x:b.x,y:b.y,scale:b.scale}));const after=m.step(rs,1200,800,10,.016);expect(after[0].x).not.toBe(before[0].x);expect(after[0].scale).not.toBe(after[1].scale);expect(new SatelliteMotion().step(rs,1200,800,0,.016)[0].scale).toBe(before[0].scale);});
test('overlapping bodies separate without NaNs and show contact response',()=>{const m=new SatelliteMotion();const rs=[record('a',8),record('b',8)];const bs=m.step(rs,1200,800,0,.016);expect(Math.hypot(bs[0].x-bs[1].x,bs[0].y-bs[1].y)).toBeGreaterThan(0);expect(bs.every(b=>Number.isFinite(b.x)&&b.glow>0)).toBe(true);for(let i=1;i<120;i++)m.step(rs,1200,800,i/60,1/60);expect([...m.bodies.values()].every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y))).toBe(true);m.step([],1200,800,3,.016);expect(m.bodies.size).toBe(0);});
test('a personal note survives persistence and legacy records remain valid',()=>{const e=new CollectiveEngine();e.commit({...record('new',3),note:'A quiet moment'},Date.now());e.commit(record('old',4),Date.now());const next=new CollectiveEngine();expect(deserializeInto(next,serialize(e))).toBe(true);expect(next.eyes[0].note).toBe('A quiet moment');expect(next.eyes[1].note).toBeUndefined();});

test('full orbit stays outside the eye in landscape and portrait',()=>{
 for(const [w,h] of [[1280,720],[1920,1080],[900,600],[600,900],[541,637]]){
  const m=new SatelliteMotion(),rs=[record('a',9)];m.step(rs,w,h,0,0);
  const b=m.bodies.get('a')!;b.speed=0;
  for(let angle=0;angle<Math.PI*2;angle+=.05){
   b.phase=angle;m.step(rs,w,h,0,0);
   const bounds=orbitClearance(w,h,b.radius),dx=b.x-w*.5,dy=b.y-h*.5;
   expect(Math.hypot(dx/bounds.x,dy/(dy<0?bounds.top:bounds.bottom))).toBeGreaterThanOrEqual(.999);
   expect(b.x-b.radius).toBeGreaterThan(0);expect(b.x+b.radius).toBeLessThan(w);
   expect(b.y-b.radius).toBeGreaterThan(0);expect(b.y+b.radius).toBeLessThan(h);
  }
 }
});
