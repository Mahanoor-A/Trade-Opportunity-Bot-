import { NextResponse } from "next/server";
import { buildPitchDraft } from "@/lib/openai";
import { jsonError, readJson } from "@/lib/http";
import { createPitch, listPitches } from "@/lib/pitches";
import { getWorkspaceAdvisorId } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  try {
    const advisorId = getWorkspaceAdvisorId();
    return NextResponse.json(await listPitches(advisorId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const advisorId = getWorkspaceAdvisorId();
    const body = await readJson(request);
    const scenario = typeof body.scenario === "string" ? body.scenario.trim() : "";
    if (!scenario || scenario.length > 4_000) {
      return NextResponse.json(
        { error: "bad_request", detail: "Scenario must contain 1–4,000 characters" },
        { status: 400 },
      );
    }
    const pitch = await createPitch(advisorId, await buildPitchDraft(scenario));
    return NextResponse.json(pitch, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
