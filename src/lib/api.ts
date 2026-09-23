import { HttpError } from "./db";
import { loadParticipants, type ParticipantRow } from "./session";
import type { Preferences } from "./types";

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
}

export async function requireParticipant(
  sessionId: string,
  deviceId: string | null | undefined
): Promise<ParticipantRow> {
  if (!deviceId) throw new HttpError(400, "Missing device id.");
  const parts = await loadParticipants(sessionId);
  const me = parts.find((p) => p.device_id === deviceId);
  if (!me) throw new HttpError(403, "You are not part of this session.");
  return me;
}

const MOODS = ["light", "intense", "scary", "romantic", "other"];
const LANGS = ["hi", "en", "ta", "te", "kn", "any"];
const ERAS = ["any", "classic", "midlands", "recent"];

/** Never trust the form. Everything downstream assumes this shape holds. */
export function parsePreferences(input: unknown): Preferences {
  const raw = (input ?? {}) as Record<string, unknown>;
  const arr = (v: unknown, allowed: string[]) =>
    Array.isArray(v) ? (v.filter((x) => typeof x === "string" && allowed.includes(x)) as never[]) : [];

  const moods = arr(raw.moods, MOODS);
  const languages = arr(raw.languages, LANGS);
  const eras = arr(raw.eras, ERAS);

  const rating = Number(raw.minRating);
  const minRating = ([6, 7, 8, 9] as const).includes(rating as 6 | 7 | 8 | 9)
    ? (rating as 6 | 7 | 8 | 9)
    : 7;

  const moodText = typeof raw.moodText === "string" ? raw.moodText.slice(0, 500).trim() : "";

  return {
    moods,
    moodText,
    languages: languages.length ? languages : ["any"],
    contentType: raw.contentType === "movies" ? "movies" : "all",
    minRating,
    eras: eras.length ? eras : ["any"],
  };
}

export function appUrl(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
