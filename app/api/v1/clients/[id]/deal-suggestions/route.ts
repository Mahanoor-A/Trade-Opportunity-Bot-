import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/http";
import { createDealSuggestion } from "@/lib/deal-builder";
import { getWorkspaceAdvisorId } from "@/lib/workspace";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** AI Generate: recommended bucket plus a pre-filled deal for each of conservative / balanced / dynamic. */
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await readJson(request);
    const exposureId = typeof body.exposure_id === "string" && body.exposure_id ? body.exposure_id : null;
    return NextResponse.json(await createDealSuggestion(getWorkspaceAdvisorId(), id, exposureId), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
