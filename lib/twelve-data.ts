import { ApiServiceError } from "@/lib/api-errors";
import type { SpotQuote } from "@/lib/types";

type TwelveDataQuote = {
  close?: string;
  datetime?: string;
  status?: string;
  code?: number | string;
  message?: string;
};

export async function getTwelveDataSpotQuote(
  currencyPair: string | null,
): Promise<SpotQuote | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey || !currencyPair) return null;
  if (!/^[A-Z]{6}$/.test(currencyPair)) {
    throw new ApiServiceError(400, "A valid currency pair is required for a market quote");
  }

  const symbol = `${currencyPair.slice(0, 3)}/${currencyPair.slice(3)}`;
  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new ApiServiceError(502, "Twelve Data market quote request could not be completed");
  }

  if (!response.ok) {
    console.error("Twelve Data quote request failed with status", response.status);
    throw new ApiServiceError(502, `Twelve Data market quote returned HTTP ${response.status}`);
  }

  let result: TwelveDataQuote;
  try {
    result = (await response.json()) as TwelveDataQuote;
  } catch {
    throw new ApiServiceError(502, "Twelve Data returned an unreadable quote response");
  }
  if (result.status === "error") {
    const code = Number(result.code);
    console.error("Twelve Data quote request returned a provider error", code ?? "unknown");
    if (code === 401 || code === 403) {
      throw new ApiServiceError(503, "Twelve Data rejected the API key; check TWELVE_DATA_API_KEY");
    }
    if (code === 429) {
      throw new ApiServiceError(503, "Twelve Data request limit reached; try again later");
    }
    throw new ApiServiceError(502, "Twelve Data could not provide a quote for this currency pair");
  }
  const price = Number(result.close);
  if (!Number.isFinite(price) || price <= 0) {
    throw new ApiServiceError(502, "Twelve Data returned an invalid spot quote");
  }

  return {
    provider: "Twelve Data",
    symbol,
    price: String(price),
    quote_datetime: result.datetime ?? null,
    fetched_at: new Date().toISOString(),
  };
}
