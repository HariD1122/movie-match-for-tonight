import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Server-side only — this key must never reach the
 * browser, which is why nothing here is prefixed NEXT_PUBLIC_.
 */
/**
 * supabase-js wants the bare project origin and appends `/rest/v1` itself.
 * Pasting the REST endpoint instead — which is what the Supabase dashboard
 * shows you next to the keys — yields `/rest/v1/rest/v1/<table>` and a
 * PGRST125 on every single query. Too easy a mistake to punish someone for.
 */
export function normaliseSupabaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/rest(\/v\d+)?$/i, "");
}

export function db(): SupabaseClient {
  if (cached) return cached;
  const raw = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "(in .env.local locally, or the environment variables of your host)."
    );
  }
  cached = createClient(normaliseSupabaseUrl(raw), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function ok<T>(data: T) {
  return Response.json(data);
}

/**
 * Supabase rejects with a plain object, not an Error, so `instanceof Error`
 * alone turned every database failure into "Something went wrong" — which is
 * exactly no help when the only view you have is the deployed response body.
 * `details` is deliberately left out: it can echo row contents.
 */
function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; code?: unknown; hint?: unknown };
    const parts = [
      typeof e.message === "string" ? e.message : null,
      typeof e.code === "string" ? `[${e.code}]` : null,
      typeof e.hint === "string" ? e.hint : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return "Something went wrong";
}

export function fail(err: unknown) {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("[tonight]", err);
  return Response.json({ error: describe(err) }, { status: 500 });
}
