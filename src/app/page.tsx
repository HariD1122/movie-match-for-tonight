"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote, Screen, Spinner } from "@/components/ui";
import { HistoryStrip } from "@/components/HistoryStrip";
import { deviceId, pairKey, post, setPairKey } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ code: string; pairKey: string }>("/api/session", {
        deviceId: deviceId(),
        pairKey: pairKey() ?? undefined,
      });
      setPairKey(res.pairKey);
      router.push(`/s/${res.code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const join = () => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) return;
    router.push(`/s/${clean}`);
  };

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-10 py-14">
        <div className="animate-rise">
          <h1 className="text-[15px] font-semibold tracking-[0.22em] text-white/90">TONIGHT</h1>
          <h2 className="mt-6 text-[34px] font-semibold leading-[1.08] tracking-tight">
            Stop scrolling.
            <br />
            <span className="text-accent">Start watching.</span>
          </h2>
          <p className="mt-4 max-w-[19rem] text-[15px] leading-relaxed text-muted">
            You both answer a few questions. You both swipe the same 30 titles. The first one
            you both say yes to is the one you watch — and we&apos;ll tell you exactly where to
            stream it in India.
          </p>
        </div>

        {error ? <ErrorNote message={error} /> : null}

        <div className="flex flex-col gap-3 animate-rise">
          <Button
            onClick={start}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2"
          >
            {busy ? <Spinner /> : null}
            {busy ? "Setting it up" : "Start tonight"}
          </Button>

          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="Got a code?"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 text-center text-[15px] font-semibold tracking-[0.25em] uppercase"
            />
            <Button variant="ghost" onClick={join} disabled={code.trim().length < 4}>
              Join
            </Button>
          </div>
        </div>

        <HistoryStrip />
      </div>

      <footer className="pb-7 text-center text-[11px] leading-relaxed text-muted">
        Titles and artwork from TMDB · availability for India
      </footer>
    </Screen>
  );
}
