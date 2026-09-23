"use client";

import { useState } from "react";
import { Button, Chip, Field, Spinner } from "./ui";
import type { ContentType, Era, Lang, Mood, Preferences } from "@/lib/types";

const MOODS: { id: Mood; label: string }[] = [
  { id: "light", label: "Light & fun" },
  { id: "intense", label: "Intense & gripping" },
  { id: "scary", label: "Scary" },
  { id: "romantic", label: "Romantic" },
  { id: "other", label: "Other" },
];

const LANGS: { id: Lang; label: string }[] = [
  { id: "hi", label: "Hindi" },
  { id: "en", label: "English" },
  { id: "ta", label: "Tamil" },
  { id: "te", label: "Telugu" },
  { id: "kn", label: "Kannada" },
  { id: "any", label: "Any" },
];

const ERAS: { id: Era; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "classic", label: "Classic" },
  { id: "midlands", label: "2000–2020" },
  { id: "recent", label: "Recent" },
];

const ERA_HINT: Partial<Record<Era, string>> = {
  classic: "pre-2000",
  recent: "2021–2026",
};

const RATINGS = [6, 7, 8, 9] as const;

/**
 * "Any" and the specific options are mutually exclusive, in both directions.
 * Tapping the only thing selected is a no-op — there is no valid empty state.
 */
function toggleWithAny<T extends string>(current: T[], value: T, anyValue: T): T[] {
  if (value === anyValue) return current.includes(anyValue) ? current : [anyValue];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current.filter((v) => v !== anyValue), value];
  return next.length ? next : [anyValue];
}

export function PreferenceForm({
  role,
  onSubmit,
}: {
  role: "a" | "b";
  onSubmit: (prefs: Preferences) => Promise<void>;
}) {
  const [moods, setMoods] = useState<Mood[]>([]);
  const [moodText, setMoodText] = useState("");
  const [languages, setLanguages] = useState<Lang[]>(["any"]);
  const [contentType, setContentType] = useState<ContentType>("all");
  const [minRating, setMinRating] = useState<6 | 7 | 8 | 9>(7);
  const [eras, setEras] = useState<Era[]>(["any"]);
  const [busy, setBusy] = useState(false);

  const ready = moods.length > 0 && languages.length > 0 && eras.length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await onSubmit({ moods, moodText, languages, contentType, minRating, eras });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-8 pb-40">
      <div className="animate-rise">
        <p className="text-[13px] font-semibold uppercase tracking-[0.13em] text-accent">
          {role === "a" ? "You're partner one" : "You're partner two"}
        </p>
        <h2 className="mt-2 text-[26px] font-semibold leading-tight">
          What are you in the mood for?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Answer honestly — they can&apos;t see any of this.
        </p>
      </div>

      <Field label="Mood" note="pick any">
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <Chip
              key={m.id}
              label={m.label}
              active={moods.includes(m.id)}
              onClick={() =>
                setMoods((c) => (c.includes(m.id) ? c.filter((x) => x !== m.id) : [...c, m.id]))
              }
            />
          ))}
        </div>
      </Field>

      <Field label="In your words" note="optional">
        <textarea
          value={moodText}
          onChange={(e) => setMoodText(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Describe what you're in the mood for tonight…"
          className="w-full resize-none text-[15px] leading-relaxed"
        />
        <p className="mt-2 text-xs leading-relaxed text-muted">
          This is the part that actually moves the needle — &ldquo;something stupid I can fall
          asleep to&rdquo; and &ldquo;light &amp; fun&rdquo; are not the same night.
        </p>
      </Field>

      <Field label="Language">
        <div className="flex flex-wrap gap-2">
          {LANGS.map((l) => (
            <Chip
              key={l.id}
              label={l.label}
              active={languages.includes(l.id)}
              onClick={() => setLanguages((c) => toggleWithAny(c, l.id, "any" as Lang))}
            />
          ))}
        </div>
      </Field>

      <Field label="What to include">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "movies", label: "Movies only" },
              { id: "all", label: "Include series" },
            ] as { id: ContentType; label: string }[]
          ).map((c) => (
            <button
              key={c.id}
              onClick={() => setContentType(c.id)}
              aria-pressed={contentType === c.id}
              className={`rounded-2xl border px-4 py-3.5 text-sm font-medium transition active:scale-[0.98] ${
                contentType === c.id
                  ? "border-accent bg-accent/15 text-white"
                  : "border-line bg-raised text-white/70"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Minimum rating">
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <div key={r} className="flex flex-col items-center">
              <button
                onClick={() => setMinRating(r)}
                aria-pressed={minRating === r}
                aria-describedby={r === 9 ? "rating-9-note" : undefined}
                className={`w-full rounded-2xl border py-3.5 text-[15px] font-semibold transition active:scale-[0.98] ${
                  minRating === r
                    ? "border-accent bg-accent/15 text-white"
                    : "border-line bg-raised text-white/70"
                }`}
              >
                {r}+
              </button>
              {r === 9 ? (
                <span
                  id="rating-9-note"
                  className={`mt-1.5 text-[10px] leading-tight ${
                    minRating === 9 ? "text-gold/90" : "text-muted"
                  }`}
                >
                  very few titles
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </Field>

      <Field label="Era">
        <div className="flex flex-wrap gap-2">
          {ERAS.map((e) => (
            <Chip
              key={e.id}
              label={e.label}
              hint={ERA_HINT[e.id]}
              active={eras.includes(e.id)}
              onClick={() => setEras((c) => toggleWithAny(c, e.id, "any" as Era))}
            />
          ))}
        </div>
      </Field>

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink via-ink/95 to-transparent px-5 pb-7 pt-8">
        <div className="mx-auto w-full max-w-md">
          <Button onClick={submit} disabled={!ready || busy} className="flex w-full items-center justify-center gap-2">
            {busy ? <Spinner /> : null}
            {busy ? "Locking it in" : ready ? "Lock it in" : "Pick at least one mood"}
          </Button>
        </div>
      </div>
    </div>
  );
}
