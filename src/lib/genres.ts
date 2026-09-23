import type { Mood } from "./types";

// TMDB genre ids differ between movies and TV, so everything upstream
// (including Claude) works in genre *names* and we map here.
export const MOVIE_GENRES: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36,
  Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749,
  "Science Fiction": 878, Thriller: 53, War: 10752, Western: 37,
};

/**
 * TMDB's TV list is much coarser than its movie list — there is no Romance,
 * Horror, History or Music genre for series. Only genuine equivalents are
 * mapped here: a loose stand-in would both over-broaden the include list
 * (Romance -> Drama pulls in every prestige drama) and, worse, over-exclude
 * on the avoid list (Horror -> Mystery would filter out mysteries).
 */
export const TV_GENRES: Record<string, number> = {
  "Action & Adventure": 10759, Action: 10759, Adventure: 10759,
  Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18,
  Family: 10751, Kids: 10762, Mystery: 9648, Reality: 10764,
  "Sci-Fi & Fantasy": 10765, "Science Fiction": 10765, Fantasy: 10765,
  Thriller: 9648, War: 10768, Western: 37,
};

export const ALL_GENRE_NAMES = Object.keys(MOVIE_GENRES);

export function genreIds(names: string[], mediaType: "movie" | "tv"): number[] {
  const table = mediaType === "movie" ? MOVIE_GENRES : TV_GENRES;
  const out = new Set<number>();
  for (const n of names) {
    const id = table[n];
    if (id) out.add(id);
  }
  return [...out];
}

// What each mood chip means before Claude gets a say.
export const MOOD_GENRES: Record<Mood, string[]> = {
  light: ["Comedy", "Adventure", "Family", "Animation", "Music"],
  intense: ["Thriller", "Crime", "Drama", "Mystery", "Action"],
  scary: ["Horror", "Thriller", "Mystery"],
  romantic: ["Romance", "Drama", "Comedy"],
  other: [],
};

export const MOOD_LABEL: Record<Mood, string> = {
  light: "Light & fun",
  intense: "Intense & gripping",
  scary: "Scary",
  romantic: "Romantic",
  other: "Other",
};
