import { db, HttpError } from "./db";
import { buildBrief, type HistoryItem } from "./brief";
import { buildPool, POOL_SIZE } from "./pool";
import type { Brief, Finalist, Preferences, Role, SessionStatus, Title } from "./types";
import { titleKey } from "./util";

export interface SessionRow {
  id: string;
  code: string;
  pair_key: string;
  status: SessionStatus;
  round: number;
  brief: Brief | null;
}

export interface ParticipantRow {
  id: string;
  role: Role;
  device_id: string;
  preferences: Preferences | null;
  submitted_at: string | null;
  finished_round: number;
}

export async function loadSession(code: string): Promise<SessionRow> {
  const { data, error } = await db()
    .from("sessions")
    .select("id, code, pair_key, status, round, brief")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "That session code does not exist.");
  return data as SessionRow;
}

export async function loadParticipants(sessionId: string): Promise<ParticipantRow[]> {
  const { data, error } = await db()
    .from("participants")
    .select("id, role, device_id, preferences, submitted_at, finished_round")
    .eq("session_id", sessionId);
  if (error) throw error;
  return (data ?? []) as ParticipantRow[];
}

export async function setStatus(
  sessionId: string,
  status: SessionStatus,
  extra: Record<string, unknown> = {}
) {
  const { error } = await db()
    .from("sessions")
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", sessionId);
  if (error) throw error;
}

/** Every title this pair has already been shown in this session. */
export async function seenKeys(sessionId: string): Promise<Set<string>> {
  const { data, error } = await db()
    .from("pool_titles")
    .select("tmdb_id, media_type")
    .eq("session_id", sessionId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => `${r.media_type}:${r.tmdb_id}`));
}

/** What this pair has matched on and rated across every past session. */
export async function pairHistory(
  pairKey: string,
  excludeSessionId?: string
): Promise<HistoryItem[]> {
  const { data: sessions, error: e1 } = await db()
    .from("sessions")
    .select("id")
    .eq("pair_key", pairKey)
    .order("created_at", { ascending: false })
    .limit(40);
  if (e1) throw e1;

  const ids = (sessions ?? []).map((s) => s.id).filter((id) => id !== excludeSessionId);
  if (!ids.length) return [];

  const { data, error } = await db()
    .from("matches")
    .select("data, rating, created_at")
    .in("session_id", ids)
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) throw error;

  return (data ?? []).map((m) => {
    const t = m.data as Title;
    return { title: t.title, year: t.year, genres: t.genres ?? [], rating: m.rating ?? null };
  });
}

async function likedTitles(sessionId: string, round: number): Promise<{ a: Title[]; b: Title[] }> {
  const [{ data: swipes }, { data: pool }] = await Promise.all([
    db()
      .from("swipes")
      .select("role, tmdb_id, media_type")
      .eq("session_id", sessionId)
      .eq("round", round)
      .eq("liked", true),
    db()
      .from("pool_titles")
      .select("tmdb_id, media_type, data")
      .eq("session_id", sessionId)
      .eq("round", round),
  ]);

  const byKey = new Map((pool ?? []).map((p) => [`${p.media_type}:${p.tmdb_id}`, p.data as Title]));
  const out = { a: [] as Title[], b: [] as Title[] };
  for (const s of swipes ?? []) {
    const t = byKey.get(`${s.media_type}:${s.tmdb_id}`);
    if (t) out[s.role as Role].push(t);
  }
  return out;
}

/**
 * Build the round's pool. Both clients may call this the moment they see
 * `building`, so the first thing we do is take a lock in the database --
 * whoever loses simply keeps polling.
 */
