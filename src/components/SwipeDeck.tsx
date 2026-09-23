"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { TitleCard } from "./TitleCard";
import type { Title } from "@/lib/types";
import { titleKey } from "@/lib/util";

const THROW = 120; // px of drag that counts as a decision
const FLICK = 500; // px/s that counts as a decision regardless of distance

function TopCard({
  title,
  onDecide,
}: {
  title: Title;
  onDecide: (liked: boolean) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], [-14, 0, 14]);
  const likeOpacity = useTransform(x, [30, 140], [0, 1]);
  const passOpacity = useTransform(x, [-140, -30], [1, 0]);
  const [exitTo, setExitTo] = useState<number | null>(null);

  const decide = (liked: boolean) => {
    setExitTo(liked ? 1 : -1);
    onDecide(liked);
  };

  const onDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x > THROW || info.velocity.x > FLICK) decide(true);
    else if (info.offset.x < -THROW || info.velocity.x < -FLICK) decide(false);
  };

  return (
    <motion.div
      className="absolute inset-0 no-select cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      drag={exitTo === null ? "x" : false}
      dragElastic={0.55}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.96, opacity: 0, y: 10 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{
        x: (exitTo ?? 1) * 620,
        opacity: 0,
        rotate: (exitTo ?? 1) * 22,
        transition: { duration: 0.32, ease: [0.3, 0, 0.2, 1] },
      }}
      transition={{ type: "spring", stiffness: 340, damping: 32 }}
    >
      <TitleCard title={title} />

      <motion.div
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute left-6 top-8 -rotate-12 rounded-xl border-[3px] border-yes px-3.5 py-1.5 text-xl font-black tracking-wider text-yes"
      >
        YES
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="pointer-events-none absolute right-6 top-8 rotate-12 rounded-xl border-[3px] border-no px-3.5 py-1.5 text-xl font-black tracking-wider text-no"
      >
        NOPE
      </motion.div>
    </motion.div>
  );
}

export function SwipeDeck({
  pool,
  alreadySwiped,
  vibe,
  round,
  onSwipe,
  onDone,
}: {
  pool: Title[];
  alreadySwiped: Record<string, boolean>;
  vibe: string | null;
  round: number;
  onSwipe: (title: Title, liked: boolean) => void;
  onDone: () => void;
}) {
  // The deck is fixed the moment it is first dealt. Polling keeps arriving
  // with a fresh `pool` array, and re-deriving the queue from it would pull
  // cards out from under a swipe in progress. The parent remounts this
  // component per round, which is what re-deals it.
  const [queue] = useState<Title[]>(() =>
    // Resuming after a refresh drops you back exactly where you were.
    pool.filter((t) => !(titleKey(t) in alreadySwiped))
  );

  const [index, setIndex] = useState(0);
  const doneFired = useRef(false);
  const total = pool.length;
  const seen = total - queue.length + index;

  useEffect(() => {
    if (total > 0 && index >= queue.length && !doneFired.current) {
      doneFired.current = true;
      onDone();
    }
  }, [index, queue.length, total, onDone]);

  const decide = (liked: boolean) => {
    const current = queue[index];
    if (!current) return;
    onSwipe(current, liked);
    setIndex((i) => i + 1);
  };

  const current = queue[index];
  const next = queue[index + 1];
  const after = queue[index + 2];

  return (
    <div className="flex flex-1 flex-col pb-6">
      <div className="flex items-center justify-between gap-3 pb-4">
        <div className="min-w-0">
          {vibe ? (
            <p className="truncate text-[13px] leading-relaxed text-white/60">{vibe}</p>
          ) : (
            <p className="text-[13px] text-white/60">Your deck</p>
          )}
          {round > 1 ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              Round two
            </p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full border border-line bg-raised px-3 py-1 text-xs font-semibold tabular-nums text-white/70">
          {Math.min(seen + 1, total)} / {total}
        </span>
      </div>

      <div className="relative flex-1 min-h-[440px]">
        {after ? (
          <div className="absolute inset-0 scale-[0.92] translate-y-5 opacity-50">
            <TitleCard title={after} dim />
          </div>
        ) : null}
        {next ? (
          <div className="absolute inset-0 scale-[0.96] translate-y-2.5 opacity-80">
            <TitleCard title={next} dim />
          </div>
        ) : null}

        <AnimatePresence>
          {current ? (
            <TopCard key={titleKey(current)} title={current} onDecide={decide} />
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-5 pt-6">
        <button
          onClick={() => decide(false)}
          disabled={!current}
          aria-label="Pass"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-raised text-no transition active:scale-90 disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <button
          onClick={() => decide(true)}
          disabled={!current}
          aria-label="Like"
          className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-yes text-ink shadow-lg shadow-yes/25 transition active:scale-90 disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current">
            <path d="M12 21s-7.5-4.6-9.6-9A5.5 5.5 0 0 1 12 6.2a5.5 5.5 0 0 1 9.6 5.8C19.5 16.4 12 21 12 21z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
