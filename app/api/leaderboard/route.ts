import { NextRequest, NextResponse } from "next/server";
import { addEntry, getTopEntries } from "@/lib/leaderboardStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await getTopEntries(20);
  return NextResponse.json({ entries });
}

const NAME_MAX_LEN = 20;
const MAX_PLAUSIBLE_SCORE = 200_000;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { name, score } = body as { name?: unknown; score?: unknown };

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) {
    return NextResponse.json({ error: "score is invalid" }, { status: 400 });
  }

  const safeName = name.trim().slice(0, NAME_MAX_LEN).replace(/[<>]/g, "");
  const entries = await addEntry({
    name: safeName,
    score: Math.round(score),
    date: new Date().toISOString(),
  });

  return NextResponse.json({ entries: entries.slice(0, 20) });
}
