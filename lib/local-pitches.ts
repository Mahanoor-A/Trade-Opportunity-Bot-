import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Pitch } from "@/lib/types";

type AuditEntry = {
  pitch_id: string;
  advisor_id: string;
  action: string;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
};

type LocalStore = {
  version: 1;
  pitches: Pitch[];
  audit: AuditEntry[];
};

const storePath = join(process.cwd(), ".local-data", "pitches.json");
let operationQueue: Promise<void> = Promise.resolve();

function emptyStore(): LocalStore {
  return { version: 1, pitches: [], audit: [] };
}

async function readStore(): Promise<LocalStore> {
  try {
    const contents = await readFile(storePath, "utf8");
    const parsed: unknown = JSON.parse(contents);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("pitches" in parsed) ||
      !Array.isArray(parsed.pitches) ||
      !("audit" in parsed) ||
      !Array.isArray(parsed.audit)
    ) {
      throw new Error("Local pitch store has an unsupported format");
    }
    return parsed as LocalStore;
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

async function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation);
  operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function appendAudit(
  store: LocalStore,
  pitch: Pitch,
  action: string,
  beforeState: unknown,
): void {
  store.audit.push({
    pitch_id: pitch.id,
    advisor_id: pitch.advisor_id,
    action,
    before_state: beforeState,
    after_state: pitch,
    created_at: new Date().toISOString(),
  });
}

export async function createLocalPitch(
  advisorId: string,
  draft: Omit<Pitch, "id" | "advisor_id" | "created_at" | "updated_at">,
): Promise<Pitch> {
  return serialize(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const pitch: Pitch = {
      ...draft,
      id: randomUUID(),
      advisor_id: advisorId,
      created_at: now,
      updated_at: now,
    };
    store.pitches.push(pitch);
    appendAudit(store, pitch, "created", null);
    await writeStore(store);
    return pitch;
  });
}

export async function listLocalPitches(advisorId: string): Promise<Pitch[]> {
  return serialize(async () =>
    (await readStore()).pitches
      .filter((pitch) => pitch.advisor_id === advisorId)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
  );
}

export async function getLocalPitch(id: string, advisorId: string): Promise<Pitch | null> {
  return serialize(async () =>
    (await readStore()).pitches.find(
      (pitch) => pitch.id === id && pitch.advisor_id === advisorId,
    ) ?? null,
  );
}

export async function updateLocalPitch(
  current: Pitch,
  next: Pitch,
  action: string,
): Promise<Pitch | null> {
  return serialize(async () => {
    const store = await readStore();
    const index = store.pitches.findIndex(
      (pitch) =>
        pitch.id === current.id &&
        pitch.advisor_id === current.advisor_id &&
        pitch.updated_at === current.updated_at,
    );
    if (index < 0) return null;
    const updated: Pitch = { ...next, updated_at: new Date().toISOString() };
    store.pitches[index] = updated;
    appendAudit(store, updated, action, current);
    await writeStore(store);
    return updated;
  });
}
