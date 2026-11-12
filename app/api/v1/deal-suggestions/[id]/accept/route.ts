import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/http";
import { acceptDealSuggestion } from "@/lib/deal-builder";
import { getWorkspaceAdvisorId } from "@/lib/workspace";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Records the advisor's final bucket/product/variables and (by default) creates a Rationale Studio draft. */
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await acceptDealSuggestion(getWorkspaceAdvisorId(), id, await readJson(request)));
  } catch (error) {
    return jsonError(error);
  }
}
