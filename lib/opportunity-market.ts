import { getSupabaseMarketData } from "@/lib/supabase-market-data";
import type { MarketFact } from "@/lib/opportunity-types";

type TwelveDataQuote = {
  close?: string;
  datetime?: string;
  status?: string;
  fifty_two_week?: { low?: string; high?: string };
};

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fromTwelveData(pair: string): Promise<MarketFact | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) return null;
  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", `${pair.slice(0, 3)}/${pair.slice(3)}`);
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Twelve Data returned HTTP ${response.status}`);
  const quote = (await response.json()) as TwelveDataQuote;
  if (quote.status === "error") throw new Error("Twelve Data could not quote this pair");
  const spot = finite(quote.close);
  if (spot === null) throw new Error("Twelve Data returned an invalid quote");
  return {
    currency_pair: pair,
    spot,
    source: "Twelve Data",
    as_of: quote.datetime ?? new Date().toISOString(),
    week52_low: finite(quote.fifty_two_week?.low),
    week52_high: finite(quote.fifty_two_week?.high),
  };
}

async function fromSupabase(pair: string): Promise<MarketFact | null> {
  const { volatilitySurface } = await getSupabaseMarketData(pair);
  const point = volatilitySurface.find((row) => row.spot !== null && row.spot > 0);
  if (!point || point.spot === null) return null;
  return {
    currency_pair: pair,
    spot: point.spot,
    source: "Supabase vol surface",
    as_of: point.updated_at,
    week52_low: null,
    week52_high: null,
  };
}

/**
 * Spot (and 52-week range when available) for each pair. Twelve Data first,
 * then the spot column of the Supabase vol surface. A pair that cannot be
 * priced is reported in `warnings` and its rate-based reasons are skipped.
 */
export async function getMarketFacts(
  pairs: string[],
): Promise<{ facts: Map<string, MarketFact>; warnings: string[] }> {
  const facts = new Map<string, MarketFact>();
  const warnings: string[] = [];
  for (const pair of Array.from(new Set(pairs))) {
    let fact: MarketFact | null = null;
    let problem = "";
    try {
      fact = await fromTwelveData(pair);
    } catch (error) {
      problem = error instanceof Error ? error.message : "Twelve Data request failed";
    }
    if (!fact) {
      try {
        fact = await fromSupabase(pair);
      } catch (error) {
        problem ||= error instanceof Error ? error.message : "Supabase request failed";
      }
    }
    if (fact) facts.set(pair, fact);
    else warnings.push(`${pair}: no live rate available${problem ? ` (${problem})` : ""}; rate-based reasons skipped.`);
  }
  return { facts, warnings };
}
