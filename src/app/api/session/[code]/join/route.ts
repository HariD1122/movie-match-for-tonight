import { db, fail, ok, HttpError } from "@/lib/db";
import { readJson } from "@/lib/api";
import { loadParticipants, loadSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Partner B lands here from the QR code or the shared link. */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const body = await readJson<{ deviceId?: string }>(req);
    if (!body.deviceId) throw new HttpError(400, "Missing device id.");

    const session = await loadSession(code);
    const parts = await loadParticipants(session.id);

    const existing = parts.find((p) => p.device_id === body.deviceId);
    if (existing) {
      return ok({ role: existing.role, pairKey: session.pair_key, rejoined: true });
    }

    if (parts.length >= 2) {
      throw new HttpError(409, "This session already has two people in it.");
    }

    const role = parts.some((p) => p.role === "a") ? "b" : "a";
    const { error } = await db()
      .from("participants")
      .insert({ session_id: session.id, role, device_id: body.deviceId });
    if (error) throw error;

    return ok({ role, pairKey: session.pair_key, rejoined: false });
  } catch (err) {
    return fail(err);
  }
}
