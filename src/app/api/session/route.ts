import { db, fail, ok, HttpError } from "@/lib/db";
import { readJson } from "@/lib/api";
import { sessionCode } from "@/lib/util";

export const dynamic = "force-dynamic";

/** Partner A starts the night. */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ deviceId?: string; pairKey?: string }>(req);
    if (!body.deviceId) throw new HttpError(400, "Missing device id.");

    const pairKey = body.pairKey?.trim() || crypto.randomUUID();

    await db()
      .from("pairs")
      .upsert({ pair_key: pairKey, last_seen_at: new Date().toISOString() }, { onConflict: "pair_key" });

    // Codes are short enough to read aloud, so collisions are possible.
    let code = "";
    let session: { id: string } | null = null;
    for (let attempt = 0; attempt < 5 && !session; attempt++) {
      code = sessionCode();
      const { data, error } = await db()
        .from("sessions")
        .insert({ code, pair_key: pairKey, status: "collecting", round: 1 })
        .select("id")
        .maybeSingle();
      if (!error) session = data;
      else if (error.code !== "23505") throw error;
    }
    if (!session) throw new HttpError(503, "Could not create a session. Try again.");

    const { error: pErr } = await db()
      .from("participants")
      .insert({ session_id: session.id, role: "a", device_id: body.deviceId });
    if (pErr) throw pErr;

    return ok({ code, role: "a", pairKey });
  } catch (err) {
    return fail(err);
  }
}
