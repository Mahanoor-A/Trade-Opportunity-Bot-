import { ApiInputError } from "@/lib/validation";
import { listClients } from "@/lib/clients";
import { rankOpportunities } from "@/lib/opportunity-engine";
import { getMarketFacts } from "@/lib/opportunity-market";
import {
  getRecord,
  insertRecord,
  listAllRecords,
  listRecords,
  updateRecord,
} from "@/lib/record-store";
import type { OpportunityRun, OpportunitySettings } from "@/lib/opportunity-types";

const SETTINGS_ID = "default";
export const DEFAULT_GENERATION_HOUR = 8;

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date (YYYY-MM-DD) and hour (0-23) in the given IANA timezone. */
export function localNow(timezone: string, at = new Date()): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function defaults(timezone?: string | null): OpportunitySettings {
  const fallback = process.env.DEFAULT_TIMEZONE?.trim() || "UTC";
  return {
    timezone: timezone && isValidTimezone(timezone) ? timezone : isValidTimezone(fallback) ? fallback : "UTC",
    daily_count: 5,
    generation_hour: DEFAULT_GENERATION_HOUR,
  };
}

export function parseSettings(value: Record<string, unknown>): OpportunitySettings {
  const timezone = typeof value.timezone === "string" ? value.timezone.trim() : "";
  if (!timezone || !isValidTimezone(timezone)) throw new ApiInputError("Timezone must be a valid IANA name, e.g. Australia/Sydney");
  const count = Number(value.daily_count);
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new ApiInputError("Daily opportunity count must be 1 to 20");
  const hour = value.generation_hour === undefined ? DEFAULT_GENERATION_HOUR : Number(value.generation_hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new ApiInputError("Generation hour must be 0 to 23");
  return { timezone, daily_count: count, generation_hour: hour };
}

export async function getSettings(
  advisorId: string,
  browserTimezone?: string | null,
): Promise<{ settings: OpportunitySettings; saved: boolean }> {
  const record = await getRecord<OpportunitySettings>("settings", advisorId, SETTINGS_ID);
  return record ? { settings: record.payload, saved: true } : { settings: defaults(browserTimezone), saved: false };
}

export async function saveSettings(advisorId: string, settings: OpportunitySettings): Promise<OpportunitySettings> {
  const current = await getRecord<OpportunitySettings>("settings", advisorId, SETTINGS_ID);
  const saved = current
    ? await updateRecord("settings", current, settings, "edited")
    : await insertRecord("settings", advisorId, settings, SETTINGS_ID);
  return saved.payload;
}

export async function latestRun(advisorId: string): Promise<OpportunityRun | null> {
  const [record] = await listRecords<OpportunityRun>("runs", advisorId, 1);
  return record ? record.payload : null;
}

async function recentRuns(advisorId: string): Promise<OpportunityRun[]> {
  return (await listRecords<OpportunityRun>("runs", advisorId, 50)).map((record) => record.payload);
}

/** The daily (8am) list: scheduled, or generated on first open after the run hour. Manual refreshes never replace it. */
function dailyRunFrom(runs: OpportunityRun[]): OpportunityRun | null {
  return runs.find((run) => run.trigger !== "manual") ?? null;
}

export async function latestDailyRun(advisorId: string): Promise<OpportunityRun | null> {
  return dailyRunFrom(await recentRuns(advisorId));
}

export async function generateRun(
  advisorId: string,
  settings: OpportunitySettings,
  trigger: OpportunityRun["trigger"],
): Promise<OpportunityRun> {
  const clients = (await listClients(advisorId)).filter((client) => client.status === "active");
  const pairs = clients.flatMap((client) => client.exposures.map((exposure) => exposure.currency_pair));
  const { facts, warnings } = await getMarketFacts(pairs);
  const { date } = localNow(settings.timezone);
  const items = rankOpportunities(clients, facts, date, settings.daily_count);
  if (clients.length === 0) warnings.push("No active client profiles yet. Add clients with exposures on the Clients tab.");
  const id = crypto.randomUUID();
  const run: OpportunityRun = {
    id,
    advisor_id: advisorId,
    run_date: date,
    timezone: settings.timezone,
    trigger,
    generated_at: new Date().toISOString(),
    requested_count: settings.daily_count,
    items,
    market: Array.from(facts.values()),
    warnings,
  };
  await insertRecord("runs", advisorId, run, id);
  return run;
}

const inFlight = new Map<string, Promise<OpportunityRun>>();

function generateOnce(advisorId: string, settings: OpportunitySettings, trigger: OpportunityRun["trigger"]) {
  // Daily and manual runs are de-duplicated separately so a refresh never stands in for the 8am list.
  const key = `${advisorId}:${trigger === "manual" ? "manual" : "daily"}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = generateRun(advisorId, settings, trigger).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/** Due when the local run hour has passed and today's daily list does not exist yet (manual refreshes don't count). */
function isDue(settings: OpportunitySettings, latestDaily: OpportunityRun | null): boolean {
  const now = localNow(settings.timezone);
  return now.hour >= settings.generation_hour && latestDaily?.run_date !== now.date;
}

/**
 * Dashboard read. If today's local run time has passed and the scheduled job
 * has not produced a run yet (e.g. no cron configured locally), generate it now.
 */
export async function getDashboardRun(advisorId: string, browserTimezone?: string | null) {
  const { settings, saved } = await getSettings(advisorId, browserTimezone);
  const runs = await recentRuns(advisorId);
  let run = dailyRunFrom(runs);
  if (isDue(settings, run)) run = await generateOnce(advisorId, settings, "on_open");
  const now = localNow(settings.timezone);
  // Latest manual refresh made today after the daily list; shown alongside it, never instead of it.
  const refreshed =
    runs.find(
      (item) =>
        item.trigger === "manual" &&
        item.run_date === now.date &&
        (!run || run.run_date !== now.date || item.generated_at > run.generated_at),
    ) ?? null;
  return {
    settings,
    settings_saved: saved,
    local_date: now.date,
    run,
    refreshed_run: refreshed,
    is_today: run?.run_date === now.date,
  };
}

export async function generateNow(advisorId: string, browserTimezone?: string | null) {
  const { settings } = await getSettings(advisorId, browserTimezone);
  return generateOnce(advisorId, settings, "manual");
}

/** Called by the scheduler (e.g. every 15 minutes). Generates for each advisor whose local 8am has passed today. */
export async function runDueForAllAdvisors(): Promise<{ advisor_id: string; status: string }[]> {
  const results: { advisor_id: string; status: string }[] = [];
  for (const record of await listAllRecords<OpportunitySettings>("settings")) {
    const advisorId = record.advisor_id;
    try {
      if (!isDue(record.payload, await latestDailyRun(advisorId))) {
        results.push({ advisor_id: advisorId, status: "not_due" });
        continue;
      }
      const run = await generateOnce(advisorId, record.payload, "scheduled");
      results.push({ advisor_id: advisorId, status: `generated ${run.items.length}` });
    } catch (error) {
      console.error("Scheduled opportunity run failed", error);
      results.push({ advisor_id: advisorId, status: "failed" });
    }
  }
  return results;
}
