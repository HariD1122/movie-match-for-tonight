import { imdbId, providerLogo, providerLogoIndex, watchProviders } from "./tmdb";
import type { Provider, WhereToWatch } from "./types";

const HOST = process.env.RAPIDAPI_HOST || "ott-details.p.rapidapi.com";

interface OttEntry {
  url?: string;
  platform?: string;
}
interface OttDetails {
  imdbid?: string;
  imdbrating?: number;
  title?: string;
  streamingAvailability?: { country?: Record<string, OttEntry[]> };
}

const KIND_ORDER: Record<Provider["kind"], number> = {
  subscription: 0,
  free: 1,
  addon: 2,
  rent: 3,
  buy: 4,
};

/**
 * OTT Details returns a lowercase platform slug and nothing else — no display
 * name, no logo. Anything not listed here falls back to a title-cased slug and
 * is assumed to be a subscription service, which is the common case in India.
 */
const PLATFORMS: Record<string, { name: string; kind: Provider["kind"] }> = {
  netflix: { name: "Netflix", kind: "subscription" },
  prime: { name: "Amazon Prime Video", kind: "subscription" },
  primevideo: { name: "Amazon Prime Video", kind: "subscription" },
  amazon: { name: "Amazon Prime Video", kind: "subscription" },
  hotstar: { name: "JioHotstar", kind: "subscription" },
  jiohotstar: { name: "JioHotstar", kind: "subscription" },
  disney: { name: "JioHotstar", kind: "subscription" },
  disneyplus: { name: "JioHotstar", kind: "subscription" },
  jiocinema: { name: "JioCinema", kind: "subscription" },
  zee5: { name: "ZEE5", kind: "subscription" },
  sonyliv: { name: "SonyLIV", kind: "subscription" },
  voot: { name: "Voot", kind: "subscription" },
  aha: { name: "aha", kind: "subscription" },
  sunnxt: { name: "Sun NXT", kind: "subscription" },
  erosnow: { name: "Eros Now", kind: "subscription" },
  altbalaji: { name: "ALTT", kind: "subscription" },
  mubi: { name: "MUBI", kind: "subscription" },
  appletv: { name: "Apple TV+", kind: "subscription" },
  mxplayer: { name: "MX Player", kind: "free" },
  tubi: { name: "Tubi", kind: "free" },
  plex: { name: "Plex", kind: "free" },
  itunes: { name: "Apple TV (iTunes)", kind: "rent" },
  apple: { name: "Apple TV (iTunes)", kind: "rent" },
  play: { name: "Google Play", kind: "rent" },
  googleplay: { name: "Google Play", kind: "rent" },
  youtube: { name: "YouTube", kind: "rent" },
};

// Longest first, so "googleplay" is tested before "play" and "appletv"
// before "apple".
const PLATFORM_KEYS = Object.keys(PLATFORMS).sort((a, b) => b.length - a.length);

function describe(slug: string): { name: string; kind: Provider["kind"] } {
  const key = slug.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (PLATFORMS[key]) return PLATFORMS[key];

  // The slugs are not a fixed vocabulary — "amazonprimevideo" and "primevideo"
  // both turn up — so fall back to a containment match before giving up.
  const near = PLATFORM_KEYS.find((k) => key.includes(k));
  if (near) return PLATFORMS[near];

  return { name: slug.charAt(0).toUpperCase() + slug.slice(1), kind: "subscription" };
}

/**
 * The BASIC RapidAPI plan rate-limits per second, so a burst 429s instantly.
 * One short backoff is enough — this is only called on the match screen.
 */
async function fetchDetails(imdb: string): Promise<OttDetails | null> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return null;

  const url = `https://${HOST}/gettitleDetails?imdbid=${encodeURIComponent(imdb)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
        signal: AbortSignal.timeout(12_000),
        next: { revalidate: 60 * 30 },
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      if (!res.ok) return null;
      return (await res.json()) as OttDetails;
    } catch (err) {
      console.error("[tonight] OTT Details lookup failed:", err);
      return null;
    }
  }
  return null;
}

function fromOttDetails(d: OttDetails): Provider[] {
  const india = d.streamingAvailability?.country?.IN ?? [];
  const byName = new Map<string, Provider>();

  for (const entry of india) {
    if (!entry.url || !entry.platform) continue;
    const { name, kind } = describe(entry.platform);
    const existing = byName.get(name);
    // Keep the cheapest way in: a subscription beats a rental.
    if (existing && KIND_ORDER[existing.kind] <= KIND_ORDER[kind]) continue;
    byName.set(name, { name, logo: null, link: entry.url, kind, direct: true });
  }

  return [...byName.values()].sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind]);
}

async function fromTmdb(tmdbIdNum: number, mediaType: "movie" | "tv") {
  const res = await watchProviders(tmdbIdNum, mediaType);
  if (!res) return { providers: [] as Provider[], justWatchUrl: null as string | null };

  const link = res.link ?? null;
  const out = new Map<string, Provider>();
  const push = (
    list: { provider_name: string; logo_path: string }[] | undefined,
    kind: Provider["kind"]
  ) => {
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

/** Loose match so "JioHotstar" can borrow the logo TMDB files under "Hotstar". */
function sameService(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const x = norm(a);
  const y = norm(b);
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Where can these two actually watch this tonight, in India.
 * OTT Details supplies the real per-service deep links and the true IMDb
 * rating; TMDB supplies the logos and covers us entirely if the key is absent.
 */
export async function whereToWatch(
  tmdbIdNum: number,
  mediaType: "movie" | "tv"
): Promise<WhereToWatch> {
  const [imdb, tmdb] = await Promise.all([
    imdbId(tmdbIdNum, mediaType),
    fromTmdb(tmdbIdNum, mediaType),
  ]);

  const details = imdb ? await fetchDetails(imdb) : null;
  const direct = details ? fromOttDetails(details) : [];

  // Deep links win; TMDB rows fill in anything OTT Details missed.
  const logos = await providerLogoIndex();
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const logoFor = (name: string): string | null => {
    const n = norm(name);
    const exact = logos.get(n);
    if (exact) return exact;
    // Only allow fuzzy matching on names long enough not to collide.
    if (n.length < 4) return null;
    for (const [k, v] of logos) {
      if (k.length >= 4 && (k.includes(n) || n.includes(k))) return v;
    }
    return null;
  };

  const providers: Provider[] = [];
  const taken: string[] = [];
  for (const p of [...direct, ...tmdb.providers]) {
    if (taken.some((t) => sameService(t, p.name))) continue;
    taken.push(p.name);
    providers.push({ ...p, logo: p.logo ?? logoFor(p.name) });
  }

  const rating = details?.imdbrating;

  return {
    providers,
    imdbRating: typeof rating === "number" && rating > 0 ? rating : null,
    imdbUrl: imdb ? `https://www.imdb.com/title/${imdb}/` : null,
    justWatchUrl: tmdb.justWatchUrl,
    note: providers.length
      ? undefined
      : "Not on any Indian streaming service right now — it may be in cinemas or unreleased here.",
  };
}
