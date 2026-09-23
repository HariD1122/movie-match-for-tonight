import { BriefSchema, type RawBrief } from "../brief";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 25_000;

/**
 * Google retires model ids without much notice — `gemini-2.0-flash` and
 * `gemini-2.5-flash` are both already gone. The floating `-latest` alias is
 * kept as a backstop so a retirement degrades to a slightly different model
 * rather than to the no-model fallback brief.
 */
function models(): string[] {
  const preferred = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  return [...new Set([preferred, "gemini-flash-latest"])];
}

// Gemini takes an OpenAPI-subset schema rather than JSON Schema, and honours
// `propertyOrdering` for the generation order.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    vibe: { type: "STRING" },
    genres: { type: "ARRAY", items: { type: "STRING" } },
    avoid_genres: { type: "ARRAY", items: { type: "STRING" } },
    keywords: { type: "ARRAY", items: { type: "STRING" } },
    seed_titles: { type: "ARRAY", items: { type: "STRING" } },
    tone_notes: { type: "STRING" },
  },
  required: ["vibe", "genres", "avoid_genres", "keywords", "seed_titles", "tone_notes"],
  propertyOrdering: ["vibe", "genres", "avoid_genres", "keywords", "seed_titles", "tone_notes"],
};

class ModelGone extends Error {}

async function callOnce(model: string, key: string, system: string, prompt: string): Promise<string> {
  const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.8,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (res.status === 404) {
    throw new ModelGone(`Gemini model ${model} is no longer available`);
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const err = new Error(`Gemini ${res.status} on ${model}: ${body}`);
    // 429 and 5xx are worth a second try; 400/401/403 are not.
    if (res.status === 429 || res.status >= 500) return Promise.reject(Object.assign(err, { retryable: true }));
    throw err;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

export async function briefFromGemini(system: string, prompt: string): Promise<RawBrief | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  let lastError: unknown = null;

  for (const model of models()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await callOnce(model, key, system, prompt);
        if (!text.trim()) return null;

        // Schema-constrained output should already be clean JSON, but the model
        // can still wrap it in a fence, and handling that beats a retry.
        const json = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
        const parsed = BriefSchema.safeParse(JSON.parse(json));
        if (parsed.success) return parsed.data;
        lastError = new Error("Gemini returned JSON that did not match the brief schema");
      } catch (err) {
        lastError = err;
        if (err instanceof ModelGone) break; // try the next model, not again
        const retryable =
          (err as { retryable?: boolean })?.retryable || (err as Error)?.name === "TimeoutError";
        if (!retryable) break;
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}
