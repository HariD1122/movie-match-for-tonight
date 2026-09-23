import { db, fail, ok, HttpError } from "@/lib/db";
import { readJson, requireParticipant } from "@/lib/api";
import { loadSession, setStatus } from "@/lib/session";

export const dynamic = "force-dynamic";

/** How was it, actually? This is the signal that improves every future round. */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const body = await readJson<{ deviceId?: string; rating?: number }>(req);

    const session = await loadSession(code);
    const me = await requireParticipant(session.id, body.deviceId);

    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpError(400, "Rating must be a whole number from 1 to 5.");
    }

    const { error } = await db()
      .from("matches")
      .update({ rating, rated_by: me.role })
      .eq("session_id", session.id);
    if (error) throw error;

    await setStatus(session.id, "done");
    return ok({ rating });
  } catch (err) {
    return fail(err);
  }
}
