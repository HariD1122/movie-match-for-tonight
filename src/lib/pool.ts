import { discover, detail, searchTitle, mapLimit, type RawItem } from "./tmdb";
import { genreIds } from "./genres";
import type { Brief, Preferences, Title } from "./types";
import {
  mergedLanguages,
  mergedRating,
  mergedYearRange,
  moviesOnly,
  titleKey,
} from "./util";

export const POOL_SIZE = 30;

interface Candidate {
  id: number;
  mediaType: "movie" | "tv";
  language: string;
  score: number;
}

// Regional titles have far fewer TMDB votes than English ones. A single
// threshold either floods the deck with English or lets junk through.
const MIN_VOTES: Record<string, number> = { en: 120, hi: 60, ta: 25, te: 25, kn: 12 };

function scoreOf(r: RawItem, wantedGenreIds: Set<number>, seedBoost: number): number {
  const rating = r.vote_average ?? 0;
  const votes = r.vote_count ?? 0;
  const pop = Math.log10((r.popularity ?? 1) + 1);
  const genreHits = (r.genre_ids ?? []).filter((g) => wantedGenreIds.has(g)).length;
  // Ratings from a handful of votes are noise — pull them toward the mean.
  const confidence = votes / (votes + 200);
  const shrunk = rating * confidence + 6.5 * (1 - confidence);
  return shrunk * 1.0 + pop * 0.6 + genreHits * 0.45 + seedBoost;
}

/**
 * Pull a pool that satisfies both partners from the start. Widens in stages
 * only if the strict pass comes up short, so the first 30 are the best 30.
 */
export async function buildPool(opts: {
  a: Preferences;
  b: Preferences;
  brief: Brief;
  exclude: Set<string>;
}): Promise<Title[]> {
  const { a, b, brief, exclude } = opts;

  const languages = mergedLanguages(a, b);
  const minRating = mergedRating(a, b);
  const [yearFrom, yearTo] = mergedYearRange(a, b);
  const mediaTypes: ("movie" | "tv")[] = moviesOnly(a, b) ? ["movie"] : ["movie", "tv"];

  const candidates = new Map<string, Candidate>();

  const add = (r: RawItem, mediaType: "movie" | "tv", wanted: Set<number>, boost: number) => {
    const key = `${mediaType}:${r.id}`;
    if (exclude.has(key)) return;
    if (!r.poster_path || !r.overview) return;
    const date = r.release_date || r.first_air_date || "";
    const year = date ? Number(date.slice(0, 4)) : null;
    if (year && (year < yearFrom || year > yearTo)) return;
    if ((r.vote_average ?? 0) < minRating) return;

    const score = scoreOf(r, wanted, boost);
    const prev = candidates.get(key);
    if (!prev || score > prev.score) {
      candidates.set(key, {
        id: r.id,
        mediaType,
        language: r.original_language ?? "",
        score,
      });
    }
  };

  // --- 1. Titles Claude named by hand. These are the highest-signal picks. ---
  const seeds = brief.seedTitles.slice(0, 14);
  const resolved = await mapLimit(seeds, 5, (t) =>
    searchTitle(t, moviesOnly(a, b)).catch(() => null)
  );
  for (const hit of resolved) {
    if (!hit) continue;
    const key = `${hit.mediaType}:${hit.id}`;
    if (exclude.has(key) || candidates.has(key)) continue;
    candidates.set(key, { id: hit.id, mediaType: hit.mediaType, language: "", score: 12 });
  }

  // --- 2. Discover sweeps, narrowing to Claude's genres. ---
  const sweep = async (relax: 0 | 1 | 2) => {
    const jobs: { lang: string; mediaType: "movie" | "tv"; page: number }[] = [];
    for (const lang of languages) {
      for (const mediaType of mediaTypes) {
        for (const page of relax === 0 ? [1, 2] : [1, 2, 3]) {
          jobs.push({ lang, mediaType, page });
        }
      }
    }

    await mapLimit(jobs, 6, async (job) => {
      const wanted = new Set(genreIds(brief.genres, job.mediaType));
      const avoid = relax === 0 ? genreIds(brief.avoidGenres, job.mediaType) : [];
      const baseVotes = MIN_VOTES[job.lang] ?? 25;
      try {
        const rows = await discover({
          mediaType: job.mediaType,
          language: job.lang,
          genreIds: relax >= 2 ? [] : [...wanted],
          excludeGenreIds: avoid,
          minRating,
          minVotes: relax === 0 ? baseVotes : Math.max(8, Math.floor(baseVotes / (relax === 1 ? 2 : 4))),
          yearFrom,
          yearTo,
          page: job.page,
          sortBy: relax === 2 && job.page > 1 ? "vote_average.desc" : "popularity.desc",
        });
        for (const r of rows) add(r, job.mediaType, wanted, 0);
      } catch {
        /* one bad sweep should not sink the pool */
      }
    });
  };

  await sweep(0);
  if (candidates.size < POOL_SIZE * 2) await sweep(1);
  if (candidates.size < POOL_SIZE * 1.4) await sweep(2);

  // --- 3. Rank, then interleave by language so one language cannot own the deck. ---
  const ranked = [...candidates.values()].sort((x, y) => y.score - x.score);

  const buckets = new Map<string, Candidate[]>();
  for (const c of ranked) {
    const k = c.language || "seed";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(c);
  }
  const order = [...buckets.keys()].sort(
    (x, y) => (buckets.get(y)![0]?.score ?? 0) - (buckets.get(x)![0]?.score ?? 0)
  );
  const interleaved: Candidate[] = [];
  for (let i = 0; interleaved.length < ranked.length; i++) {
    let moved = false;
    for (const k of order) {
      const list = buckets.get(k)!;
      if (i < list.length) {
        interleaved.push(list[i]);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // --- 4. Hydrate a little more than we need, then take the best 30. ---
  const shortlist = interleaved.slice(0, POOL_SIZE + 18);
  const hydrated = await mapLimit(shortlist, 8, (c) => detail(c.id, c.mediaType));

  const seen = new Set<string>();
  const pool: Title[] = [];
  for (const t of hydrated) {
    if (!t) continue;
    if (t.rating < minRating) continue;
    if (t.year && (t.year < yearFrom || t.year > yearTo)) continue;
    const key = titleKey(t);
    if (seen.has(key) || exclude.has(key)) continue;
    seen.add(key);
    pool.push(t);
    if (pool.length >= POOL_SIZE) break;
  }

  return pool;
}
