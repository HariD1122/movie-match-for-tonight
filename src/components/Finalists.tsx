"use client";

import { useState } from "react";
import type { Finalist } from "@/lib/types";
import { Rating, Spinner } from "./ui";
import { titleKey } from "@/lib/util";

function likedLabel(likedBy: Finalist["likedBy"], myRole: "a" | "b"): string {
  if (likedBy.length === 2) return "You both liked this";
  if (likedBy.length === 1) return likedBy[0] === myRole ? "You liked this" : "They liked this";
  return "Highest rated of the lot";
}

export function Finalists({
  titles,
  myRole,
  myPick,
  partnerPicked,
  onPick,
}: {
  titles: Finalist[];
  myRole: "a" | "b";
  myPick: string | null;
  partnerPicked: boolean;
  onPick: (t: Finalist) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="flex flex-1 flex-col pb-10">
      <div className="pt-2 animate-rise">
        <p className="text-[13px] font-semibold uppercase tracking-[0.3em] text-accent">
          Sixty titles, no match
        </p>
        <h2 className="mt-3 text-[26px] font-semibold leading-tight">
          So here are the five you came closest on
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Tap the one you want. When you both tap the same title, that&apos;s the night.
          {partnerPicked && !myPick ? " They've already picked." : ""}
        </p>
      </div>

      <div className="mt-7 flex flex-col gap-3">
        {titles.map((t, i) => {
          const key = titleKey(t);
          const mine = myPick === key;
          return (
            <button
              key={key}
              disabled={busy !== null}
              onClick={async () => {
                setBusy(key);
                try {
                  await onPick(t);
                } finally {
                  setBusy(null);
                }
              }}
              style={{ animationDelay: `${i * 55}ms` }}
              className={`flex animate-rise items-stretch gap-4 rounded-2xl border p-3 text-left
                          transition active:scale-[0.99] disabled:opacity-60 ${
                            mine
                              ? "border-accent bg-accent/12"
                              : "border-line bg-raised hover:border-white/25"
                          }`}
            >
              {t.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.poster}
                  alt=""
                  className="h-[108px] w-[72px] shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="skeleton h-[108px] w-[72px] shrink-0 rounded-xl" />
              )}

              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                <p className="truncate text-[17px] font-semibold leading-tight">{t.title}</p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-white/55">
                  {t.year ? <span className="tabular-nums">{t.year}</span> : null}
                  <Rating value={t.rating} />
                  {t.runtime ? <span>{t.runtime}</span> : null}
                </div>
                <p
                  className={`text-xs font-medium ${
                    t.likedBy.length === 2 ? "text-yes" : "text-muted"
                  }`}
                >
                  {likedLabel(t.likedBy, myRole)}
                </p>
              </div>

              <div className="flex w-10 shrink-0 items-center justify-center">
                {busy === key ? (
                  <Spinner className="text-accent" />
                ) : mine ? (
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <span className="text-muted">→</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {myPick ? (
        <div className="mt-7 flex items-center justify-center gap-2.5 text-sm text-muted">
          <Spinner className="text-accent" />
          {partnerPicked
            ? "You picked different titles — tap theirs, or they'll tap yours."
            : "Waiting for them to pick…"}
        </div>
      ) : null}
    </div>
  );
}
