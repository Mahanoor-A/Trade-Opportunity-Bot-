import type { MarketSnapshot } from "@/lib/types";
import { getSupabaseMarketData } from "@/lib/supabase-market-data";
import { getTwelveDataSpotQuote } from "@/lib/twelve-data";

export async function getMarketSnapshot(
  currencyPair: string | null,
): Promise<MarketSnapshot> {
  const [spotQuote, supabaseData] = await Promise.all([
    getTwelveDataSpotQuote(currencyPair),
    getSupabaseMarketData(currencyPair),
  ]);
  return {
    spot_quote: spotQuote,
    interest_rates: supabaseData.interestRates,
    volatility_surface: supabaseData.volatilitySurface,
    fetched_at: new Date().toISOString(),
  };
}
