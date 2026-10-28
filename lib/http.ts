import { NextResponse } from "next/server";
import { ApiInputError } from "@/lib/validation";
import { ApiServiceError } from "@/lib/api-errors";
import { PitchConflictError, PitchNotFoundError, PitchValidationError } from "@/lib/pitches";

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ApiServiceError) {
    return NextResponse.json(
      { error: "request_failed", detail: error.message },
      { status: error.status },
    );
  }
  if (error instanceof ApiInputError) {
    return NextResponse.json(
      { error: "bad_request", detail: error.message },
      { status: 400 },
    );
  }
  if (error instanceof PitchNotFoundError) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (error instanceof PitchConflictError) {
    return NextResponse.json(
      { error: "conflict", detail: "This pitch changed; reload it and retry" },
      { status: 409 },
    );
  }
  if (error instanceof PitchValidationError) {
    return NextResponse.json({ error: "bad_request", detail: error.message }, { status: 400 });
  }
  if (error instanceof Error && error.message.includes("NEON_")) {
    console.error("Neon pitch storage is not configured");
    return NextResponse.json(
      { error: "unavailable", detail: "Neon database is not configured" },
      { status: 503 },
    );
  }
  console.error("Rationale API request failed", error);
  return NextResponse.json(
    { error: "internal", detail: "The request could not be completed" },
    { status: 500 },
  );
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiInputError("Request body must be valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiInputError("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}
