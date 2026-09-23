import { db, fail, ok } from "@/lib/db";
import { readJson, requireParticipant } from "@/lib/api";
import { loadSession, onRoundFinished } from "@/lib/session";

export const dynamic = "force-dynamic";

/** "I have seen all 30." The session only moves once both say so. */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const body = await readJson<{ deviceId?: string }>(req);

    const session = await loadSession(code);
    const me = await requireParticipant(session.id, body.deviceId);

    if (me.finished_round < session.round) {
      const { error } = await db()
        .from("participants")
        .update({ finished_round: session.round })
        .eq("id", me.id);
      if (error) throw error;
    }

    await onRoundFinished(code);
    const after = await loadSession(code);
    return ok({ status: after.status, round: after.round });
  } catch (err) {
    return fail(err);
  }
}
