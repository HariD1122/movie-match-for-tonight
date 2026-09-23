import type { Era, Preferences, Title } from "./types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

export function sessionCode(len = 6): string {
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function titleKey(t: { tmdbId: number; mediaType: string }): string {
  return `${t.mediaType}:${t.tmdbId}`;
}

export const ERA_RANGE: Record<Exclude<Era, "any">, [number, number]> = {
  classic: [1930, 1999],
  midlands: [2000, 2020],
  recent: [2021, new Date().getFullYear() + 1],
};

/**
 * The window that satisfies both partners. "Any" means "I don't mind", so it
 * defers to whatever the other one asked for rather than widening past it.
 * Two different specific eras do widen — excluding either would be unfair.
 */
export function mergedYearRange(a: Preferences, b: Preferences): [number, number] {
  const FULL: [number, number] = [1930, new Date().getFullYear() + 1];

  const specific = (p: Preferences) =>
    p.eras.filter((e): e is Exclude<Era, "any"> => e !== "any");
  const A = specific(a);
  const B = specific(b);

  const chosen = A.length && B.length ? [...A, ...B] : A.length ? A : B;
  if (!chosen.length) return FULL;

  let lo = Infinity;
  let hi = 0;
  for (const e of chosen) {
    const [l, h] = ERA_RANGE[e];
    lo = Math.min(lo, l);
    hi = Math.max(hi, h);
  }
  return [lo, hi];
}

/** Languages both would accept. "Any" from one side means defer to the other. */
export function mergedLanguages(a: Preferences, b: Preferences): string[] {
  const clean = (p: Preferences) =>
    p.languages.includes("any") || p.languages.length === 0
      ? null
      : new Set(p.languages as string[]);
  const A = clean(a), B = clean(b);
  if (!A && !B) return ["hi", "en", "ta", "te", "kn"];
  if (!A) return [...B!];
  if (!B) return [...A];
  const both = [...A].filter((l) => B.has(l));
  // If they share nothing, neither should be shut out — offer both lists.
  return both.length ? both : [...new Set([...A, ...B])];
}

/** Stricter side wins on rating and on movies-only. */
export function mergedRating(a: Preferences, b: Preferences): number {
  return Math.max(a.minRating, b.minRating);
}
export function moviesOnly(a: Preferences, b: Preferences): boolean {
  return a.contentType === "movies" || b.contentType === "movies";
}

export function shuffleSeeded<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function fmtRuntime(mins: number | null | undefined): string | null {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function oneLine(text: string, max = 150): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
  return cut.slice(0, stop > 60 ? stop : max).replace(/[,.]$/, "") + "…";
}

export function poolSummary(titles: Title[]): string {
  return titles.map((t) => `${t.title} (${t.year ?? "—"})`).join(", ");
}

/** Drop the swipe-derived fields so only the title itself is persisted. */
export function toTitle(t: Title): Title {
  return {
    tmdbId: t.tmdbId,
    mediaType: t.mediaType,
    title: t.title,
    year: t.year,
    rating: t.rating,
    votes: t.votes,
    runtime: t.runtime,
    overview: t.overview,
    poster: t.poster,
    backdrop: t.backdrop,
    genres: t.genres,
    language: t.language,
  };
}
