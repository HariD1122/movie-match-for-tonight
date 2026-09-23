import QRCode from "qrcode";
import { fail } from "@/lib/db";
import { appUrl } from "@/lib/api";
import { loadSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * A real PNG, not a data URI, so the client can hand it straight to
 * navigator.share() as a File and drop it into WhatsApp.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const session = await loadSession(code);
    const target = `${appUrl(req)}/s/${session.code}`;

    const png = await QRCode.toBuffer(target, {
      errorCorrectionLevel: "M",
      type: "png",
      width: 720,
      margin: 3,
      color: { dark: "#08080BFF", light: "#FFFFFFFF" },
    });

    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="tonight-${session.code}.png"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
