import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/http";
import { createClient, listClients, parseClientInput } from "@/lib/clients";
import { getWorkspaceAdvisorId } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await listClients(getWorkspaceAdvisorId()));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const advisorId = getWorkspaceAdvisorId();
    const input = parseClientInput(await readJson(request));
    return NextResponse.json(await createClient(advisorId, input), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
