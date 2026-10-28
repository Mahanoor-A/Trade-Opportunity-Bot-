import { neon } from "@neondatabase/serverless";
import { assertUuid } from "@/lib/validation";
import {
  createLocalPitch,
  getLocalPitch,
  listLocalPitches,
  updateLocalPitch,
} from "@/lib/local-pitches";
import type {
  Card,
  MarketSnapshot,
  Pitch,
  SectionKey,
  SpotQuote,
  TradeParameters,
} from "@/lib/types";

type PitchRecord = {
  id: string;
  advisor_id: string;
  payload: Omit<Pitch, "id" | "advisor_id" | "created_at" | "updated_at">;
  created_at: string | Date;
  updated_at: string | Date;
};

let neonClient: ReturnType<typeof neon> | null = null;

function useLocalStore(): boolean {
  return !process.env.DATABASE_URL?.trim();
}

function getNeon() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("NEON_DATABASE_URL is not configured");
  }
  if (!neonClient) neonClient = neon(connectionString);
  return neonClient;
}

async function runNeonQuery<T>(execute: () => Promise<T>): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "unknown";
    console.error("Neon rationale storage request failed", code);
    throw new Error("Neon pitch storage request failed");
  }
}

function toPitch(row: PitchRecord): Pitch {
  return {
    id: row.id,
    advisor_id: row.advisor_id,
    ...row.payload,
    market_data: normalizeMarketData(row.payload.market_data),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function normalizeMarketData(value: unknown): MarketSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.provider === "Twelve Data" && typeof record.symbol === "string") {
    const spotQuote = record as unknown as SpotQuote;
    return {
      spot_quote: spotQuote,
      interest_rates: [],
      volatility_surface: [],
      fetched_at: spotQuote.fetched_at,
    };
  }
  if (!("spot_quote" in record)) return null;
  return {
    spot_quote: (record.spot_quote as SpotQuote | null) ?? null,
    interest_rates: Array.isArray(record.interest_rates) ? record.interest_rates : [],
    volatility_surface: Array.isArray(record.volatility_surface)
      ? record.volatility_surface
      : [],
    fetched_at:
      typeof record.fetched_at === "string"
        ? record.fetched_at
        : new Date().toISOString(),
  } as MarketSnapshot;
}

function asRecord(pitch: Pitch): PitchRecord["payload"] {
  return {
    scenario: pitch.scenario,
    tags: pitch.tags,
    product: pitch.product,
    product_requirements: pitch.product_requirements,
    parameters: pitch.parameters,
    market_data: pitch.market_data,
    sections: pitch.sections,
    risk_warning: pitch.risk_warning,
  };
}

export async function createPitch(
  advisorId: string,
  draft: Omit<Pitch, "id" | "advisor_id" | "created_at" | "updated_at">,
): Promise<Pitch> {
  if (useLocalStore()) return createLocalPitch(advisorId, draft);
  const rows = await runNeonQuery(() =>
    getNeon()`
      WITH created AS (
        INSERT INTO public.ai_rationale_pitches (advisor_id, payload)
        VALUES (${advisorId}, ${JSON.stringify(draft)}::jsonb)
        RETURNING *
      ),
      logged AS (
        INSERT INTO public.ai_rationale_pitch_audit
          (pitch_id, advisor_id, action, before_state, after_state)
        SELECT id, advisor_id, 'created', NULL, ${JSON.stringify(draft)}::jsonb
        FROM created
        RETURNING pitch_id
      )
      SELECT created.id::text AS id, created.advisor_id, created.payload,
             created.created_at, created.updated_at
      FROM created JOIN logged ON logged.pitch_id = created.id
    `,
  );
  const row = (rows as unknown as PitchRecord[])[0];
  if (!row) throw new Error("Neon pitch storage returned no created pitch");
  return toPitch(row);
}

