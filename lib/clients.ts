import { randomUUID } from "node:crypto";
import { catalog, findProduct } from "@/lib/catalog";
import { ApiServiceError } from "@/lib/api-errors";
import { ApiInputError } from "@/lib/validation";
import { getRecord, insertRecord, listRecords, updateRecord, type StoredRecord } from "@/lib/record-store";
import {
  RISK_BUCKETS,
  type ClientExposure,
  type ClientProfile,
  type ClientProfileInput,
  type RiskBucket,
} from "@/lib/opportunity-types";

export const REGIONS = Array.from(new Set(catalog.flatMap((product) => product.regions))).sort();

function text(value: unknown, label: string, max: number, required = false): string {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new ApiInputError(`${label} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new ApiInputError(`${label} is required`);
  if (trimmed.length > max) throw new ApiInputError(`${label} must not exceed ${max} characters`);
  return trimmed;
}

function positiveDecimal(value: unknown, label: string, allowNull: boolean): string | null {
  if (value === undefined || value === null || value === "") {
    if (allowNull) return null;
    throw new ApiInputError(`${label} is required`);
  }
  const parsed = Number(String(value).replaceAll(",", "").trim());
  if (!Number.isFinite(parsed) || parsed < 0) throw new ApiInputError(`${label} must be a positive number`);
  return String(parsed);
}

function percent(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new ApiInputError(`${label} must be between 0 and 100`);
  }
  return parsed;
}

function months(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 120) {
    throw new ApiInputError(`${label} must be a whole number of months between 1 and 120`);
  }
  return parsed;
}

function parseExposure(value: unknown, index: number): ClientExposure {
  if (!value || typeof value !== "object") throw new ApiInputError(`Exposure ${index + 1} is invalid`);
  const raw = value as Record<string, unknown>;
  const label = `Exposure ${index + 1}`;
  const pair = text(raw.currency_pair, `${label} currency pair`, 7, true).toUpperCase().replace("/", "");
  if (!/^[A-Z]{6}$/.test(pair)) throw new ApiInputError(`${label} currency pair must look like AUDUSD`);
  const buy = text(raw.buy_currency, `${label} buy currency`, 3, true).toUpperCase();
  if (buy !== pair.slice(0, 3) && buy !== pair.slice(3)) {
    throw new ApiInputError(`${label} buy currency must be one of ${pair.slice(0, 3)} or ${pair.slice(3)}`);
  }
  const amountCurrency = text(raw.amount_currency, `${label} amount currency`, 3, true).toUpperCase();
  if (!/^[A-Z]{3}$/.test(amountCurrency)) throw new ApiInputError(`${label} amount currency must be a 3-letter code`);
  const amount = positiveDecimal(raw.amount, `${label} amount`, false) as string;
  const hedged = positiveDecimal(raw.hedged_amount, `${label} hedged amount`, true);
  if (hedged !== null && Number(hedged) > Number(amount) * 2) {
    throw new ApiInputError(`${label} hedged amount looks too large for the exposure`);
  }
  const date = raw.next_settlement_date ? text(raw.next_settlement_date, `${label} settlement date`, 10) : "";
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) {
    throw new ApiInputError(`${label} settlement date must be YYYY-MM-DD`);
  }
  const settlementAmount = positiveDecimal(raw.next_settlement_amount, `${label} next settlement amount`, true);
  if (settlementAmount !== null && Number(settlementAmount) > Number(amount)) {
    throw new ApiInputError(`${label} next settlement amount cannot exceed the total exposure amount`);
  }
  const id = typeof raw.id === "string" && /^[A-Za-z0-9-]{1,64}$/.test(raw.id) ? raw.id : randomUUID();
  return {
    id,
    label: text(raw.label, `${label} description`, 120) || `${buy} ${buy === pair.slice(0, 3) ? "buy" : "payable"}`,
    currency_pair: pair,
    buy_currency: buy,
    amount,
    amount_currency: amountCurrency,
    budget_rate: positiveDecimal(raw.budget_rate, `${label} budget rate`, true),
    hedged_amount: hedged,
    hedged_rate: positiveDecimal(raw.hedged_rate, `${label} average hedged rate`, true),
    horizon_months: months(raw.horizon_months, `${label} horizon`),
    next_settlement_date: date || null,
    next_settlement_amount: settlementAmount,
  };
}

export function parseClientInput(value: Record<string, unknown>): ClientProfileInput {
  const contact = (value.contact ?? {}) as Record<string, unknown>;
  const policy = (value.hedging_policy ?? {}) as Record<string, unknown>;
  const kind = value.kind === "prospect" ? "prospect" : "client";
  const status = value.status === "archived" ? "archived" : "active";
  const risk = (value.risk_profile ?? "balanced") as RiskBucket;
  if (!RISK_BUCKETS.includes(risk)) throw new ApiInputError("Risk profile must be conservative, balanced or dynamic");
  const region = text(value.region, "Region", 60);
  if (region && !REGIONS.includes(region)) throw new ApiInputError(`Region must be one of ${REGIONS.join(", ")}`);
  const email = text(contact.email, "Contact email", 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiInputError("Contact email is invalid");

  const productsRaw = Array.isArray(value.permitted_products) ? value.permitted_products : [];
  const permitted = productsRaw.map((name) => {
    const product = findProduct(typeof name === "string" ? name : null);
    if (!product) throw new ApiInputError(`Unknown product: ${String(name)}`);
    return product.name;
  });

  const minCover = percent(policy.min_cover_pct, "Minimum hedge cover");
  const maxCover = percent(policy.max_cover_pct, "Maximum hedge cover");
  if (minCover !== null && maxCover !== null && minCover > maxCover) {
    throw new ApiInputError("Minimum hedge cover cannot exceed the maximum");
  }

  const exposuresRaw = Array.isArray(value.exposures) ? value.exposures : [];
  if (exposuresRaw.length > 20) throw new ApiInputError("A client supports up to 20 exposures");

  return {
    name: text(value.name, "Client name", 160, true),
    kind,
    status,
    contact: {
      name: text(contact.name, "Contact name", 160),
      email,
      phone: text(contact.phone, "Contact phone", 40),
    },
    industry: text(value.industry, "Industry", 120),
    region,
    risk_profile: risk,
    leverage_permitted: value.leverage_permitted === true,
    permitted_products: Array.from(new Set(permitted)),
    hedging_policy: {
      min_cover_pct: minCover,
      max_cover_pct: maxCover,
      max_tenor_months: months(policy.max_tenor_months, "Maximum hedge tenor"),
      notes: text(policy.notes, "Hedging policy notes", 2_000),
    },
    exposures: exposuresRaw.map(parseExposure),
    notes: text(value.notes, "Notes", 4_000),
  };
}

function toClient(record: StoredRecord<ClientProfileInput>): ClientProfile {
  return {
    ...record.payload,
    id: record.id,
    advisor_id: record.advisor_id,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export async function listClients(advisorId: string): Promise<ClientProfile[]> {
  const records = await listRecords<ClientProfileInput>("clients", advisorId, 2_000);
  return records.map(toClient).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClientRecord(advisorId: string, id: string): Promise<StoredRecord<ClientProfileInput>> {
  const record = await getRecord<ClientProfileInput>("clients", advisorId, id);
  if (!record) throw new ApiServiceError(404, "Client not found");
  return record;
}

export async function getClient(advisorId: string, id: string): Promise<ClientProfile> {
  return toClient(await getClientRecord(advisorId, id));
}

export async function createClient(advisorId: string, input: ClientProfileInput): Promise<ClientProfile> {
  return toClient(await insertRecord("clients", advisorId, input));
}

export async function updateClient(
  advisorId: string,
  id: string,
  input: ClientProfileInput,
  expectedUpdatedAt: string | null,
): Promise<ClientProfile> {
  const current = await getClientRecord(advisorId, id);
  if (expectedUpdatedAt && expectedUpdatedAt !== current.updated_at) {
    throw new ApiServiceError(409, "This client changed since you opened it; reload and retry");
  }
  return toClient(await updateRecord("clients", current, input, "edited"));
}
