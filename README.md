# Tonight

A movie and TV matchmaker for two people who can never agree. Both of you answer
a short form independently, both swipe the same 30 titles, and the first one you
both say yes to is the one you watch — with the Indian streaming services it's on
right now, and a direct link to each.

---

## How a night runs

1. **Partner A** opens the app and fills in their preferences — mood chips, a free-text
   line about what they actually want tonight, languages, movies vs. series, a minimum
   rating, and an era.
2. The app shows a **QR code**. A sends it straight into WhatsApp (or anything else) as
   an image, or shares the link.
3. **Partner B** scans it, lands in the same session, and fills in the same form without
   ever seeing A's answers.
4. When both are in, **the model reads both profiles together** — chips and free text — and
   writes a search brief: the genres that actually serve both of them, textures to chase,
   things to dodge, and a list of specific titles that sit in the overlap.
5. That brief drives **TMDB**, which returns 30 titles filtered to satisfy both sets of
   hard constraints from the start.
6. Both partners swipe the same 30 cards, **each in a different order**, so nobody is
   just mirroring the other.
7. A match shows up on **both screens at once**, with full details and **where to stream
   it in India**.
8. No match after 30? The model reads **what each of you actually swiped right on** and deals
   30 fresh titles, deduplicated against everything you've already seen. One more round.
9. Still nothing? You get the **top 5 by combined right-swipe score** and make the call
   together — tap the same title and it's settled.
10. Rate it after you watch. That rating is what steers every future deck.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Create the database

In your Supabase project, open the SQL editor and run
[`supabase/schema.sql`](supabase/schema.sql).

RLS is on for every table with no policies attached. The app only ever talks to
Supabase server-side with the service-role key, which bypasses RLS — so a leaked
anon key reads nothing.

### 3. Fill in the keys

```bash
cp .env.example .env.local
```

| Variable | Where it comes from |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) — this is the brief engine |
| `ANTHROPIC_API_KEY` | Optional. Set it to run the brief on Claude instead of Gemini. |
| `TMDB_ACCESS_TOKEN` | TMDB → Settings → API → *API Read Access Token* (v4). `TMDB_API_KEY` (v3) works too. |
| `RAPIDAPI_KEY` | Subscribe to **OTT Details** on [RapidAPI](https://rapidapi.com/gox-ai-gox-ai-default/api/ott-details) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_APP_URL` | The origin the QR code points at — see below |

Nothing but `NEXT_PUBLIC_APP_URL` is exposed to the browser. Every API call to the
model, TMDB, RapidAPI and Supabase happens on the server.

### 4. Make the QR reachable

The QR encodes `NEXT_PUBLIC_APP_URL/s/<CODE>`. `localhost` means nothing to your
partner's phone, so in local development set it to your machine's LAN address:

```bash
# find your IP, then:
NEXT_PUBLIC_APP_URL=http://192.168.1.5:3000
```

```bash
npm run dev -- -H 0.0.0.0
```

In production just set it to your deployed origin.

### 5. Run

```bash
npm run dev
```

---

## Degrading gracefully

Every external service can fail without taking the night down:

- **Model unavailable** → Gemini is retried once on a timeout, 429 or 5xx, then retried on
  `gemini-flash-latest` if the pinned model id has been retired (Google has already killed
  `gemini-2.0-flash` and `gemini-2.5-flash`). After that it falls back to a deterministic
  brief built from the mood chips alone — you lose the nuance from the free text, not the
  app. `brief.source` on the session row records which engine actually ran.
- **RapidAPI unavailable, unsubscribed or rate-limited** → a 429 on the BASIC plan is
  retried once after a short backoff, then availability falls back to TMDB's own India
  watch-provider data. You lose per-service deep links and the true IMDb number, not the
  answer to "where do we watch this".
- **A thin pool** → the TMDB sweep widens in stages (looser vote thresholds, then dropping
  the genre filter) rather than returning six cards. The rating floor and era are never
  relaxed, because those are the parts you explicitly asked for.

## One thing worth knowing about ratings

The rating on each swipe card is **TMDB's user score**, not IMDb's — TMDB's API doesn't
carry IMDb ratings, and fetching the real one for all 30 cards would mean 30 extra
third-party calls before the deck can even be dealt. The two correlate closely and the
minimum-rating filter behaves the way you'd expect.

The **match screen** does show the true IMDb rating, pulled from OTT Details along with the
per-service streaming links, and links out to the IMDb page. The label under the number
tells you which source you're looking at. Fetching it for all 30 cards is not an option:
OTT Details is keyed by IMDb id and its BASIC plan rate-limits per second, so a full deck
would take half a minute before anyone could swipe.

---

## Layout

```
src/
  app/
    page.tsx                 landing — start a night, join by code, past nights
    s/[code]/page.tsx        the whole session: form → QR → deck → match
    api/
      session/               create, join, preferences, state, pool, swipe,
                             finish, pick, rate, qr
      watch/                 Indian OTT availability for one title
      history/               past nights for this pair
  components/                PreferenceForm, ShareStep, SwipeDeck, TitleCard,
                             MatchReveal, Finalists, HistoryStrip, ui
  lib/
    brief.ts                 both profiles + history → search brief
    providers/gemini.ts      Gemini adapter (responseSchema) — the engine
    providers/claude.ts      Claude adapter, used only if ANTHROPIC_API_KEY is set
    pool.ts                  brief + constraints → 30 titles
    tmdb.ts                  discover, search, detail, watch providers
    ott.ts                   OTT Details deep links + IMDb rating, TMDB fallback
    session.ts               state machine, match detection, finalists
    db.ts                    Supabase service-role client
supabase/schema.sql
```

### How the two phones stay in sync

Each client polls `GET /api/session/[code]/state` every 1.5s and gets back everything it
needs to render. A match is written the instant the second right-swipe lands, so both
screens flip within one poll of each other.

Pool generation is the one place two clients race. Whichever client sees `building` first
calls `POST /api/session/[code]/pool`; that handler takes a conditional-update lock in
Postgres, so exactly one of them does the work and the other just keeps polling. If the
build throws, the lock is handed back so the next poll retries instead of hanging.
