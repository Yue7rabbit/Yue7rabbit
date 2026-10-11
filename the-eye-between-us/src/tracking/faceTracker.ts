import type { FaceLandmarker as FaceLandmarkerType } from '@mediapipe/tasks-vision';

export type Landmark = { x: number; y: number; z: number };
export type FaceObservation = { landmarks: Landmark[]; cx: number; cy: number; size: number };
export type TrackerStatus = 'off' | 'loading' | 'ready' | 'error';

const BASE = import.meta.env.BASE_URL;
const LOCAL_WASM = `${BASE}mediapipe/wasm`;
const LOCAL_MODEL = `${BASE}models/face_landmarker.task`;
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * MediaPipe Face Landmarker running locally in the browser (WASM/GPU).
 * Model + WASM are vendored under /public so the installation works offline.
 */
export class FaceTracker {
  status: TrackerStatus = 'off';
  error = '';
  private landmarker: FaceLandmarkerType | null = null;
  private lastVideoTime = -1;

  async init(): Promise<boolean> {
    this.status = 'loading';
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(LOCAL_WASM);
      const make = (modelAssetPath: string, delegate: 'GPU' | 'CPU') =>
        vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: 'VIDEO',
          numFaces: 3,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: false,
        });
      try {
        this.landmarker = await make(LOCAL_MODEL, 'GPU');
      } catch {
        try {
          this.landmarker = await make(LOCAL_MODEL, 'CPU');
        } catch {
          this.landmarker = await make(REMOTE_MODEL, 'CPU');
        }
      }
      this.status = 'ready';
      return true;
    } catch (err) {
      this.status = 'error';
      this.error = String((err as Error)?.message ?? err);
      return false;
    }
  }

  /** Returns null when no new video frame is available. */
  detect(video: HTMLVideoElement, t: number): FaceObservation[] | null {
    if (!this.landmarker || video.readyState < 2) return null;
    if (video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;
    try {
      const res = this.landmarker.detectForVideo(video, t);
      return (res.faceLandmarks ?? []).map((lm) => summarize(lm as Landmark[]));
    } catch {
      return [];
    }
  }
}

function summarize(landmarks: Landmark[]): FaceObservation {
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (let i = 0; i < landmarks.length; i += 8) {
    const p = landmarks[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { landmarks, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, size: Math.max(maxX - minX, maxY - minY) };
}

/**
 * Pick the active participant. While a session is locked to a position, only a
 * face near that position counts (others are ignored, never mixed in).
 * Unlocked: the largest (closest) face.
 */
export function selectFace(
  faces: { cx: number; cy: number; size: number }[],
  lock: { x: number; y: number } | null,
  maxDist = 0.22,
): number {
  if (faces.length === 0) return -1;
  if (lock) {
    let best = -1;
    let bestD = maxDist;
    faces.forEach((f, i) => {
      const d = Math.hypot(f.cx - lock.x, f.cy - lock.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }
  let best = 0;
  faces.forEach((f, i) => {
    if (f.size > faces[best].size) best = i;
  });
  return best;
}