export async function ensurePool(code: string): Promise<void> {
  const session = await loadSession(code);
  if (session.status !== "building") return;

  const { data: locked, error: lockErr } = await db()
    .from("sessions")
    .update({ status: "building_locked", updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("status", "building")
    .select("id")
    .maybeSingle();
  if (lockErr) throw lockErr;
  if (!locked) return; // someone else is already building

  try {
    const parts = await loadParticipants(session.id);
    const a = parts.find((p) => p.role === "a")?.preferences;
    const b = parts.find((p) => p.role === "b")?.preferences;
    if (!a || !b) throw new Error("Both partners must submit preferences first.");

    const [history, exclude] = await Promise.all([
      pairHistory(session.pair_key, session.id),
      seenKeys(session.id),
    ]);

    const likedLastRound =
      session.round > 1 ? await likedTitles(session.id, session.round - 1) : undefined;

    const brief = await buildBrief({ a, b, history, round: session.round, likedLastRound });
    const pool = await buildPool({ a, b, brief, exclude });

    if (!pool.length) {
      throw new Error(
        "Could not find anything that fits both of you. Try widening the rating or era filters."
      );
    }

    const rows = pool.map((t, i) => ({
      session_id: session.id,
      round: session.round,
      position: i,
      tmdb_id: t.tmdbId,
      media_type: t.mediaType,
      data: t,
    }));
    const { error } = await db().from("pool_titles").insert(rows);
    if (error) throw error;

    await setStatus(session.id, "swiping", { brief });
  } catch (err) {
    // Hand the lock back so the next poll can retry rather than hanging forever.
    await setStatus(session.id, "building");
    throw err;
  }
}

/** Did this swipe just complete a match? */
export async function checkMatch(
  sessionId: string,
  round: number,
  role: Role,
  tmdbId: number,
  mediaType: string
): Promise<boolean> {
  const other: Role = role === "a" ? "b" : "a";
  const { data, error } = await db()
    .from("swipes")
    .select("id")
    .eq("session_id", sessionId)
    .eq("round", round)
    .eq("role", other)
    .eq("tmdb_id", tmdbId)
    .eq("media_type", mediaType)
    .eq("liked", true)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function recordMatch(
  sessionId: string,
  title: Title,
  source: "swipe" | "final"
): Promise<void> {
  const { error } = await db()
    .from("matches")
    .upsert(
      {
        session_id: sessionId,
        tmdb_id: title.tmdbId,
        media_type: title.mediaType,
        data: title,
        source,
      },
      { onConflict: "session_id" }
    );
  if (error) throw error;
  await setStatus(sessionId, "matched");
}

/** After two rounds with no match: the five titles they leaned toward most. */
export async function computeFinalists(sessionId: string): Promise<Finalist[]> {
  const { data: pool } = await db()
    .from("pool_titles")
    .select("tmdb_id, media_type, data")
    .eq("session_id", sessionId);
  const { data: swipes } = await db()
    .from("swipes")
    .select("role, tmdb_id, media_type")
    .eq("session_id", sessionId)
    .eq("liked", true);

  const likes = new Map<string, Role[]>();
  for (const s of swipes ?? []) {
    const k = `${s.media_type}:${s.tmdb_id}`;
    if (!likes.has(k)) likes.set(k, []);
    likes.get(k)!.push(s.role as Role);
  }

  const scored: Finalist[] = (pool ?? []).map((p) => {
    const t = p.data as Title;
    const likedBy = likes.get(`${p.media_type}:${p.tmdb_id}`) ?? [];
    // Who liked it is what counts; rating is only the tie-break.
    return { ...t, likedBy, score: likedBy.length * 10 + t.rating };
  });

  const liked = scored.filter((t) => t.likedBy.length > 0).sort((x, y) => y.score - x.score);
  if (liked.length) return liked.slice(0, 5);

  // Nobody liked anything in either round -- fall back to the best-rated.
  return scored.sort((x, y) => y.rating - x.rating).slice(0, 5);
}

/**
 * Called when a partner runs out of cards. Advances the session only once
 * both of them are done.
 */
export async function onRoundFinished(code: string): Promise<void> {
  const session = await loadSession(code);
  if (session.status !== "swiping") return;

  const parts = await loadParticipants(session.id);
  const allDone = parts.length === 2 && parts.every((p) => p.finished_round >= session.round);
  if (!allDone) return;

  const { data: match } = await db()
    .from("matches")
    .select("id")
    .eq("session_id", session.id)
    .maybeSingle();
  if (match) {
    await setStatus(session.id, "matched");
    return;
  }

  if (session.round < 2) {
    await setStatus(session.id, "building", { round: session.round + 1 });
  } else {
    await setStatus(session.id, "finalists");
  }
}

export { POOL_SIZE, titleKey };
