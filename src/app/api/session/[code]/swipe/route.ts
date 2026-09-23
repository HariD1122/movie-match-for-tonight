import { db, fail, ok, HttpError } from "@/lib/db";
import { readJson, requireParticipant } from "@/lib/api";
import { checkMatch, loadSession, recordMatch } from "@/lib/session";
import type { Title } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const body = await readJson<{
      deviceId?: string;
      tmdbId?: number;
      mediaType?: string;
      liked?: boolean;
    }>(req);

    const session = await loadSession(code);
    const me = await requireParticipant(session.id, body.deviceId);

    if (typeof body.tmdbId !== "number" || !body.mediaType) {
      throw new HttpError(400, "Missing title.");
    }
    if (session.status !== "swiping") {
      return ok({ recorded: false, matched: session.status === "matched" });
    }

    // Swiping the same card twice (double tap, retry after a flaky network)
    // must not create a second row.
    const { error } = await db().from("swipes").upsert(
      {
        session_id: session.id,
        round: session.round,
        role: me.role,
        tmdb_id: body.tmdbId,
        media_type: body.mediaType,
        liked: Boolean(body.liked),
      },
      { onConflict: "session_id,round,role,tmdb_id,media_type" }
    );
    if (error) throw error;

    if (!body.liked) return ok({ recorded: true, matched: false });

    const isMatch = await checkMatch(
      session.id,
      session.round,
      me.role,
      body.tmdbId,
      body.mediaType
    );
    if (!isMatch) return ok({ recorded: true, matched: false });

    const { data: row } = await db()
      .from("pool_titles")
      .select("data")
      .eq("session_id", session.id)
      .eq("round", session.round)
      .eq("tmdb_id", body.tmdbId)
      .eq("media_type", body.mediaType)
      .maybeSingle();
    if (!row) throw new HttpError(404, "That title is not in this round.");

    await recordMatch(session.id, row.data as Title, "swipe");
    return ok({ recorded: true, matched: true });
  } catch (err) {
    return fail(err);
  }
}
