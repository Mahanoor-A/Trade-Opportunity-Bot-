import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { ApiServiceError } from "@/lib/api-errors";

/**
 * Storage for the Trade Opportunity features (clients, settings, daily runs and
 * deal suggestions). Mirrors the pitch store: Neon when DATABASE_URL is set,
 * otherwise an ignored local JSON file. Every write is audited.
 */
export type RecordKind = "clients" | "settings" | "runs" | "deal_suggestions";

const TABLES: Record<RecordKind, string> = {
  clients: "public.ai_clients",
  settings: "public.ai_opportunity_settings",
  runs: "public.ai_opportunity_runs",
  deal_suggestions: "public.ai_deal_suggestions",
};

export type StoredRecord<T> = {
  id: string;
  advisor_id: string;
  payload: T;
  created_at: string;
  updated_at: string;
};

type AuditEntry = {
  kind: RecordKind;
  record_id: string;
  advisor_id: string;
  action: string;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
};

type LocalStore = {
  version: 1;
  records: Record<RecordKind, StoredRecord<unknown>[]>;
  audit: AuditEntry[];
};

const storePath = join(process.cwd(), ".local-data", "opportunities.json");
let queue: Promise<void> = Promise.resolve();
let neonClient: ReturnType<typeof neon> | null = null;

function useLocal(): boolean {
  return !process.env.DATABASE_URL?.trim();
}

function db() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("NEON_DATABASE_URL is not configured");
  if (!neonClient) neonClient = neon(connectionString);
  return neonClient;
}

async function runQuery(text: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  try {
    return (await db().query(text, params)) as Record<string, unknown>[];
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error("Neon opportunity storage request failed", code);
    throw new Error("Neon opportunity storage request failed");
  }
}

function toRecord<T>(row: Record<string, unknown>): StoredRecord<T> {
  return {
    id: String(row.id),
    advisor_id: String(row.advisor_id),
    payload: row.payload as T,
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

function emptyStore(): LocalStore {
  return {
    version: 1,
    records: { clients: [], settings: [], runs: [], deal_suggestions: [] },
    audit: [],
  };
}

async function readStore(): Promise<LocalStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as LocalStore;
    if (parsed?.version !== 1 || !parsed.records || !Array.isArray(parsed.audit)) {
      throw new Error("Local opportunity store has an unsupported format");
    }
    return { ...emptyStore(), ...parsed, records: { ...emptyStore().records, ...parsed.records } };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return emptyStore();
    }
    throw error;
  }
}

async function writeStore(store: LocalStore): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, storePath);
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

