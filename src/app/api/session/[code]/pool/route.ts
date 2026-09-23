import { fail, ok } from "@/lib/db";
import { ensurePool, loadSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Both clients call this the moment they see `building`. ensurePool takes a
 * database lock, so exactly one of them does the work.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    await ensurePool(code);
    const session = await loadSession(code);
    return ok({ status: session.status, round: session.round });
  } catch (err) {
    return fail(err);
  }
}
