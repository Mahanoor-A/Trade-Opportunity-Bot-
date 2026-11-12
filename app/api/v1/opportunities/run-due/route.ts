import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { runDueForAllAdvisors } from "@/lib/opportunity-runs";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Scheduler hook. Call every 15 minutes with `Authorization: Bearer $CRON_SECRET`;
 * it generates a run for each advisor whose local generation hour (8am by default) has passed today.
 */
export async function POST(request: Request) {
  try {
    if (!process.env.CRON_SECRET?.trim()) {
      return NextResponse.json({ error: "unavailable", detail: "CRON_SECRET is not configured" }, { status: 503 });
    }
    if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ results: await runDueForAllAdvisors() });
  } catch (error) {
    return jsonError(error);
  }
}
