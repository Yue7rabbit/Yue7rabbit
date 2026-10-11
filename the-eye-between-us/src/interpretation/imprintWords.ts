import { VOCABULARY, findKeyword } from './keywordVocabulary';

/** Self-selected feeling and its two closest poetic neighbours; not camera inference. */
export function wordsForFeeling(feeling: string): string[] {
 const entry = findKeyword(feeling);
 if (!entry) return [];
 const neighbours = VOCABULARY.filter(v => v.word !== entry.word && v.kind === 'circumplex')
  .sort((a,b) => Math.hypot(a.valence-entry.valence,a.arousal-entry.arousal)-Math.hypot(b.valence-entry.valence,b.arousal-entry.arousal));
 return [entry.word, ...neighbours.slice(0,2).map(v=>v.word)];
}
