import { fmtRuntime, oneLine } from "./util";
import type { Title } from "./types";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

function auth(): { headers: Record<string, string>; keyParam: string } {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (token) return { headers: { Authorization: `Bearer ${token}` }, keyParam: "" };
  const key = process.env.TMDB_API_KEY;
  if (key) return { headers: {}, keyParam: key };
  throw new Error("TMDB is not configured. Set TMDB_ACCESS_TOKEN or TMDB_API_KEY.");
}

async function tmdb<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const { headers, keyParam } = auth();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) url.searchParams.set(k, String(v));
  }
  if (keyParam) url.searchParams.set("api_key", keyParam);

  const res = await fetch(url, { headers, next: { revalidate: 60 * 60 } });
  if (!res.ok) {
    throw new Error(`TMDB ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface DiscoverOpts {
  mediaType: "movie" | "tv";
  language: string;
  genreIds: number[];
  excludeGenreIds?: number[];
  minRating: number;
  minVotes: number;
  yearFrom: number;
  yearTo: number;
  page: number;
  sortBy?: string;
}

export interface RawItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
  genre_ids?: number[];
  popularity?: number;
  media_type?: string;
}

export async function discover(o: DiscoverOpts): Promise<RawItem[]> {
  const isMovie = o.mediaType === "movie";
  const dateKey = isMovie ? "primary_release_date" : "first_air_date";

  // Hard-stop at today. Anticipated titles rack up enough votes to clear the
  // rating filter long before release (Toy Story 5, The Odyssey), and the one
  // thing this app must never do is offer something you cannot watch tonight.
  const today = new Date().toISOString().slice(0, 10);
  const upper = `${o.yearTo}-12-31` < today ? `${o.yearTo}-12-31` : today;

  const data = await tmdb<{ results: RawItem[] }>(`/discover/${o.mediaType}`, {
    with_original_language: o.language,
    with_genres: o.genreIds.length ? o.genreIds.join("|") : undefined,
    without_genres: o.excludeGenreIds?.length ? o.excludeGenreIds.join(",") : undefined,
    "vote_average.gte": o.minRating,
    "vote_count.gte": o.minVotes,
    [`${dateKey}.gte`]: `${o.yearFrom}-01-01`,
    [`${dateKey}.lte`]: upper,
    sort_by: o.sortBy ?? "popularity.desc",
    watch_region: "IN",
    include_adult: "false",
    page: o.page,
  });
  return data.results ?? [];
}

/** Resolve a title Claude named into a real TMDB record. */
export async function searchTitle(
  query: string,
  moviesOnly: boolean
): Promise<{ id: number; mediaType: "movie" | "tv" } | null> {
  const data = await tmdb<{ results: RawItem[] }>(
    "/search/multi",
    { query, include_adult: "false", page: 1 }
  );
  const hit = (data.results ?? [])
    .filter((r) => r.media_type === "movie" || (!moviesOnly && r.media_type === "tv"))
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
  return hit ? { id: hit.id, mediaType: hit.media_type as "movie" | "tv" } : null;
}

interface RawDetail extends RawItem {
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  genres?: { id: number; name: string }[];
  external_ids?: { imdb_id?: string | null };
  status?: string;
}

/** Full record for a card: adds runtime, genre names and the IMDb id. */
export async function detail(id: number, mediaType: "movie" | "tv"): Promise<Title | null> {
  try {
    const d = await tmdb<RawDetail>(`/${mediaType}/${id}`, { append_to_response: "external_ids" });
    if (!d.poster_path || !d.overview) return null;

    const date = d.release_date || d.first_air_date || "";
    // Seed titles reach this function without passing the discover date filter,
    // so the "nothing you cannot watch tonight" rule is enforced here too.
    if (date && date > new Date().toISOString().slice(0, 10)) return null;

    const year = date ? Number(date.slice(0, 4)) : null;

    let runtime: string | null;
    if (mediaType === "movie") {
      runtime = fmtRuntime(d.runtime);
    } else {
      const epMins = d.episode_run_time?.[0];
      const ep = epMins && epMins > 0 ? `${epMins}m` : null;
      const seasons = d.number_of_seasons
        ? `${d.number_of_seasons} season${d.number_of_seasons > 1 ? "s" : ""}`
        : null;
      runtime = [ep && `${ep} eps`, seasons].filter(Boolean).join(" · ") || null;
    }

    return {
      tmdbId: d.id,
      mediaType,
      title: d.title || d.name || "Untitled",
      year,
      rating: Math.round((d.vote_average ?? 0) * 10) / 10,
      votes: d.vote_count ?? 0,
      runtime,
      overview: oneLine(d.overview ?? ""),
      poster: d.poster_path ? `${IMG}/w500${d.poster_path}` : null,
      backdrop: d.backdrop_path ? `${IMG}/w780${d.backdrop_path}` : null,
      genres: (d.genres ?? []).map((g) => g.name),
      language: d.original_language ?? "",
    };
  } catch {
    return null;
  }
}

export async function imdbId(id: number, mediaType: "movie" | "tv"): Promise<string | null> {
  try {
    const d = await tmdb<{ imdb_id?: string | null }>(`/${mediaType}/${id}/external_ids`);
    return d.imdb_id ?? null;
  } catch {
    return null;
  }
}

export interface TmdbProviders {
  link?: string;
  flatrate?: { provider_name: string; logo_path: string }[];
  free?: { provider_name: string; logo_path: string }[];
  ads?: { provider_name: string; logo_path: string }[];
  rent?: { provider_name: string; logo_path: string }[];
  buy?: { provider_name: string; logo_path: string }[];
}

/** TMDB's own India availability — used as the fallback when RapidAPI is down. */
export async function watchProviders(
  id: number,
  mediaType: "movie" | "tv"
): Promise<TmdbProviders | null> {
  try {
    const d = await tmdb<{ results?: Record<string, TmdbProviders> }>(
      `/${mediaType}/${id}/watch/providers`
    );
    return d.results?.IN ?? null;
  } catch {
    return null;
  }
}

export const providerLogo = (path: string) => `${IMG}/w92${path}`;

/** Run promises with a concurrency cap so we do not hammer TMDB. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
let logoIndex: Map<string, string> | null = null;

/**
 * Every service TMDB knows about in India, name -> logo. OTT Details gives us
 * deep links but no artwork, and borrowing a logo from the same title's TMDB
 * row only works when TMDB happens to list that service too. This is one
 * cached call that covers all of them.
 */
export async function providerLogoIndex(): Promise<Map<string, string>> {
  if (logoIndex) return logoIndex;
  const idx = new Map<string, string>();
  for (const type of ["movie", "tv"] as const) {
    try {
      const d = await tmdb<{ results?: { provider_name: string; logo_path: string }[] }>(
        `/watch/providers/${type}`,
        { watch_region: "IN" }
      );
      for (const p of d.results ?? []) {
        if (p.logo_path) idx.set(normName(p.provider_name), providerLogo(p.logo_path));
      }
    } catch {
      /* a missing logo is cosmetic — never fail the match screen over it */
    }
  }
  if (idx.size) logoIndex = idx;
  return idx;
}
