import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/http";
import { getSettings, parseSettings, saveSettings } from "@/lib/opportunity-runs";
import { getWorkspaceAdvisorId } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const tz = new URL(request.url).searchParams.get("tz");
    return NextResponse.json(await getSettings(getWorkspaceAdvisorId(), tz));
  } catch (error) {
    return jsonError(error);
  }
}

/** { timezone, daily_count, generation_hour? } — generation_hour defaults to 8. */
export async function PUT(request: Request) {
  try {
    const settings = parseSettings(await readJson(request));
    return NextResponse.json({ settings: await saveSettings(getWorkspaceAdvisorId(), settings), saved: true });
  } catch (error) {
    return jsonError(error);
  }
}
