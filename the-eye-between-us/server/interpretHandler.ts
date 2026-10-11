// Server-side AI proxy for THE EYE BETWEEN US.
// Receives ONLY summarised behaviour numbers (never images) and asks Claude for a
// poetic reading constrained to a fixed vocabulary. The API key never reaches the browser.
// Written as erasable TypeScript so it runs both inside Vite and via `node server/serve.ts`.
import type { IncomingMessage, ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

// Must match src/interpretation/keywordVocabulary.ts
const CIRCUMPLEX = ['happy', 'delighted', 'excited', 'astonished', 'alarmed', 'tense', 'angry', 'distressed', 'sad', 'gloomy', 'tired', 'calm', 'relaxed', 'serene', 'content'];
const CATEGORIES = ['anger', 'contempt', 'disgust', 'fear', 'happiness', 'sadness', 'surprise'];
const WORDS = [...CIRCUMPLEX, 'still', ...CATEGORIES];
const DIMS = ['energy', 'tension', 'fluidity', 'density', 'openness', 'rhythm', 'turbulence'];
const FEATURES = ['movementIntensity', 'blinkRate', 'eyeOpenness', 'gazeVariation', 'stability'];
const EMO_CLASSES = ['anger', 'contempt', 'disgust', 'fear', 'happiness', 'neutral', 'sadness', 'surprise'];

const MODEL = process.env.EYE_MODEL || 'claude-opus-5-5';

const SYSTEM = `You are the interpretive voice of a generative artwork: a large eye whose iris is written in words, changed by each person who looks into it.
You receive two summaries of one encounter, both computed locally from a camera:
1. behaviour (0..1): head movement, blink rate, eye openness, gaze variation, stability.
2. expression (optional): the session mean of a facial-expression model (HSEmotion, trained on AffectNet) — valence and arousal in -1..1 (Russell's circumplex model of affect) and probabilities for 8 AffectNet categories.
Choose the words the eye will be written with:
- keywords: 1 or 2 words ONLY from this list: ${WORDS.join(', ')}.
  First word: the circumplex adjective that best fits the valence/arousal (pleasant↔unpleasant, activated↔deactivated), or "still" for a near-neutral face.
  Optional second word: an AffectNet category, only if that expression clearly dominates (not neutral).
  If no expression data is present, infer only arousal from behaviour and stay near-neutral on valence.
- visualIntent, each 0..1: energy (speed, ~arousal), rhythm (pulse, ~arousal), tension (sharpness; unpleasant+activated), fluidity (smooth flow; pleasant or deactivated), density (amount of type), openness (how wide the eye opens; pleasant, surprised), turbulence (irregular edges; activated).
These are readings of a visible expression for an artwork, never claims about anyone's inner state, health or personality.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['keywords', 'visualIntent'],
  properties: {
    keywords: { type: 'array', items: { type: 'string', enum: WORDS } },
    visualIntent: {
      type: 'object',
      additionalProperties: false,
      required: DIMS,
      properties: Object.fromEntries(DIMS.map((d) => [d, { type: 'number' }])),
    },
  },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 8000, maxRetries: 0 });
  return client;
}

export function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function clamp01(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0.5;
  return Math.min(1, Math.max(0, n));
}

async function readBody(req: IncomingMessage, limit = 4096): Promise<string> {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > limit) throw new Error('body too large');
  }
  return data;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function handleInterpret(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
  if (!hasCredentials()) return send(res, 503, { error: 'AI not configured; client uses local interpreter' });

  let features: Record<string, number>;
  let expression: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(await readBody(req));
    const raw = (parsed && parsed.features) || {};
    // Whitelist: only the five summary numbers are forwarded.
    features = Object.fromEntries(FEATURES.map((k) => [k, Math.round(clamp01(raw[k]) * 100) / 100]));
    const emo = parsed && parsed.emotion;
    if (emo && typeof emo === 'object' && Number(emo.samples) > 0) {
      const r2 = (x: unknown) => Math.round(Math.max(-1, Math.min(1, Number(x) || 0)) * 100) / 100;
      expression = {
        valence: r2(emo.valence),
        arousal: r2(emo.arousal),
        probs: Object.fromEntries(EMO_CLASSES.map((c) => [c, Math.round(clamp01(emo.probs?.[c]) * 100) / 100])),
      };
    }
  } catch {
    return send(res, 400, { error: 'invalid body' });
  }

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [{ role: 'user', content: JSON.stringify({ behaviour: features, expression }) }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (response.stop_reason === 'refusal') return send(res, 502, { error: 'declined' });
    let text = '';
    for (const block of response.content) if (block.type === 'text') text += block.text;
    const out = JSON.parse(text);
    // The browser validates again; this is a first line of defence.
    return send(res, 200, {
      keywords: Array.isArray(out.keywords) ? out.keywords.filter((w: unknown) => WORDS.includes(String(w))).slice(0, 2) : [],
      visualIntent: Object.fromEntries(DIMS.map((d) => [d, clamp01(out.visualIntent?.[d])])),
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) return send(res, 502, { error: `upstream ${err.status ?? ''}`.trim() });
    return send(res, 502, { error: 'interpretation failed' });
  }
}
