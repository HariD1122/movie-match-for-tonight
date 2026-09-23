import { fail, ok, HttpError } from "@/lib/db";
import { whereToWatch } from "@/lib/ott";

export const dynamic = "force-dynamic";

/** Where can they watch it in India, right now. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tmdbId = Number(url.searchParams.get("tmdbId"));
    const mediaType = url.searchParams.get("mediaType");

    if (!Number.isFinite(tmdbId) || (mediaType !== "movie" && mediaType !== "tv")) {
      throw new HttpError(400, "Need a tmdbId and a mediaType of movie or tv.");
    }

    return ok(await whereToWatch(tmdbId, mediaType));
  } catch (err) {
    return fail(err);
  }
}
