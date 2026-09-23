// The SDK's zod helper is typed against zod v4, which ships inside zod 3.25+
// under this subpath. Importing plain "zod" here gives a type mismatch.
import * as z from "zod/v4";
import { MOOD_GENRES, MOOD_LABEL, ALL_GENRE_NAMES } from "./genres";
import type { Brief, Preferences, Title } from "./types";
import { mergedLanguages, mergedRating, mergedYearRange, moviesOnly } from "./util";
import { briefFromClaude } from "./providers/claude";
import { briefFromGemini } from "./providers/gemini";

export const BriefSchema = z.object({
  vibe: z
    .string()
    .describe("One warm sentence, max 14 words, naming the evening both of them are actually up for."),
  genres: z
    .array(z.string())
    .describe("3-6 TMDB genre names, most important first, that satisfy BOTH partners."),
  avoid_genres: z
    .array(z.string())
    .describe("TMDB genre names to filter out because one partner clearly would not enjoy them."),
  keywords: z
    .array(z.string())
    .describe("3-8 short texture words from their free text, e.g. 'slow burn', 'heist', 'found family'."),
  seed_titles: z
    .array(z.string())
    .describe(
      "10-14 real, specific movie or series titles (English or Indian) that land in the overlap. Exact titles only."
    ),
  tone_notes: z.string().describe("One or two sentences on what to lean into and what to dodge."),
});

export type RawBrief = z.infer<typeof BriefSchema>;

export interface HistoryItem {
  title: string;
  year: number | null;
  genres: string[];
  rating: number | null; // 1-5 they gave it after watching
}

function profileText(label: string, p: Preferences): string {
  const moods = p.moods.length ? p.moods.map((m) => MOOD_LABEL[m]).join(", ") : "no mood selected";
  const langs = p.languages.includes("any") ? "any language" : p.languages.join(", ");
  const eras = p.eras.includes("any") || !p.eras.length ? "any era" : p.eras.join(", ");
  return [
    `${label}:`,
    `  moods: ${moods}`,
    `  in their words: ${p.moodText?.trim() ? `"${p.moodText.trim()}"` : "(left blank)"}`,
    `  languages: ${langs}`,
    `  content: ${p.contentType === "movies" ? "movies only" : "movies or series"}`,
    `  minimum rating: ${p.minRating}+`,
    `  era: ${eras}`,
  ].join("\n");
}

function historyText(history: HistoryItem[]): string {
  if (!history.length) return "This is their first night using the app — no history yet.";
  const lines = history.slice(0, 15).map((h) => {
    const verdict =
      h.rating == null
        ? "watched, not rated"
        : h.rating >= 4
        ? `LOVED it (${h.rating}/5)`
        : h.rating <= 2
        ? `did not enjoy it (${h.rating}/5)`
        : `it was fine (${h.rating}/5)`;
    return `  - ${h.title}${h.year ? ` (${h.year})` : ""} [${h.genres.join(", ")}] — ${verdict}`;
  });
  return `What they have actually watched together before:\n${lines.join("\n")}`;
}

export const SYSTEM = `You are the taste engine behind a two-person movie-night app used in India.

Two people filled in a preference form independently and cannot see each other's answers.
Your job is to find the honest overlap between them and turn it into a search brief.

Rules:
- The overlap is the point. If one wants horror and the other wants romance, do not
  average them into beige drama — find the thing that genuinely serves both
  (a romantic thriller, a stylish supernatural love story), and say so in tone_notes.
- Their free text outranks their chips. "Something dumb I can fall asleep to" and
  "light & fun" are not the same brief.
- Genre names must come from this exact list: ${ALL_GENRE_NAMES.join(", ")}.
- seed_titles must be real titles you are confident exist, spelled as they are known.
  Favour titles that are plausibly on an Indian streaming service. Mix in Indian
  cinema when their languages call for it. Never invent a title.
- If they have history, weight what they RATED highly far above what they said they
  wanted, and steer away from anything close to what they rated poorly.`;

function fallbackBrief(a: Preferences, b: Preferences, why: string): Brief {
  const genres = new Set<string>();
  for (const p of [a, b]) for (const m of p.moods) for (const g of MOOD_GENRES[m]) genres.add(g);
  if (!genres.size) ["Drama", "Comedy", "Thriller", "Action"].forEach((g) => genres.add(g));
  const text = `${a.moodText} ${b.moodText}`.trim();
  return {
    vibe: "Something you'll both actually sit through.",
    genres: [...genres].slice(0, 6),
    avoidGenres: [],
    keywords: text ? text.split(/\s+/).filter((w) => w.length > 3).slice(0, 6) : [],
    seedTitles: [],
    toneNotes: why,
    source: "fallback",
  };
}

/**
 * Gemini is the engine. The Claude adapter stays behind an explicit
 * ANTHROPIC_API_KEY so switching back is an env change, not a code change,
 * and a deterministic brief catches the case where neither is configured.
 */
export async function buildBrief(opts: {
  a: Preferences;
  b: Preferences;
  history: HistoryItem[];
  round: number;
  likedLastRound?: { a: Title[]; b: Title[] };
}): Promise<Brief> {
  const { a, b, history, round, likedLastRound } = opts;

  const [yearFrom, yearTo] = mergedYearRange(a, b);
  const constraints = [
    `Hard constraints already applied downstream (do not fight them):`,
    `  languages: ${mergedLanguages(a, b).join(", ")}`,
    `  ${moviesOnly(a, b) ? "movies only" : "movies and series both allowed"}`,
    `  rating floor: ${mergedRating(a, b)}+`,
    `  years: ${yearFrom}–${yearTo}`,
  ].join("\n");

  let roundNote = "";
  if (round > 1 && likedLastRound) {
    const fmt = (t: Title[]) =>
      t.length ? t.map((x) => `${x.title} [${x.genres.slice(0, 3).join("/")}]`).join(", ") : "(liked nothing)";
    roundNote = `
This is round 2. Round 1 produced no match, but here is what each of them
actually swiped right on, which is far more honest than the form:
  Partner A liked: ${fmt(likedLastRound.a)}
  Partner B liked: ${fmt(likedLastRound.b)}
Find the connective tissue between those two lists and build the brief around it.
Do not repeat any of those titles — they have already seen them.`;
  }

  const prompt = [
    profileText("Partner A", a),
    "",
    profileText("Partner B", b),
    "",
    constraints,
    "",
    historyText(history),
    roundNote,
    "",
    "Produce the search brief.",
  ].join("\n");

  const providers: { name: Brief["source"]; run: () => Promise<RawBrief | null> }[] = [];
  if (process.env.GEMINI_API_KEY) {
    providers.push({ name: "gemini", run: () => briefFromGemini(SYSTEM, prompt) });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({ name: "claude", run: () => briefFromClaude(SYSTEM, prompt) });
  }

  if (!providers.length) {
    return fallbackBrief(a, b, "No model key configured — built from your selections alone.");
  }

  for (const provider of providers) {
    try {
      const p = await provider.run();
      if (!p) continue;
      return {
        vibe: p.vibe,
        genres: p.genres,
        avoidGenres: p.avoid_genres ?? [],
        keywords: p.keywords ?? [],
        seedTitles: p.seed_titles ?? [],
        toneNotes: p.tone_notes ?? "",
        source: provider.name,
      };
    } catch (err) {
      console.error(`[tonight] ${provider.name} brief failed:`, err);
    }
  }

  return fallbackBrief(a, b, "The model was unavailable — built from your selections alone.");
}
