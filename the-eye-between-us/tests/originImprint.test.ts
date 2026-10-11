import {expect,test} from 'vitest';
import {withOrigin} from '../src/visual/originImprint';
import {CollectiveEngine} from '../src/collective/collectiveEngine';
import {NEUTRAL_STATE} from '../src/collective/visualState';
import {SessionManager} from '../src/interaction/sessionManager';
test('one starting galaxy, then one extra per committed encounter',()=>{
 const e=new CollectiveEngine();expect(withOrigin(e.eyes)).toHaveLength(1);expect(e.participantCount).toBe(0);
 for(let n=1;n<=3;n++){e.commit({id:String(n),seed:n,keywords:['still'],signature:{...NEUTRAL_STATE},pos:{x:.5,y:.5}},Date.now());expect(withOrigin(e.eyes)).toHaveLength(n+1);expect(e.participantCount).toBe(n);}
 e.reset(Date.now());expect(withOrigin(e.eyes)).toHaveLength(1);
});
test('manual mode does not generate imprints from waiting or departure',()=>{
 const s=new SessionManager({commitOnDeparture:false,maxSessionMs:Infinity});
 s.update(0,true);s.update(1000,true);s.update(10000,true);
 expect(s.update(60000,true).some(e=>e.type==='commit')).toBe(false);
 expect(s.update(63000,false).some(e=>e.type==='commit')).toBe(false);
});
