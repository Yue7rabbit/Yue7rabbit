import type { InferenceSession } from 'onnxruntime-web';
import { EMOTION_CLASSES, type EmotionClass } from '../interpretation/keywordVocabulary';
import type { Landmark } from './faceTracker';

/**
 * Facial-expression estimation with HSEmotion (Savchenko, 2022: "Frame-level
 * prediction of facial expressions, valence, arousal and action units for mobile
 * devices"), model `enet_b0_8_va_mtl` — EfficientNet-B0 trained on AffectNet.
 * Output: 8 expression logits + continuous valence and arousal (Russell's circumplex).
 *
 * Runs entirely in this browser (onnxruntime-web, WASM in a worker). The face crop
 * exists only in an off-screen canvas for the duration of one inference.
 */
export type EmotionSample = { probs: Record<EmotionClass, number>; valence: number; arousal: number; t: number };
export type EmotionModelStatus = 'off' | 'loading' | 'ready' | 'error';

const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const BASE = import.meta.env.BASE_URL;

export class EmotionModel {
  status: EmotionModelStatus = 'off';
  error = '';
  last: EmotionSample | null = null;
  inferMs = 0;
  private session: InferenceSession | null = null;
  private ort: typeof import('onnxruntime-web/wasm') | null = null;
  private busy = false;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private input = new Float32Array(3 * SIZE * SIZE);

  async init(): Promise<boolean> {
    this.status = 'loading';
    try {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.wasmPaths = `${BASE}ort/`;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = true; // inference in a worker: the artwork never stutters
      this.session = await ort.InferenceSession.create(`${BASE}models/enet_b0_8_va_mtl.onnx`, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      this.ort = ort;
      this.status = 'ready';
      return true;
    } catch (err) {
      this.status = 'error';
      this.error = String((err as Error)?.message ?? err);
      return false;
    }
  }

  get ready(): boolean {
    return this.status === 'ready';
  }

  /** Fire-and-forget; resolves to the new sample (also stored in `last`). Skips if busy. */
  async analyse(video: HTMLVideoElement, landmarks: Landmark[], t: number): Promise<EmotionSample | null> {
    if (!this.session || !this.ort || this.busy || video.videoWidth === 0) return null;
    this.busy = true;
    try {
      const crop = faceCrop(landmarks, video.videoWidth, video.videoHeight);
      if (!this.canvas) {
        this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(SIZE, SIZE) : Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
      }
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      if (!ctx) return null;
      ctx.drawImage(video, crop.x, crop.y, crop.size, crop.size, 0, 0, SIZE, SIZE);
      const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
      ctx.clearRect(0, 0, SIZE, SIZE);
      toTensor(px, this.input);
      const t0 = performance.now();
      const tensor = new this.ort.Tensor('float32', this.input, [1, 3, SIZE, SIZE]);
      const out = await this.session.run({ input: tensor });
      this.inferMs = performance.now() - t0;
      const data = out.output.data as Float32Array;
      this.last = decode(data, t);
      return this.last;
    } catch (err) {
      this.error = String((err as Error)?.message ?? err);
      return null;
    } finally {
      this.busy = false;
    }
  }
}

/** Square crop around the landmarks, padded like the face detector crops HSEmotion was trained on. */
export function faceCrop(lm: Landmark[], w: number, h: number): { x: number; y: number; size: number } {
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = ((minX + maxX) / 2) * w;
  const cy = ((minY + maxY) / 2) * h;
  const size = Math.max((maxX - minX) * w, (maxY - minY) * h) * 1.15;
  return {
    x: Math.max(0, Math.min(w - size, cx - size / 2)),
    y: Math.max(0, Math.min(h - size, cy - size / 2)),
    size: Math.min(size, w, h),
  };
}

/** RGBA bytes → normalised CHW float tensor (ImageNet mean/std, as in HSEmotion). */
export function toTensor(px: Uint8ClampedArray, out: Float32Array): Float32Array {
  const n = SIZE * SIZE;
  for (let i = 0; i < n; i++) {
    out[i] = (px[i * 4] / 255 - MEAN[0]) / STD[0];
    out[n + i] = (px[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    out[2 * n + i] = (px[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return out;
}

/** Output layout of *_va_mtl models: [8 expression logits, valence, arousal]. */
export function decode(data: ArrayLike<number>, t: number): EmotionSample {
  let max = -Infinity;
  for (let i = 0; i < 8; i++) max = Math.max(max, data[i]);
  const e: number[] = [];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += e[i] = Math.exp(data[i] - max);
  const probs = {} as Record<EmotionClass, number>;
  EMOTION_CLASSES.forEach((c, i) => (probs[c] = e[i] / sum));
  const clampVA = (x: number) => (Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0);
  return { probs, valence: clampVA(data[8]), arousal: clampVA(data[9]), t };
}
