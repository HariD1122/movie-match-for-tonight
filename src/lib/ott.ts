import { imdbId, providerLogo, watchProviders } from "./tmdb";
import type { Provider, WhereToWatch } from "./types";

const HOST = process.env.RAPIDAPI_HOST || "streaming-availability.p.rapidapi.com";

interface RapidService {
  id?: string;
  name?: string;
  imageSet?: { lightThemeImage?: string; darkThemeImage?: string };
}
interface RapidOption {
  service?: RapidService;
  type?: string; // subscription | rent | buy | free | addon
  link?: string;
  price?: { formatted?: string };
  addon?: { name?: string };
}
interface RapidShow {
  imdbId?: string;
  rating?: number; // IMDb rating x10
  streamingOptions?: Record<string, RapidOption[]>;
}

const KIND_ORDER: Record<Provider["kind"], number> = {
  subscription: 0,
  free: 1,
  addon: 2,
  rent: 3,
  buy: 4,
};

function normaliseKind(t?: string): Provider["kind"] {
  switch (t) {
    case "subscription":
      return "subscription";
    case "free":
      return "free";
    case "addon":
      return "addon";
    case "rent":
      return "rent";
    case "buy":
      return "buy";
    default:
      return "subscription";
  }
}

function prettyName(s?: RapidService, addon?: string): string {
  const base = s?.name || s?.id || "Unknown";
  return addon ? `${base} · ${addon}` : base;
}

async function fromRapidApi(
  tmdbIdNum: number,
  mediaType: "movie" | "tv"
): Promise<{ providers: Provider[]; imdb: string | null; imdbRating: number | null } | null> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return null;

  const showId = `tmdb/${mediaType === "movie" ? "movie" : "series"}/${tmdbIdNum}`;
  const url = `https://${HOST}/shows/${showId}?country=in&output_language=en&series_granularity=show`;

  try {
    const res = await fetch(url, {
      headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
      next: { revalidate: 60 * 30 },
    });
    if (!res.ok) return null;
    const show = (await res.json()) as RapidShow;

    const options = show.streamingOptions?.in ?? [];
    const byName = new Map<string, Provider>();
    for (const o of options) {
      if (!o.link) continue;
      const name = prettyName(o.service, o.addon?.name);
      const kind = normaliseKind(o.type);
      const existing = byName.get(name);
      // Keep the cheapest way in: a subscription link beats a rental link.
      if (existing && KIND_ORDER[existing.kind] <= KIND_ORDER[kind]) continue;
      byName.set(name, {
        name,
        logo: o.service?.imageSet?.darkThemeImage || o.service?.imageSet?.lightThemeImage || null,
        link: o.link,
        kind,
        price: o.price?.formatted,
        direct: true,
      });
    }

    const providers = [...byName.values()].sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind]);
    return {
      providers,
      imdb: show.imdbId ?? null,
      imdbRating: typeof show.rating === "number" ? Math.round(show.rating) / 10 : null,
    };
  } catch (err) {
    console.error("[tonight] RapidAPI lookup failed:", err);
    return null;
  }
}

async function fromTmdb(tmdbIdNum: number, mediaType: "movie" | "tv") {
  const res = await watchProviders(tmdbIdNum, mediaType);
  if (!res) return { providers: [] as Provider[], justWatchUrl: null as string | null };

  const link = res.link ?? null;
  const out = new Map<string, Provider>();
  const push = (list: { provider_name: string; logo_path: string }[] | undefined, kind: Provider["kind"]) => {
    for (const p of list ?? []) {
      const existing = out.get(p.provider_name);
      if (existing && KIND_ORDER[existing.kind] <= KIND_ORDER[kind]) continue;
      out.set(p.provider_name, {
        name: p.provider_name,
        logo: providerLogo(p.logo_path),
        // TMDB does not expose per-service deep links, only its own page.
        link: link ?? "",
        kind,
        direct: false,
      });
    }
  };
  push(res.flatrate, "subscription");
  push(res.free, "free");
  push(res.ads, "free");
  push(res.rent, "rent");
  push(res.buy, "buy");

  return {
    providers: [...out.values()]
      .filter((p) => p.link)
      .sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind]),
    justWatchUrl: link,
  };
}

/**
 * Where can these two actually watch this tonight, in India.
 * RapidAPI gives real deep links and the true IMDb rating; TMDB fills in
 * whatever RapidAPI misses (and covers us entirely if the key is absent).
 */
export async function whereToWatch(
  tmdbIdNum: number,
  mediaType: "movie" | "tv"
): Promise<WhereToWatch> {
  const [rapid, tmdb] = await Promise.all([
    fromRapidApi(tmdbIdNum, mediaType),
    fromTmdb(tmdbIdNum, mediaType),
  ]);

  const providers: Provider[] = [];
  const seen = new Set<string>();
  for (const p of [...(rapid?.providers ?? []), ...tmdb.providers]) {
    const k = p.name.toLowerCase().split(" · ")[0];
    if (seen.has(k)) continue;
    seen.add(k);
    providers.push(p);
  }

  const imdb = rapid?.imdb ?? (await imdbId(tmdbIdNum, mediaType));

  return {
    providers,
    imdbRating: rapid?.imdbRating ?? null,
    imdbUrl: imdb ? `https://www.imdb.com/title/${imdb}/` : null,
    justWatchUrl: tmdb.justWatchUrl,
    note: providers.length
      ? undefined
      : "Not on any Indian streaming service right now — it may be in cinemas or unreleased here.",
  };
}
