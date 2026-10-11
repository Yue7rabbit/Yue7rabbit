import type { IndividualEyeRecord } from '../collective/collectiveEngine';
import { NEUTRAL_STATE } from '../collective/visualState';
/** A single starting point, not a fabricated participant. Never enters the encounter count. */
export const ORIGIN_IMPRINT:IndividualEyeRecord={
 id:'origin',seed:731,signature:{...NEUTRAL_STATE},keywords:['still','calm','serene'],createdAt:0,influence:0,
 pos:{x:.5,y:.18},note:'The first shared point. Every new presence changes what comes next.',
};
export function withOrigin(records:IndividualEyeRecord[]):IndividualEyeRecord[]{return [ORIGIN_IMPRINT,...records];}
