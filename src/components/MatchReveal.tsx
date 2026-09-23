"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Title, WhereToWatch } from "@/lib/types";
import { Button, Rating, Spinner } from "./ui";

const KIND_LABEL: Record<string, string> = {
  subscription: "Included",
  free: "Free",
  addon: "Add-on",
  rent: "Rent",
  buy: "Buy",
};

function Providers({ where }: { where: WhereToWatch | null }) {
  if (!where) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-muted">
        <Spinner className="text-accent" />
        Checking Indian streaming services…
      </div>
    );
  }

  if (!where.providers.length) {
    return (
      <div className="rounded-2xl border border-line bg-raised px-4 py-4 text-sm leading-relaxed text-muted">
        {where.note ?? "Not streaming in India right now."}
        {where.justWatchUrl ? (
          <a
            href={where.justWatchUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block font-semibold text-accent"
          >
            Check JustWatch →
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {where.providers.map((p) => (
        <a
          key={p.name}
          href={p.link}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3.5 rounded-2xl border border-line bg-raised px-4 py-3.5
                     transition hover:border-white/25 active:scale-[0.99]"
        >
          {p.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.logo} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            // Services TMDB has no artwork for (defunct ones, mostly) get a
            // monogram rather than an empty square.
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-line text-sm font-bold text-white/70">
              {p.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{p.name}</p>
            <p className="text-xs text-muted">
              {KIND_LABEL[p.kind] ?? p.kind}
              {p.price ? ` · ${p.price}` : ""}
              {p.direct ? "" : " · opens TMDB"}
            </p>
          </div>
          <span className="text-muted">→</span>
        </a>
      ))}
    </div>
  );
}

function RateIt({
  current,
  onRate,
}: {
  current: number | null;
  onRate: (n: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  if (current) {
    return (
      <p className="text-center text-sm text-muted">
        You rated it {current}/5. That shapes what comes up next time.
      </p>
    );
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted">Once you&apos;ve watched it — how was it?</p>
      <div className="mt-3 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRate(n);
              } finally {
                setBusy(false);
              }
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-line
                       bg-raised text-[15px] font-semibold transition hover:border-gold/60
                       hover:text-gold active:scale-90 disabled:opacity-40"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MatchReveal({
  title,
  source,
  rating,
  onRate,
  onAgain,
}: {
  title: Title;
  source: string;
  rating: number | null;
  onRate: (n: number) => Promise<void>;
  onAgain: () => void;
}) {
  const [where, setWhere] = useState<WhereToWatch | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/watch?tmdbId=${title.tmdbId}&mediaType=${title.mediaType}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && !d.error) setWhere(d as WhereToWatch);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [title.tmdbId, title.mediaType]);

  return (
    <div className="flex flex-1 flex-col pb-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        className="pt-4 text-center"
      >
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 260, damping: 18 }}
          className="text-[13px] font-semibold uppercase tracking-[0.3em] text-accent"
        >
          {source === "final" ? "Decided" : "It's a match"}
        </motion.p>
        <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight">
          {title.title}
        </h2>
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-white/60">
          {title.year ? <span className="tabular-nums">{title.year}</span> : null}
          <Rating value={where?.imdbRating ?? title.rating} />
          <span className="text-xs text-muted">
            {where?.imdbRating ? "IMDb" : "TMDb"}
          </span>
          {title.runtime ? <span>{title.runtime}</span> : null}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.12, duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative mt-6 overflow-hidden rounded-[26px] border border-white/10 shadow-2xl shadow-accent/10"
      >
        {title.backdrop || title.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={title.backdrop ?? title.poster ?? ""}
            alt=""
            className="aspect-[16/10] w-full object-cover"
          />
        ) : (
          <div className="skeleton aspect-[16/10] w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.45 }}
        className="mt-5 flex flex-col gap-5"
      >
        {title.genres.length ? (
          <p className="text-[13px] text-white/45">{title.genres.slice(0, 4).join(" · ")}</p>
        ) : null}
        <p className="text-[15px] leading-relaxed text-white/80">{title.overview}</p>

        <div>
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.13em] text-white/50">
            Watch it in India
          </h3>
          <Providers where={where} />
        </div>

        {where?.imdbUrl ? (
          <a
            href={where.imdbUrl}
            target="_blank"
            rel="noreferrer"
            className="text-center text-sm font-semibold text-muted hover:text-white"
          >
            View on IMDb →
          </a>
        ) : null}

        <div className="mt-2 border-t border-line pt-6">
          <RateIt current={rating} onRate={onRate} />
        </div>

        <Button variant="ghost" onClick={onAgain} className="mt-2 w-full">
          Start another night
        </Button>
      </motion.div>
    </div>
  );
}
