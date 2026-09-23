import { db, fail, ok, normaliseSupabaseUrl } from "@/lib/db";
import { resolvedGeminiModel } from "@/lib/providers/gemini";

export const dynamic = "force-dynamic";

/**
 * Which services this deployment can actually reach. Reports presence and
 * reachability only -- never a key, and never a value that could reconstruct
 * one -- so it is safe to leave public. Exists because "it 500s" is not a
 * diagnosis when the environment lives on someone else's dashboard.
 */
async function checkSupabase() {
  const raw = process.env.SUPABASE_URL;
  if (!raw || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { configured: false, ok: false, error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set" };
  }
  const normalised = normaliseSupabaseUrl(raw);
  try {
    const { error } = await db().from("sessions").select("id").limit(1);
    if (error) {
      const e = error as { message?: string; code?: string };
      return { configured: true, ok: false, host: new URL(normalised).host, error: `${e.message ?? "query failed"} [${e.code ?? ""}]` };
    }
    return { configured: true, ok: true, host: new URL(normalised).host, normalised: normalised !== raw.trim().replace(/\/+$/, "") };
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : "unreachable" };
  }
}

async function checkTmdb() {
  const token = process.env.TMDB_ACCESS_TOKEN;
  const key = process.env.TMDB_API_KEY;
  if (!token && !key) return { configured: false, ok: false, error: "TMDB_ACCESS_TOKEN / TMDB_API_KEY not set" };
  try {
    const url = token
      ? "https://api.themoviedb.org/3/configuration"
      : `https://api.themoviedb.org/3/configuration?api_key=${key}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    return { configured: true, ok: res.ok, error: res.ok ? undefined : `TMDB returned ${res.status}` };
  } catch {
    return { configured: true, ok: false, error: "TMDB unreachable" };
  }
}

export async function GET(req: Request) {
  try {
    const [supabase, tmdb] = await Promise.all([checkSupabase(), checkTmdb()]);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? null;
    const body = {
      supabase,
      tmdb,
      gemini: {
        configured: Boolean(process.env.GEMINI_API_KEY),
        // What will actually be requested, which is not always what is set.
        model: resolvedGeminiModel(),
        configuredModel: process.env.GEMINI_MODEL ?? null,
      },
      claude: { configured: Boolean(process.env.ANTHROPIC_API_KEY) },
      rapidapi: {
        configured: Boolean(process.env.RAPIDAPI_KEY),
        host: process.env.RAPIDAPI_HOST ?? "ott-details.p.rapidapi.com",
      },
      // The QR encodes this. Unset is fine -- the app falls back to the
      // origin the request arrived on -- so only an explicitly local value
      // is a problem once deployed.
      appUrl: appUrl || null,
      qrOrigin: appUrl || new URL(req.url).origin,
      appUrlLooksLocal: Boolean(
        appUrl && /localhost|127\.0\.0\.1|^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(appUrl)
      ),
    };

    // `healthy` is about whether the services answer. A local-looking app URL
    // is correct in development and only wrong once deployed, so it is a
    // warning rather than a failure.
    const healthy = supabase.ok && tmdb.ok && body.gemini.configured;

    const warnings: string[] = [];
    if (body.appUrlLooksLocal) {
      warnings.push(
        `NEXT_PUBLIC_APP_URL is set to ${body.appUrl}, so the QR code encodes that address. Correct for local dev; unscannable from another phone once deployed.`
      );
    }
    const configuredModel = process.env.GEMINI_MODEL?.trim();
    if (configuredModel && configuredModel !== body.gemini.model) {
      warnings.push(
        `GEMINI_MODEL is "${configuredModel}", which is not a model id — ignoring it and using ${body.gemini.model}.`
      );
    }
    if (!body.rapidapi.configured) {
      warnings.push("RAPIDAPI_KEY is not set — availability falls back to TMDB, with no deep links or IMDb rating.");
    }

    return ok({ healthy, warnings, ...body });
  } catch (err) {
    return fail(err);
  }
}
