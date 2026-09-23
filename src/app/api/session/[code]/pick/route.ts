import { db, fail, ok, HttpError } from "@/lib/db";
import { readJson, requireParticipant } from "@/lib/api";
import { computeFinalists, loadSession, recordMatch } from "@/lib/session";
import { toTitle } from "@/lib/util";

export const dynamic = "force-dynamic";

/**
 * The final call. Two rounds, no match -- so they pick from the top 5
 * together. When both taps land on the same title, that is the match.
 */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const body = await readJson<{ deviceId?: string; tmdbId?: number; mediaType?: string }>(req);

    const session = await loadSession(code);
    const me = await requireParticipant(session.id, body.deviceId);

    if (session.status !== "finalists") {
      return ok({ picked: false, matched: session.status === "matched" });
    }
    if (typeof body.tmdbId !== "number" || !body.mediaType) {
      throw new HttpError(400, "Missing title.");
    }

    const { error } = await db().from("final_picks").upsert(
      {
        session_id: session.id,
        role: me.role,
        tmdb_id: body.tmdbId,
        media_type: body.mediaType,
      },
      { onConflict: "session_id,role" }
    );
    if (error) throw error;

    const { data: picks } = await db()
      .from("final_picks")
      .select("role, tmdb_id, media_type")
      .eq("session_id", session.id);

    const agreed =
      (picks ?? []).length === 2 &&
      picks!.every((p) => p.tmdb_id === picks![0].tmdb_id && p.media_type === picks![0].media_type);

    if (!agreed) return ok({ picked: true, matched: false });

    const finalists = await computeFinalists(session.id);
    const chosen = finalists.find(
      (t) => t.tmdbId === body.tmdbId && t.mediaType === body.mediaType
    );
    if (!chosen) throw new HttpError(404, "That title is not one of the finalists.");

    await recordMatch(session.id, toTitle(chosen), "final");
    return ok({ picked: true, matched: true });
  } catch (err) {
    return fail(err);
  }
}
