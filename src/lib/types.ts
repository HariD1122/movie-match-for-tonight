export type Mood = "light" | "intense" | "scary" | "romantic" | "other";
export type Lang = "hi" | "en" | "ta" | "te" | "kn" | "any";
export type ContentType = "movies" | "all";
export type Era = "any" | "classic" | "midlands" | "recent";
export type Role = "a" | "b";

export interface Preferences {
  moods: Mood[];
  moodText: string;
  languages: Lang[];
  contentType: ContentType;
  minRating: 6 | 7 | 8 | 9;
  eras: Era[];
}

export interface Title {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  year: number | null;
  rating: number; // TMDB user score, 0-10
  votes: number;
  runtime: string | null; // "1h 52m" or "42m episodes · 3 seasons"
  overview: string;
  poster: string | null;
  backdrop: string | null;
  genres: string[];
  language: string;
}

export interface Brief {
  vibe: string;
  genres: string[];
  avoidGenres: string[];
  keywords: string[];
  seedTitles: string[];
  toneNotes: string;
  source: "claude" | "gemini" | "fallback";
}

export interface Provider {
  name: string;
  logo: string | null;
  link: string;
  kind: "subscription" | "free" | "rent" | "buy" | "addon";
  price?: string;
  /** True when the link opens the service itself, false when it is the TMDB page. */
  direct: boolean;
}

export interface WhereToWatch {
  providers: Provider[];
  imdbRating: number | null;
  imdbUrl: string | null;
  justWatchUrl: string | null;
  note?: string;
}

export type SessionStatus =
  | "collecting"
  | "building"
  | "building_locked"
  | "swiping"
  | "matched"
  | "finalists"
  | "done";

export interface Finalist extends Title {
  score: number;
  likedBy: Role[];
}

export interface SessionState {
  code: string;
  status: SessionStatus;
  round: number;
  me: { role: Role; submitted: boolean; finishedRound: number };
  partner: { joined: boolean; submitted: boolean; finishedRound: number };
  brief: { vibe: string } | null;
  pool: Title[];
  mySwipes: Record<string, boolean>;
  match: { title: Title; source: string; rating: number | null } | null;
  finalists: Finalist[];
  myPick: string | null;
  partnerPicked: boolean;
  shareUrl: string;
}
