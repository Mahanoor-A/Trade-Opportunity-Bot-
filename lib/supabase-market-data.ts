import { ApiServiceError } from "@/lib/api-errors";
import type { MarketRate, VolatilitySurfacePoint } from "@/lib/types";

type MarketRateRow = {
  currency_pair: string;
  rate_type: string;
  rate: number | string;
  updated_at: string;
};

type VolatilitySurfaceRow = {
  currency_pair: string;
  tenor: string;
  exp_date: string | null;
  maturity_date: string | null;
  atm: number | string | null;
  rr_25d: number | string | null;
  rr_10d: number | string | null;
  bf_25d: number | string | null;
  bf_10d: number | string | null;
  outright: number | string | null;
  points: number | string | null;
  spot: number | string | null;
  updated_at: string;
};

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_MARKET_DATA_URL?.trim();
  const key = process.env.SUPABASE_MARKET_DATA_KEY?.trim();
  if (!url && !key) return null;
  if (!url || !key) {
    throw new ApiServiceError(
      503,
      "Both Supabase market-data settings must be configured",
    );
  }
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".supabase.co")) {
      throw new Error("Invalid URL");
    }
  } catch {
    throw new ApiServiceError(503, "Supabase market-data project URL is invalid");
  }
  return { url: url.replace(/\/+$/, ""), key };
}

async function fetchRows<T>(
  table: "market_rates" | "vol_surface_points",
  select: string,
  currencyPair: string,
): Promise<T[]> {
  const config = getSupabaseConfig();
  if (!config) return [];

  const basePair = currencyPair.slice(0, 3);
  const quotePair = currencyPair.slice(3);
  const url = new URL(`${config.url}/rest/v1/${table}`);
  url.searchParams.set("select", select);
  url.searchParams.set(
    "currency_pair",
    `in.(${currencyPair},"${basePair}/${quotePair}")`,
  );
  url.searchParams.set("order", "updated_at.desc");
  url.searchParams.set("limit", "25");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch {
    throw new ApiServiceError(502, "Supabase market-data request could not be completed");
  }

  if (!response.ok) {
    console.error(`Supabase ${table} request failed with status`, response.status);
    if (response.status === 401 || response.status === 403) {
      throw new ApiServiceError(
        503,
        `Supabase does not allow this app to read ${table}; check its read-only access policy`,
      );
    }
    throw new ApiServiceError(502, `Supabase ${table} request failed`);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ApiServiceError(502, `Supabase ${table} returned an unreadable response`);
  }
  if (!Array.isArray(result)) {
    throw new ApiServiceError(502, `Supabase ${table} returned an invalid response`);
  }
  return result as T[];
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getSupabaseMarketData(currencyPair: string | null): Promise<{
  interestRates: MarketRate[];
  volatilitySurface: VolatilitySurfacePoint[];
}> {
  if (!currencyPair) return { interestRates: [], volatilitySurface: [] };
  if (!/^[A-Z]{6}$/.test(currencyPair)) {
    throw new ApiServiceError(400, "A valid currency pair is required for market data");
  }

  const [rates, surface] = await Promise.all([
    fetchRows<MarketRateRow>(
      "market_rates",
      "currency_pair,rate_type,rate,updated_at",
      currencyPair,
    ),
    fetchRows<VolatilitySurfaceRow>(
      "vol_surface_points",
      "currency_pair,tenor,exp_date,maturity_date,atm,rr_25d,rr_10d,bf_25d,bf_10d,outright,points,spot,updated_at",
      currencyPair,
    ),
  ]);

  return {
    interestRates: rates.map((row) => ({
      currency_pair: row.currency_pair,
      rate_type: row.rate_type,
      rate: Number(row.rate),
      updated_at: row.updated_at,
    })),
    volatilitySurface: surface.map((row) => ({
      currency_pair: row.currency_pair,
      tenor: row.tenor,
      exp_date: row.exp_date,
      maturity_date: row.maturity_date,
      atm: numberOrNull(row.atm),
      rr_25d: numberOrNull(row.rr_25d),
      rr_10d: numberOrNull(row.rr_10d),
      bf_25d: numberOrNull(row.bf_25d),
      bf_10d: numberOrNull(row.bf_10d),
      outright: numberOrNull(row.outright),
      points: numberOrNull(row.points),
      spot: numberOrNull(row.spot),
      updated_at: row.updated_at,
    })),
  };
}
