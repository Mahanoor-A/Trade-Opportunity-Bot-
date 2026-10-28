export type Product = {
  name: string;
  classification: string;
  family: string;
  sourceSheet: string;
  leveragedVariant: boolean;
  features: string[];
  regions: string[];
};

export type Card = {
  title: string;
  body: string;
};

export type TradeParameters = {
  currency_pair: string | null;
  direction: string | null;
  notional: string | null;
  notional_currency: string | null;
  maturity: string | null;
  strike: string | null;
  ki_barrier: string | null;
  product_inputs: Record<string, string | null>;
};

export type SpotQuote = {
  provider: "Twelve Data";
  symbol: string;
  price: string;
  quote_datetime: string | null;
  fetched_at: string;
};

export type MarketRate = {
  currency_pair: string;
  rate_type: string;
  rate: number;
  updated_at: string;
};

export type VolatilitySurfacePoint = {
  currency_pair: string;
  tenor: string;
  exp_date: string | null;
  maturity_date: string | null;
  atm: number | null;
  rr_25d: number | null;
  rr_10d: number | null;
  bf_25d: number | null;
  bf_10d: number | null;
  outright: number | null;
  points: number | null;
  spot: number | null;
  updated_at: string;
};

export type MarketSnapshot = {
  spot_quote: SpotQuote | null;
  interest_rates: MarketRate[];
  volatility_surface: VolatilitySurfacePoint[];
  fetched_at: string;
};

export type Pitch = {
  id: string;
  advisor_id: string;
  scenario: string;
  tags: {
    product_type: string;
    currency_pair: string | null;
    client_type: string | null;
  };
  product: Product;
  product_requirements: {
    rates: string[];
    target: boolean;
    barrier: boolean;
    lev: boolean;
  };
  parameters: TradeParameters;
  market_data: MarketSnapshot | null;
  sections: {
    market_conditions: Card[];
    client_why: Card[];
    product_why: Card[];
  };
  risk_warning: string | null;
  created_at: string;
  updated_at: string;
};

export type SectionKey = "market_conditions" | "client_why" | "product_why";
