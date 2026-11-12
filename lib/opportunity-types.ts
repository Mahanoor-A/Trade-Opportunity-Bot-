import type { TradeParameters } from "@/lib/types";

/** Product buckets offered in the AI Generate popup (mirrors the website's wording). */
export type RiskBucket = "conservative" | "balanced" | "dynamic";

export const RISK_BUCKETS: RiskBucket[] = ["conservative", "balanced", "dynamic"];

/** Catalog classification that each bucket draws its candidate products from. */
export const BUCKET_CLASSIFICATION: Record<RiskBucket, string> = {
  conservative: "Protect",
  balanced: "Participation",
  dynamic: "Enhanced",
};

export type ClientExposure = {
  id: string;
  label: string;
  /** Six-letter pair, e.g. AUDUSD. */
  currency_pair: string;
  /** The currency the client needs to buy (one of the two in the pair). */
  buy_currency: string;
  /** Total exposure amount for the horizon, as a plain decimal string. */
  amount: string;
  amount_currency: string;
  budget_rate: string | null;
  /** Amount already hedged against this exposure, same currency as amount. */
  hedged_amount: string | null;
  /** Average rate of the existing hedges, if known. Enables the "average higher" tactic box. */
  hedged_rate: string | null;
  horizon_months: number | null;
  /** Next payment/receipt date (YYYY-MM-DD), if known. */
  next_settlement_date: string | null;
  /** Amount due on the next settlement date (same currency as amount), if known. */
  next_settlement_amount: string | null;
};

export type HedgingPolicy = {
  min_cover_pct: number | null;
  max_cover_pct: number | null;
  max_tenor_months: number | null;
  notes: string;
};

export type ClientProfileInput = {
  name: string;
  kind: "client" | "prospect";
  status: "active" | "archived";
  contact: { name: string; email: string; phone: string };
  industry: string;
  region: string;
  risk_profile: RiskBucket;
  leverage_permitted: boolean;
  /** Canonical catalog names; empty means every catalog product the other rules allow. */
  permitted_products: string[];
  hedging_policy: HedgingPolicy;
  exposures: ClientExposure[];
  notes: string;
};

export type ClientProfile = ClientProfileInput & {
  id: string;
  advisor_id: string;
  created_at: string;
  updated_at: string;
};

export type ReasonKind =
  | "budget_rate"
  | "hedge_policy"
  | "market_range"
  | "settlement_due"
  | "average_rate"
  | "product_opportunity";

/** A factual "why" box. Calculated deterministically, never written by the AI. */
export type OpportunityReason = {
  kind: ReasonKind;
  exposure_id: string;
  title: string;
  detail: string;
  tone: "opportunity" | "risk" | "policy" | "product";
  score: number;
};

export type MarketFact = {
  currency_pair: string;
  spot: number;
  source: "Twelve Data" | "Supabase vol surface";
  as_of: string;
  week52_low: number | null;
  week52_high: number | null;
};

export type Opportunity = {
  client_id: string;
  client_name: string;
  exposure_id: string;
  exposure_label: string;
  currency_pair: string;
  score: number;
  reasons: OpportunityReason[];
  suggested_bucket: RiskBucket;
};

export type OpportunityRun = {
  id: string;
  advisor_id: string;
  /** Local calendar date in the user's timezone (YYYY-MM-DD). */
  run_date: string;
  timezone: string;
  trigger: "scheduled" | "on_open" | "manual";
  generated_at: string;
  requested_count: number;
  items: Opportunity[];
  market: MarketFact[];
  warnings: string[];
};

export type OpportunitySettings = {
  timezone: string;
  daily_count: number;
  generation_hour: number;
};

export type DealOption = {
  bucket: RiskBucket;
  product: string | null;
  rationale: string;
  candidates: string[];
  parameters: TradeParameters;
};

export type DealSuggestion = {
  id: string;
  advisor_id: string;
  client_id: string;
  exposure_id: string;
  recommended_bucket: RiskBucket;
  recommendation_reason: string;
  /** The bucket shown on the dashboard's product-opp box for this client. */
  dashboard_bucket: RiskBucket;
  /** Plain-English explanation of where the pre-filled notional and maturity came from. */
  prefill_basis: string;
  options: Record<RiskBucket, DealOption>;
  reasons: OpportunityReason[];
  market: MarketFact | null;
  notes: string[];
  /** Filled in when the user takes the deal forward: what they actually chose. */
  outcome: {
    chosen_bucket: RiskBucket;
    product: string;
    overrode_ai: boolean;
    parameters: TradeParameters;
    pitch_id: string | null;
    decided_at: string;
  } | null;
  created_at: string;
  updated_at: string;
};
