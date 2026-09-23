"use client";

import { useEffect, useState } from "react";
import { get, pairKey } from "@/lib/client";

interface Night {
  code: string;
  title: string;
  year: number | null;
  poster: string | null;
  rating: number | null;
  watchedAt: string;
}

export function HistoryStrip() {
  const [nights, setNights] = useState<Night[]>([]);

  useEffect(() => {
    const key = pairKey();
    if (!key) return;
    get<{ nights: Night[] }>(`/api/history?pairKey=${encodeURIComponent(key)}`)
      .then((d) => setNights(d.nights))
      .catch(() => {});
  }, []);

  if (!nights.length) return null;

  return (
    <section className="animate-rise">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.13em] text-white/50">
        Nights you&apos;ve had
      </h2>
      <div className="hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {nights.map((n, i) => (
          <div key={`${n.code}-${i}`} className="w-[96px] shrink-0">
            {n.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={n.poster}
                alt=""
                className="h-[142px] w-[96px] rounded-xl border border-line object-cover"
              />
            ) : (
              <div className="skeleton h-[142px] w-[96px] rounded-xl" />
            )}
            <p className="mt-2 truncate text-xs font-medium text-white/80">{n.title}</p>
            <p className="text-[11px] text-muted">
              {n.rating ? `${n.rating}/5` : "not rated"}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        What you rate here is what steers the next deck — more than anything you tick on the form.
      </p>
    </section>
  );
}
