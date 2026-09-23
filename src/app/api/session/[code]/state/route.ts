import { db, fail, ok } from "@/lib/db";
import { appUrl, requireParticipant } from "@/lib/api";
import { computeFinalists, loadParticipants, loadSession } from "@/lib/session";
import type { Finalist, Role, SessionState, Title } from "@/lib/types";
import { shuffleSeeded, titleKey } from "@/lib/util";

export const dynamic = "force-dynamic";

/** One poll gives a client everything it needs to render the whole app. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const deviceId = new URL(req.url).searchParams.get("deviceId");

    const session = await loadSession(code);
    const me = await requireParticipant(session.id, deviceId);
    const parts = await loadParticipants(session.id);
    const partner = parts.find((p) => p.role !== me.role);

    const showingDeck = session.status === "swiping";

    const [poolRes, swipeRes, matchRes, pickRes] = await Promise.all([
      showingDeck
        ? db()
            .from("pool_titles")
            .select("data, position")
            .eq("session_id", session.id)
            .eq("round", session.round)
            .order("position")
        : Promise.resolve({ data: [] as { data: Title; position: number }[] }),
      showingDeck
        ? db()
            .from("swipes")
            .select("tmdb_id, media_type, liked")
            .eq("session_id", session.id)
            .eq("round", session.round)
            .eq("role", me.role)
        : Promise.resolve({ data: [] as { tmdb_id: number; media_type: string; liked: boolean }[] }),
      db()
        .from("matches")
        .select("data, source, rating")
        .eq("session_id", session.id)
        .maybeSingle(),
      session.status === "finalists"
        ? db().from("final_picks").select("role, tmdb_id, media_type").eq("session_id", session.id)
        : Promise.resolve({ data: [] as { role: string; tmdb_id: number; media_type: string }[] }),
    ]);

    // Same 30 titles for both, different order each -- so they are not just
    // mirroring each other's decisions.
    const pool = shuffleSeeded(
      (poolRes.data ?? []).map((r) => r.data as Title),
      `${session.id}:${session.round}:${me.role}`
    );

    const mySwipes: Record<string, boolean> = {};
    for (const s of swipeRes.data ?? []) {
      mySwipes[`${s.media_type}:${s.tmdb_id}`] = s.liked;
    }

    let finalists: Finalist[] = [];
    if (session.status === "finalists") finalists = await computeFinalists(session.id);

    const picks = pickRes.data ?? [];
    const mine = picks.find((p) => p.role === me.role);
    const theirs = picks.find((p) => p.role !== me.role);

    const match = matchRes.data
      ? {
          title: matchRes.data.data as Title,
          source: matchRes.data.source as string,
          rating: (matchRes.data.rating as number | null) ?? null,
        }
      : null;

    const state: SessionState = {
      code: session.code,
      status: session.status,
      round: session.round,
      me: {
        role: me.role as Role,
        submitted: Boolean(me.submitted_at),
        finishedRound: me.finished_round,
      },
      partner: {
        joined: Boolean(partner),
        submitted: Boolean(partner?.submitted_at),
        finishedRound: partner?.finished_round ?? 0,
      },
      brief: session.brief ? { vibe: session.brief.vibe } : null,
      pool,
      mySwipes,
      match,
      finalists,
      myPick: mine ? titleKey({ tmdbId: mine.tmdb_id, mediaType: mine.media_type }) : null,
      partnerPicked: Boolean(theirs),
      shareUrl: `${appUrl(req)}/s/${session.code}`,
    };

    return ok(state);
  } catch (err) {
    return fail(err);
  }
}
