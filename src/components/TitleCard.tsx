"use client";

import type { Title } from "@/lib/types";
import { Rating } from "./ui";

export function TitleCard({ title, dim = false }: { title: Title; dim?: boolean }) {
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-[28px] border border-white/10
                  bg-surface shadow-2xl shadow-black/60 ${dim ? "brightness-[0.55]" : ""}`}
    >
      {title.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={title.poster}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 skeleton" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5">
        <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur">
          {title.mediaType === "tv" ? "Series" : "Film"}
        </span>
        {title.language ? (
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70 backdrop-blur">
            {title.language}
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-6">
        <h3 className="text-[26px] font-semibold leading-[1.12] tracking-tight">{title.title}</h3>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/65">
          {title.year ? <span className="tabular-nums">{title.year}</span> : null}
          <Rating value={title.rating} />
          {title.runtime ? <span>{title.runtime}</span> : null}
        </div>

        {title.genres.length ? (
          <p className="mt-2 text-[13px] text-white/45">{title.genres.slice(0, 3).join(" · ")}</p>
        ) : null}

        <p className="mt-3.5 text-[14px] leading-[1.55] text-white/80">{title.overview}</p>
      </div>
    </div>
  );
}
