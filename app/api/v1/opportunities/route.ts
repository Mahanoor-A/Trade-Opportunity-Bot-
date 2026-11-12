import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { generateNow, getDashboardRun } from "@/lib/opportunity-runs";
import { getWorkspaceAdvisorId } from "@/lib/workspace";

export const runtime = "nodejs";

function browserTimezone(request: Request): string | null {
  return new URL(request.url).searchParams.get("tz");
}

/** Today's opportunities. Generates the day's run on first open after the local generation hour if the scheduler has not. */
export async function GET(request: Request) {
  try {
    return NextResponse.json(await getDashboardRun(getWorkspaceAdvisorId(), browserTimezone(request)));
  } catch (error) {
    return jsonError(error);
  }
}

/** Regenerate now (manual refresh). */
export async function POST(request: Request) {
  try {
    const advisorId = getWorkspaceAdvisorId();
    await generateNow(advisorId, browserTimezone(request));
    return NextResponse.json(await getDashboardRun(advisorId, browserTimezone(request)), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
