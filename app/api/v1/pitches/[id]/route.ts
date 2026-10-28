import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/http";
import {
  applyPitchPatch,
  getPitch,
  updatePitch,
} from "@/lib/pitches";
import type { Card, SectionKey, TradeParameters } from "@/lib/types";
import { assertUuid, ApiInputError } from "@/lib/validation";
import { getWorkspaceAdvisorId } from "@/lib/workspace";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const advisorId = getWorkspaceAdvisorId();
    const { id } = await context.params;
    return NextResponse.json(await getPitch(id, advisorId));
  } catch (error) {
    return jsonError(error);
  }
}

function parsePatch(value: Record<string, unknown>): {
  parameters?: TradeParameters;
  sections?: Partial<Record<SectionKey, Card[]>>;
} {
  let parameters: TradeParameters | undefined;
  if (value.parameters !== undefined) {
    const candidate = value.parameters as Partial<TradeParameters> | null;
    if (!candidate || typeof candidate !== "object") {
      throw new ApiInputError("parameters must be an object");
    }
    const keys: (keyof TradeParameters)[] = [
      "currency_pair",
      "direction",
      "notional",
      "notional_currency",
      "maturity",
      "strike",
      "ki_barrier",
    ];
    for (const key of keys) {
      if (candidate[key] !== null && typeof candidate[key] !== "string") {
        throw new ApiInputError(`${key} must be a string or null`);
      }
    }
    const productInputs = candidate.product_inputs;
    if (
      productInputs !== undefined &&
      (!productInputs ||
        typeof productInputs !== "object" ||
        Array.isArray(productInputs) ||
        Object.values(productInputs).some((item) => item !== null && typeof item !== "string"))
    ) {
      throw new ApiInputError("product_inputs must contain string or null values");
    }
    parameters = {
      ...Object.fromEntries(keys.map((key) => [key, candidate[key] ?? null])),
      product_inputs: (productInputs as Record<string, string | null> | undefined) ?? {},
    } as TradeParameters;
  }

  let sections: Partial<Record<SectionKey, Card[]>> | undefined;
  if (value.sections !== undefined) {
    if (!value.sections || typeof value.sections !== "object" || Array.isArray(value.sections)) {
      throw new ApiInputError("sections must be an object");
    }
    sections = {};
    const valid = ["market_conditions", "client_why", "product_why"] as const;
    for (const [key, cards] of Object.entries(value.sections)) {
      if (!valid.includes(key as (typeof valid)[number]) || !Array.isArray(cards)) {
        throw new ApiInputError(`Invalid section ${key}`);
      }
      sections[key as SectionKey] = cards as Card[];
    }
  }
  return { parameters, sections };
}

export async function PATCH(request: Request, context: Context) {
  try {
    const advisorId = getWorkspaceAdvisorId();
    const { id } = await context.params;
    assertUuid(id);
    const current = await getPitch(id, advisorId);
    const patch = parsePatch(await readJson(request));
    const next = applyPitchPatch(current, patch.parameters, patch.sections);
    return NextResponse.json(await updatePitch(current, next, "edited"));
  } catch (error) {
    return jsonError(error);
  }
}
