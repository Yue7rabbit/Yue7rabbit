import { interpretLocally } from './localInterpreter';
import { validateInterpretation, type BehaviorFeatures, type EmotionSummary, type Interpretation } from './schemas';

export type AiMode = 'ai' | 'local';
export type AiStatus = 'idle' | 'pending' | 'ok' | 'fallback:timeout' | 'fallback:error' | 'fallback:invalid' | 'local';

export const AI_ENDPOINT = '/api/interpret';
export const AI_TIMEOUT_MS = 2800;

/**
 * Asks the server-side proxy for a poetic interpretation. The API key lives
 * only on the server. Any timeout, network error or malformed response falls
 * back to the deterministic local interpreter — rendering never waits on this.
 */
export class Interpreter {
  mode: AiMode;
  status: AiStatus = 'idle';
  available = true; // flips false after the proxy reports it has no key

  constructor(mode: AiMode = 'ai') {
    this.mode = mode;
  }

  async interpret(
    features: BehaviorFeatures,
    emotion: EmotionSummary | null = null,
    fetchImpl: typeof fetch = fetch,
  ): Promise<Interpretation> {
    if (this.mode === 'local' || !this.available) {
      this.status = 'local';
      return interpretLocally(features, emotion);
    }
    this.status = 'pending';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetchImpl(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features, emotion }),
        signal: ctrl.signal,
      });
      if (res.status === 503) this.available = false; // proxy present but unconfigured
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = validateInterpretation(await res.json(), 'ai');
      if (!parsed) {
        this.status = 'fallback:invalid';
        return interpretLocally(features, emotion);
      }
      this.status = 'ok';
      return parsed;
    } catch (err) {
      this.status = (err as Error)?.name === 'AbortError' ? 'fallback:timeout' : 'fallback:error';
      return interpretLocally(features, emotion);
    } finally {
      clearTimeout(timer);
    }
  }
}
