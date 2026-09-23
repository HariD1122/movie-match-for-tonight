import { db, fail, ok } from "@/lib/db";
import { parsePreferences, readJson, requireParticipant } from "@/lib/api";
import { loadParticipants, loadSession, setStatus } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Each partner submits independently and never sees the other's answers.
 * The second submission is what flips the session into building the pool.
 */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const body = await readJson<{ deviceId?: string; preferences?: unknown }>(req);

    const session = await loadSession(code);
    const me = await requireParticipant(session.id, body.deviceId);
    const preferences = parsePreferences(body.preferences);

    const { error } = await db()
      .from("participants")
      .update({ preferences, submitted_at: new Date().toISOString() })
      .eq("id", me.id);
    if (error) throw error;

    const parts = await loadParticipants(session.id);
    const bothIn = parts.length === 2 && parts.every((p) => p.submitted_at || p.id === me.id);

    if (bothIn && session.status === "collecting") {
      await setStatus(session.id, "building");
    }

    return ok({ submitted: true, waitingOnPartner: !bothIn });
  } catch (err) {
    return fail(err);
  }
}
