import { NextRequest, NextResponse } from "next/server";
import { generateSection } from "@/lib/openai";
import { ApiServiceError } from "@/lib/api-errors";
import { jsonError, readJson } from "@/lib/http";
import { getPitch, updatePitch } from "@/lib/pitches";
import { getMarketSnapshot } from "@/lib/market-data";
import { assertUuid } from "@/lib/validation";
import type { SectionKey } from "@/lib/types";
import { getWorkspaceAdvisorId } from "@/lib/workspace";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; section: string }> };
const sections = new Set<SectionKey>(["market_conditions", "client_why", "product_why"]);

export async function POST(request: NextRequest, context: Context) {
  try {
    const advisorId = getWorkspaceAdvisorId();
    const { id, section: rawSection } = await context.params;
    assertUuid(id);
    if (!sections.has(rawSection as SectionKey)) {
      throw new ApiServiceError(400, "Section must be market_conditions, client_why, or product_why");
    }
    const body = await readJson(request);
    const steering = typeof body.steering === "string" ? body.steering.trim() : "";
    if (steering.length > 1_000) {
      throw new ApiServiceError(400, "Steering text must not exceed 1,000 characters");
    }
    const section = rawSection as SectionKey;
    const current = await getPitch(id, advisorId);
    const marketData =
      section === "market_conditions"
        ? await getMarketSnapshot(current.parameters.currency_pair)
        : current.market_data;
    const cards = await generateSection(current, section, steering, marketData);
    const next = {
      ...current,
      market_data: section === "market_conditions" ? marketData : current.market_data,
      sections: { ...current.sections, [section]: cards },
    };
    return NextResponse.json(
      await updatePitch(current, next, `regenerated_${section}`),
    );
  } catch (error) {
    return jsonError(error);
  }
}
