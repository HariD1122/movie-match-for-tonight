"use client";

import { useState } from "react";
import { Button, Spinner } from "./ui";

type Feedback = "idle" | "copied" | "sharing" | "downloaded" | "failed";

export function ShareStep({
  code,
  shareUrl,
  partnerJoined,
  partnerSubmitted,
}: {
  code: string;
  shareUrl: string;
  partnerJoined: boolean;
  partnerSubmitted: boolean;
}) {
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const qrUrl = `/api/session/${code}/qr`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setFeedback("copied");
      setTimeout(() => setFeedback("idle"), 1800);
    } catch {
      setFeedback("failed");
    }
  };

  /**
   * Hand the QR to WhatsApp (or anything else) as an actual image file.
   * Falls back to sharing the link, then to a plain download.
   */
  const shareImage = async () => {
    setFeedback("sharing");
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const file = new File([blob], `tonight-${code}.png`, { type: "image/png" });

      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };

      if (nav.canShare?.({ files: [file] })) {
        await nav.share({
          files: [file],
          title: "Tonight",
          text: `Scan this to pick what we watch. Or open ${shareUrl}`,
        });
        setFeedback("idle");
        return;
      }

      if (nav.share) {
        await nav.share({ title: "Tonight", text: "Pick what we watch tonight", url: shareUrl });
        setFeedback("idle");
        return;
      }

      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `tonight-${code}.png`;
      a.click();
      URL.revokeObjectURL(href);
      setFeedback("downloaded");
      setTimeout(() => setFeedback("idle"), 2200);
    } catch (err) {
      // A user dismissing the share sheet throws AbortError — not an error.
      if ((err as Error)?.name === "AbortError") setFeedback("idle");
      else setFeedback("failed");
    }
  };

  const status = partnerSubmitted
    ? "They're in. Building your deck…"
    : partnerJoined
    ? "They're filling in their side…"
    : "Waiting for them to scan…";

  return (
    <div className="flex flex-1 flex-col items-center pb-10 text-center animate-rise">
      <h2 className="mt-2 text-[26px] font-semibold leading-tight">Now get them in</h2>
      <p className="mt-2 max-w-[17rem] text-sm leading-relaxed text-muted">
        They scan this, answer their own questions, and the deck builds itself.
      </p>

      <div className="mt-8 rounded-[28px] bg-white p-4 shadow-2xl shadow-black/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrUrl}
          alt={`QR code linking to session ${code}`}
          width={232}
          height={232}
          className="h-[232px] w-[232px] rounded-xl"
        />
      </div>

      <p className="mt-5 text-[13px] uppercase tracking-[0.3em] text-muted">
        {code.split("").join(" ")}
      </p>

      <div className="mt-7 grid w-full grid-cols-2 gap-2.5">
        <Button variant="primary" onClick={shareImage} className="flex items-center justify-center gap-2">
          {feedback === "sharing" ? <Spinner /> : null}
          {feedback === "downloaded" ? "Saved" : "Send QR"}
        </Button>
        <Button variant="ghost" onClick={copyLink}>
          {feedback === "copied" ? "Link copied" : "Copy link"}
        </Button>
      </div>

      {feedback === "failed" ? (
        <p className="mt-3 text-xs text-no">
          Couldn&apos;t share automatically — copy the link instead.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted">Scanning not working? The link does the same thing.</p>
      )}

      <div className="mt-auto flex items-center gap-2.5 pt-10 text-sm text-muted">
        <Spinner className="text-accent" />
        {status}
      </div>
    </div>
  );
}
