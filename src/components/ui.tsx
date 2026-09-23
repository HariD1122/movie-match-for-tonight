"use client";

import type { ReactNode } from "react";

export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 ${className}`}>
      {children}
    </main>
  );
}

export function Wordmark({ sub }: { sub?: string }) {
  return (
    <header className="pt-8 pb-6">
      <h1 className="text-[15px] font-semibold tracking-[0.22em] text-white/90">TONIGHT</h1>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </header>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "quiet";
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent/90 active:scale-[0.98] shadow-lg shadow-accent/20",
    ghost: "border border-line bg-raised text-white hover:border-white/25 active:scale-[0.98]",
    quiet: "text-muted hover:text-white",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl px-5 py-4 text-[15px] font-semibold transition disabled:opacity-40
                  disabled:active:scale-100 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  label,
  active,
  onClick,
  hint,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-2.5 text-sm font-medium transition active:scale-[0.97] ${
        active
          ? "border-accent bg-accent/15 text-white"
          : "border-line bg-raised text-white/70 hover:border-white/20"
      }`}
    >
      {label}
      {hint ? <span className="ml-1.5 text-[11px] font-normal text-muted">{hint}</span> : null}
    </button>
  );
}

export function Field({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <section className="animate-rise">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.13em] text-white/50">
          {label}
        </h2>
        {note ? <span className="text-[11px] text-muted">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Waiting({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-24 text-center animate-rise">
      <Spinner className="text-accent" />
      <div>
        <p className="text-lg font-semibold">{title}</p>
        <p className="mt-1.5 max-w-[16rem] text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-no/30 bg-no/10 px-4 py-3.5 text-sm text-white/90">
      <p>{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-2 text-sm font-semibold text-accent underline">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Rating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-gold">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
        <path d="m12 17.3-6.2 3.7 1.7-7L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.5 4.8 1.7 7z" />
      </svg>
      <span className="text-sm font-semibold tabular-nums text-white">{value.toFixed(1)}</span>
    </span>
  );
}
