import { db, fail, ok, HttpError } from "@/lib/db";
import { whereToWatch } from "@/lib/ott";

export const dynamic = "force-dynamic";

/**
 * Only answer for titles this app has actually put in front of someone.
 * Without it, anyone holding the deployed URL could walk arbitrary ids through
 * a rate-limited third-party API and drain the quota.
 */
async function isKnownTitle(tmdbId: number, mediaType: string): Promise<boolean> {
  const [pool, match] = await Promise.all([
    db()
      .from("pool_titles")
      .select("id")
      .eq("tmdb_id", tmdbId)
      .eq("media_type", mediaType)
      .limit(1)
      .maybeSingle(),
    db()
      .from("matches")
      .select("id")
      .eq("tmdb_id", tmdbId)
      .eq("media_type", mediaType)
      .limit(1)
      .maybeSingle(),
  ]);

  // A failed query leaves `data` null, which would read as "unknown title" and
  // answer 404 — turning a database outage into a confident, wrong answer.
  if (pool.error) throw pool.error;
  if (match.error) throw match.error;

  return Boolean(pool.data || match.data);
}

/** Where can they watch it in India, right now. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tmdbId = Number(url.searchParams.get("tmdbId"));
    const mediaType = url.searchParams.get("mediaType");

    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || (mediaType !== "movie" && mediaType !== "tv")) {
      throw new HttpError(400, "Need a tmdbId and a mediaType of movie or tv.");
    }

    if (!(await isKnownTitle(tmdbId, mediaType))) {
      throw new HttpError(404, "That title is not part of any session.");
    }

    return ok(await whereToWatch(tmdbId, mediaType));
  } catch (err) {
    return fail(err);
  }
}
