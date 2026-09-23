"use client";

const DEVICE_KEY = "tonight.device";
const PAIR_KEY = "tonight.pair";

function readOrCreate(key: string): string {
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    // Private mode with storage blocked: fall back to a per-tab identity.
    return crypto.randomUUID();
  }
}

/** Stable per-browser id. This is how the server knows which partner you are. */
export function deviceId(): string {
  return readOrCreate(DEVICE_KEY);
}

/** Stable per-couple id, so history survives across sessions. */
export function pairKey(): string | null {
  try {
    return localStorage.getItem(PAIR_KEY);
  } catch {
    return null;
  }
}

export function setPairKey(value: string) {
  try {
    localStorage.setItem(PAIR_KEY, value);
  } catch {
    /* nothing we can do, history just will not carry over */
  }
}

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: "Unexpected response." }));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({ error: "Unexpected response." }));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}