export async function listRecords<T>(
  kind: RecordKind,
  advisorId: string,
  limit = 500,
): Promise<StoredRecord<T>[]> {
  if (useLocal()) {
    return serialize(async () =>
      ((await readStore()).records[kind] as StoredRecord<T>[])
        .filter((record) => record.advisor_id === advisorId)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, limit),
    );
  }
  const rows = await runQuery(
    `SELECT id, advisor_id, payload, created_at, updated_at FROM ${TABLES[kind]}
     WHERE advisor_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [advisorId, limit],
  );
  return rows.map((row) => toRecord<T>(row));
}

/** Every advisor's records of one kind. Used only by the scheduled 8am job. */
export async function listAllRecords<T>(kind: RecordKind): Promise<StoredRecord<T>[]> {
  if (useLocal()) {
    return serialize(async () => (await readStore()).records[kind] as StoredRecord<T>[]);
  }
  const rows = await runQuery(
    `SELECT id, advisor_id, payload, created_at, updated_at FROM ${TABLES[kind]}`,
    [],
  );
  return rows.map((row) => toRecord<T>(row));
}

export async function getRecord<T>(
  kind: RecordKind,
  advisorId: string,
  id: string,
): Promise<StoredRecord<T> | null> {
  if (useLocal()) {
    return serialize(async () =>
      ((await readStore()).records[kind] as StoredRecord<T>[]).find(
        (record) => record.advisor_id === advisorId && record.id === id,
      ) ?? null,
    );
  }
  const rows = await runQuery(
    `SELECT id, advisor_id, payload, created_at, updated_at FROM ${TABLES[kind]}
     WHERE advisor_id = $1 AND id = $2 LIMIT 1`,
    [advisorId, id],
  );
  return rows[0] ? toRecord<T>(rows[0]) : null;
}

export async function insertRecord<T>(
  kind: RecordKind,
  advisorId: string,
  payload: T,
  id: string = randomUUID(),
): Promise<StoredRecord<T>> {
  if (useLocal()) {
    return serialize(async () => {
      const store = await readStore();
      if (store.records[kind].some((r) => r.advisor_id === advisorId && r.id === id)) {
        throw new ApiServiceError(409, "A record with this id already exists");
      }
      const now = new Date().toISOString();
      const record: StoredRecord<T> = { id, advisor_id: advisorId, payload, created_at: now, updated_at: now };
      store.records[kind].push(record as StoredRecord<unknown>);
      store.audit.push({ kind, record_id: id, advisor_id: advisorId, action: "created", before_state: null, after_state: payload, created_at: now });
      await writeStore(store);
      return record;
    });
  }
  const json = JSON.stringify(payload);
  const rows = await runQuery(
    `WITH created AS (
       INSERT INTO ${TABLES[kind]} (id, advisor_id, payload) VALUES ($1, $2, $3::jsonb)
       RETURNING *
     ), logged AS (
       INSERT INTO public.ai_opportunity_audit (kind, record_id, advisor_id, action, before_state, after_state)
       SELECT $4, id, advisor_id, 'created', NULL, $3::jsonb FROM created RETURNING record_id
     )
     SELECT created.id, created.advisor_id, created.payload, created.created_at, created.updated_at
     FROM created JOIN logged ON logged.record_id = created.id`,
    [id, advisorId, json, kind],
  );
  if (!rows[0]) throw new Error("Neon opportunity storage returned no created record");
  return toRecord<T>(rows[0]);
}

/** Optimistic update: fails with 409 if the record changed since `current` was read. */
export async function updateRecord<T>(
  kind: RecordKind,
  current: StoredRecord<T>,
  payload: T,
  action: string,
): Promise<StoredRecord<T>> {
  if (useLocal()) {
    return serialize(async () => {
      const store = await readStore();
      const list = store.records[kind] as StoredRecord<T>[];
      const index = list.findIndex(
        (r) => r.advisor_id === current.advisor_id && r.id === current.id && r.updated_at === current.updated_at,
      );
      if (index < 0) throw new ApiServiceError(409, "This record changed; reload it and retry");
      const now = new Date().toISOString();
      const updated: StoredRecord<T> = {
        ...list[index],
        payload,
        updated_at: now > current.updated_at ? now : new Date(Date.parse(current.updated_at) + 1).toISOString(),
      };
      list[index] = updated;
      store.audit.push({ kind, record_id: current.id, advisor_id: current.advisor_id, action, before_state: current.payload, after_state: payload, created_at: now });
      await writeStore(store);
      return updated;
    });
  }
  const rows = await runQuery(
    `WITH updated AS (
       UPDATE ${TABLES[kind]}
       SET payload = $4::jsonb,
           updated_at = GREATEST(date_trunc('milliseconds', now()), updated_at + interval '1 millisecond')
       WHERE advisor_id = $1 AND id = $2 AND updated_at = $3::timestamptz
       RETURNING *
     ), logged AS (
       INSERT INTO public.ai_opportunity_audit (kind, record_id, advisor_id, action, before_state, after_state)
       SELECT $5, id, advisor_id, $6, $7::jsonb, $4::jsonb FROM updated RETURNING record_id
     )
     SELECT updated.id, updated.advisor_id, updated.payload, updated.created_at, updated.updated_at
     FROM updated JOIN logged ON logged.record_id = updated.id`,
    [current.advisor_id, current.id, current.updated_at, JSON.stringify(payload), kind, action, JSON.stringify(current.payload)],
  );
  if (!rows[0]) throw new ApiServiceError(409, "This record changed; reload it and retry");
  return toRecord<T>(rows[0]);
}
