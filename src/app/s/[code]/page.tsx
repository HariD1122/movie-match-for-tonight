"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PreferenceForm } from "@/components/PreferenceForm";
import { ShareStep } from "@/components/ShareStep";
import { SwipeDeck } from "@/components/SwipeDeck";
import { MatchReveal } from "@/components/MatchReveal";
import { Finalists } from "@/components/Finalists";
import { ErrorNote, Screen, Waiting, Wordmark } from "@/components/ui";
import { deviceId, get, post, setPairKey } from "@/lib/client";
import type { Finalist, Preferences, SessionState, Title } from "@/lib/types";

const POLL_MS = 1500;
const POOL_TRIES = 3;

export default function SessionPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params.code ?? "").toUpperCase();

  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const device = useRef<string>("");
  const inFlight = useRef(false);
  const poolRun = useRef<{ round: number; tries: number; busy: boolean } | null>(null);
  const finishSent = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await get<SessionState>(
        `/api/session/${code}/state?deviceId=${encodeURIComponent(device.current)}`
      );
      setState(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, [code]);

  // Join (or rejoin) on arrival.
  useEffect(() => {
    device.current = deviceId();
    let alive = true;
    (async () => {
      try {
        const res = await post<{ role: "a" | "b"; pairKey: string }>(
          `/api/session/${code}/join`,
          { deviceId: device.current }
        );
        if (!alive) return;
        setPairKey(res.pairKey);
        setJoined(true);
        await refresh();
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, refresh]);

  // Poll. Both phones converge on the same state within a beat of each other,
  // which is what makes the match land on both screens at once.
  useEffect(() => {
    if (!joined) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [joined, refresh]);

  // Whoever gets here first builds the pool; the server sorts out the race.
  // A failed build hands the lock back, so this has to be able to try again --
  // marking the round as "asked" up front would strand the session for good.
  // Depends on the whole `state` so each poll re-evaluates the guards.
  useEffect(() => {
    if (state?.status !== "building") return;
    const round = state.round;
    const run = poolRun.current;
    if (run && run.round === round && (run.busy || run.tries >= POOL_TRIES)) return;

    const attempt = { round, tries: run?.round === round ? run.tries + 1 : 1, busy: true };
    poolRun.current = attempt;

    post(`/api/session/${code}/pool`, {})
      .then(() => {
        attempt.busy = false;
        setError(null);
        return refresh();
      })
      .catch((err) => {
        attempt.busy = false;
        // Stay quiet until the retries are spent; the next poll picks it up.
        if (attempt.tries >= POOL_TRIES) setError((err as Error).message);
      });
  }, [state, code, refresh]);

  const submitPrefs = async (prefs: Preferences) => {
    await post(`/api/session/${code}/preferences`, {
      deviceId: device.current,
      preferences: prefs,
    });
    await refresh();
  };

  const onSwipe = async (title: Title, liked: boolean) => {
    try {
      const res = await post<{ matched: boolean }>(`/api/session/${code}/swipe`, {
        deviceId: device.current,
        tmdbId: title.tmdbId,
        mediaType: title.mediaType,
        liked,
      });
      if (res.matched) await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDeckFinished = useCallback(async () => {
    if (!state) return;
    if (finishSent.current === state.round) return;
    finishSent.current = state.round;
    try {
      await post(`/api/session/${code}/finish`, { deviceId: device.current });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [code, refresh, state]);

  const onPick = async (t: Finalist) => {
    await post(`/api/session/${code}/pick`, {
      deviceId: device.current,
      tmdbId: t.tmdbId,
      mediaType: t.mediaType,
    });
    await refresh();
  };

  const onRate = async (n: number) => {
    await post(`/api/session/${code}/rate`, { deviceId: device.current, rating: n });
    await refresh();
  };

  if (error && !state) {
    return (
      <Screen>
        <Wordmark />
        <div className="flex flex-1 flex-col justify-center gap-4 pb-24">
          <ErrorNote message={error} onRetry={() => location.reload()} />
          <button
            onClick={() => router.push("/")}
            className="text-sm font-semibold text-muted hover:text-white"
          >
            Start a new session instead
          </button>
        </div>
      </Screen>
    );
  }

  if (!state) {
    return (
      <Screen>
        <Wordmark />
        <Waiting title="Opening your session" body="One second." />
      </Screen>
    );
  }

  const iAmWaitingOnPartner =
    state.status === "swiping" && state.me.finishedRound >= state.round;

  return (
    <Screen>
      <Wordmark sub={state.status === "collecting" ? `Session ${state.code}` : undefined} />

      {error ? (
        <div className="pb-4">
          <ErrorNote message={error} onRetry={refresh} />
        </div>
      ) : null}

      {!state.me.submitted ? (
        <PreferenceForm role={state.me.role} onSubmit={submitPrefs} />
      ) : state.status === "collecting" ? (
        state.me.role === "a" ? (
          <ShareStep
            code={state.code}
            shareUrl={state.shareUrl}
            partnerJoined={state.partner.joined}
            partnerSubmitted={state.partner.submitted}
          />
        ) : (
          <Waiting
            title="You're all set"
            body="Waiting for them to finish their side. It takes about a minute."
          />
        )
      ) : state.status === "building" || state.status === "building_locked" ? (
        <Waiting
          title={state.round > 1 ? "Rethinking it" : "Reading you both"}
          body={
            state.round > 1
              ? "Working out what you actually responded to, then dealing 30 new titles."
              : "Finding the 30 titles that sit in the overlap between the two of you."
          }
        />
      ) : state.status === "swiping" ? (
        iAmWaitingOnPartner ? (
          <Waiting title="Done on your side" body="Waiting for them to finish the deck." />
        ) : (
          <SwipeDeck
            key={state.round}
            pool={state.pool}
            alreadySwiped={state.mySwipes}
            vibe={state.brief?.vibe ?? null}
            round={state.round}
            onSwipe={onSwipe}
            onDone={onDeckFinished}
          />
        )
      ) : state.status === "finalists" ? (
        <Finalists
          titles={state.finalists}
          myRole={state.me.role}
          myPick={state.myPick}
          partnerPicked={state.partnerPicked}
          onPick={onPick}
        />
      ) : state.match ? (
        <MatchReveal
          title={state.match.title}
          source={state.match.source}
          rating={state.match.rating}
          onRate={onRate}
          onAgain={() => router.push("/")}
        />
      ) : (
        <Waiting title="Wrapping up" body="One moment." />
      )}
    </Screen>
  );
}
