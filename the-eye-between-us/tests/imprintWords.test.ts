import { expect, it } from 'vitest';
import { wordsForFeeling } from '../src/interpretation/imprintWords';
import { CollectiveEngine } from '../src/collective/collectiveEngine';
import { serialize, deserializeInto } from '../src/collective/persistence';
import { NEUTRAL_STATE } from '../src/collective/visualState';
it('keeps the chosen feeling first with two distinct poetic neighbours',()=>{
 for(const feeling of ['serene','excited','happy','tense','sad','still']){
  const words=wordsForFeeling(feeling);expect(words[0]).toBe(feeling);expect(new Set(words).size).toBe(3);
 }
});
it('freezes only the three strongest words through memory reload',()=>{
 const engine=new CollectiveEngine();const words=['happy','delighted','excited','serene','calm'];
 engine.commit({id:'test',seed:7,signature:{...NEUTRAL_STATE},keywords:words,pos:{x:.5,y:.5}},1000);
 words[0]='sad';
 const restored=new CollectiveEngine();expect(deserializeInto(restored,serialize(engine))).toBe(true);
 expect(restored.eyes[0].keywords).toEqual(['happy','delighted','excited']);
});
