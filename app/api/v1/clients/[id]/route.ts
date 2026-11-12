import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/http";
import { getClient, parseClientInput, updateClient } from "@/lib/clients";
import { getWorkspaceAdvisorId } from "@/lib/workspace";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await getClient(getWorkspaceAdvisorId(), id));
  } catch (error) {
    return jsonError(error);
  }
}

/** Full replace of the profile. Send `updated_at` from the last read to avoid overwriting someone else's edit. */
export async function PUT(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await readJson(request);
    const expected = typeof body.updated_at === "string" ? body.updated_at : null;
    return NextResponse.json(
      await updateClient(getWorkspaceAdvisorId(), id, parseClientInput(body), expected),
    );
  } catch (error) {
    return jsonError(error);
  }
}