export async function listPitches(advisorId: string): Promise<Pitch[]> {
  if (useLocalStore()) return listLocalPitches(advisorId);
  const pageSize = 500;
  const pitches: Pitch[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const rows = await runNeonQuery(() =>
      getNeon()`
        SELECT id::text AS id, advisor_id, payload, created_at, updated_at
        FROM public.ai_rationale_pitches
        WHERE advisor_id = ${advisorId}
        ORDER BY updated_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
    );
    const page = (rows as unknown as PitchRecord[]).map(toPitch);
    pitches.push(...page);
    if (page.length < pageSize) return pitches;
  }
}

export async function getPitch(id: string, advisorId: string): Promise<Pitch> {
  assertUuid(id);
  if (useLocalStore()) {
    const pitch = await getLocalPitch(id, advisorId);
    if (!pitch) throw new PitchNotFoundError();
    return pitch;
  }
  const rows = await runNeonQuery(() =>
    getNeon()`
      SELECT id::text AS id, advisor_id, payload, created_at, updated_at
      FROM public.ai_rationale_pitches
      WHERE id = ${id}::uuid AND advisor_id = ${advisorId}
      LIMIT 1
    `,
  );
  const row = (rows as unknown as PitchRecord[])[0];
  if (!row) throw new PitchNotFoundError();
  return toPitch(row);
}

export async function updatePitch(
  current: Pitch,
  next: Pitch,
  action: string,
): Promise<Pitch> {
  if (useLocalStore()) {
    const saved = await updateLocalPitch(current, next, action);
    if (!saved) throw new PitchConflictError();
    return saved;
  }
  const beforeState = JSON.stringify(asRecord(current));
  const afterState = JSON.stringify(asRecord(next));
  const rows = await runNeonQuery(() =>
    getNeon()`
      WITH updated AS (
        UPDATE public.ai_rationale_pitches
        SET payload = ${afterState}::jsonb,
            updated_at = GREATEST(
              date_trunc('milliseconds', now()),
              updated_at + interval '1 millisecond'
            )
        WHERE id = ${current.id}::uuid
          AND advisor_id = ${current.advisor_id}
          AND updated_at = ${current.updated_at}::timestamptz
        RETURNING *
      ),
      logged AS (
        INSERT INTO public.ai_rationale_pitch_audit
          (pitch_id, advisor_id, action, before_state, after_state)
        SELECT id, advisor_id, ${action}, ${beforeState}::jsonb, ${afterState}::jsonb
        FROM updated
        RETURNING pitch_id
      )
      SELECT updated.id::text AS id, updated.advisor_id, updated.payload,
             updated.created_at, updated.updated_at
      FROM updated JOIN logged ON logged.pitch_id = updated.id
    `,
  );
  const row = (rows as unknown as PitchRecord[])[0];
  if (!row) throw new PitchConflictError();
  return toPitch(row);
}

export function applyPitchPatch(
  pitch: Pitch,
  parameters: TradeParameters | undefined,
  sections: Partial<Record<SectionKey, Card[]>> | undefined,
): Pitch {
  const next: Pitch = {
    ...pitch,
    parameters: parameters
      ? {
          ...pitch.parameters,
          ...parameters,
          product_inputs:
            parameters.product_inputs ??
            pitch.parameters.product_inputs ??
            {},
        }
      : pitch.parameters,
    sections: { ...pitch.sections },
    tags: {
      ...pitch.tags,
      currency_pair: parameters ? parameters.currency_pair : pitch.tags.currency_pair,
    },
  };
  if (sections) {
    for (const [key, cards] of Object.entries(sections) as [SectionKey, Card[]][]) {
      validateCards(cards, true);
      next.sections[key] = cards;
    }
  }
  if (parameters) validateParameters(next.parameters, pitch.product_requirements);
  return next;
}

export function validateCards(cards: Card[], allowEmpty: boolean): void {
  if (!Array.isArray(cards) || cards.length > 3 || (!allowEmpty && cards.length !== 3)) {
    throw new PitchValidationError("Each section supports up to three cards");
  }
  for (const card of cards) {
    if (
      !card ||
      typeof card.title !== "string" ||
      typeof card.body !== "string" ||
      !card.title.trim() ||
      !card.body.trim() ||
      card.title.length > 120 ||
      card.body.length > 1_200
    ) {
      throw new PitchValidationError("Card title/body is empty or too long");
    }
  }
}

export function validateParameters(
  parameters: TradeParameters,
  requirements?: Pitch["product_requirements"],
): void {
  const pair = parameters.currency_pair;
  if (pair !== null && (typeof pair !== "string" || !/^[A-Z]{6}$/.test(pair))) {
    throw new PitchValidationError("Currency pair must contain six uppercase letters");
  }
  for (const [label, value] of [
    ["notional", parameters.notional],
    ["strike", parameters.strike],
    ["KI barrier", parameters.ki_barrier],
  ] as const) {
    if (value === null || value === "") continue;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      throw new PitchValidationError(`${label} must be a positive number`);
    }
  }
  for (const [label, value, max] of [
    ["direction", parameters.direction, 80],
    ["notional currency", parameters.notional_currency, 12],
    ["maturity", parameters.maturity, 80],
  ] as const) {
    if (value !== null && (typeof value !== "string" || !value.trim() || value.length > max)) {
      throw new PitchValidationError(`Invalid ${label}`);
    }
  }
  const allowedProductInputs = new Set([
    ...(requirements?.rates ?? []),
    ...(requirements?.target ? ["target"] : []),
    ...(requirements?.lev ? ["lev"] : []),
  ]);
  for (const [name, value] of Object.entries(parameters.product_inputs ?? {})) {
    if (!allowedProductInputs.has(name)) {
      throw new PitchValidationError(`Unsupported product input: ${name}`);
    }
    if (value !== null && (typeof value !== "string" || value.length > 80)) {
      throw new PitchValidationError(`Invalid product input: ${name}`);
    }
  }
}

export class PitchNotFoundError extends Error {}
export class PitchConflictError extends Error {}
export class PitchValidationError extends Error {}
