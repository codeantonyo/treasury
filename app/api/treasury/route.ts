import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { ensureTreasury, feed } from "@/lib/treasury";

// GET /api/treasury[?before=<ms>&limit=<n>]: the signed-in member's in-app balances and movements.
// The member comes from the session cookie only, never from the request.
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const q = new URL(req.url).searchParams;
  const tr = await ensureTreasury(db, user.id);
  const movements = await feed(db, user.id, { before: Number(q.get("before")) || undefined, limit: Math.min(100, Number(q.get("limit")) || 30) });
  return Response.json({
    inApp: true, // in-app balances: not on-chain, not a bank account
    main: tr.main,
    cards: Object.values(tr.cards).filter((c) => c.status !== "closed"),
    defaultDestination: tr.defaultDestination,
    movements,
    next: movements.length ? movements[movements.length - 1].at : null,
  });
}
