import type { RGB } from './palette';

/** Artistic temperature mapping, not a claim about universal emotion/color associations. */
export const EMOTION_COLOURS: Readonly<Record<string, RGB>> = {
 happy: [221, 204, 175], happiness: [222, 202, 172], delighted: [227, 208, 177],
 excited: [214, 185, 155], astonished: [214, 199, 184], surprise: [219, 201, 176],
 content: [202, 201, 187],
 angry: [193, 160, 151], anger: [198, 164, 151], distressed: [179, 159, 169],
 tense: [182, 170, 193], alarmed: [191, 172, 184], fear: [166, 160, 192],
 contempt: [166, 172, 183], disgust: [164, 177, 174],
 calm: [147, 185, 211], relaxed: [158, 187, 203], serene: [165, 198, 214],
 tired: [147, 161, 191], sad: [141, 156, 197], sadness: [143, 156, 192], gloomy: [153, 151, 183],
 still: [200, 208, 220], neutral: [200, 208, 220],
};
export function emotionColour(word:string):RGB {
 return EMOTION_COLOURS[word.trim().toLowerCase()] ?? EMOTION_COLOURS.still;
}
