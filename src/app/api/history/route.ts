import { db, fail, ok, HttpError } from "@/lib/db";
import type { Title } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Everything this pair has landed on before, newest first. */
export async function GET(req: Request) {
  try {
    const pairKey = new URL(req.url).searchParams.get("pairKey");
    if (!pairKey) throw new HttpError(400, "Missing pairKey.");

    const { data: sessions, error } = await db()
      .from("sessions")
      .select("id, code, created_at")
      .eq("pair_key", pairKey)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;

    const ids = (sessions ?? []).map((s) => s.id);
    if (!ids.length) return ok({ nights: [] });

    const { data: matches } = await db()
      .from("matches")
      .select("session_id, data, rating, source, created_at")
      .in("session_id", ids)
      .order("created_at", { ascending: false })
      .limit(20);

    const codeById = new Map((sessions ?? []).map((s) => [s.id, s.code]));

    return ok({
      nights: (matches ?? []).map((m) => {
        const t = m.data as Title;
        return {
          code: codeById.get(m.session_id) ?? "",
          title: t.title,
          year: t.year,
          poster: t.poster,
          mediaType: t.mediaType,
          tmdbId: t.tmdbId,
          rating: (m.rating as number | null) ?? null,
          watchedAt: m.created_at as string,
        };
      }),
    });
  } catch (err) {
    return fail(err);
  }
}
