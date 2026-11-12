import { NextResponse } from "next/server";
import { REGIONS } from "@/lib/clients";
import { catalogForBuilder } from "@/lib/deal-builder";

export const runtime = "nodejs";

/** Product catalog (with Trade Builder input schema) and regions, for the Clients and Deal Builder screens. */
export async function GET() {
  return NextResponse.json({ products: catalogForBuilder(), regions: REGIONS });
}
