import {
  RISK_BUCKETS,
  type ClientExposure,
  type ClientProfile,
  type MarketFact,
  type Opportunity,
  type OpportunityReason,
  type RiskBucket,
} from "@/lib/opportunity-types";

/**
 * Deterministic "why" boxes. Every number shown comes from the client profile
 * or a sourced market observation, so the boxes are factual. The AI never
 * writes these; it only uses them later as context when pre-filling a deal.
 */

const SETTLEMENT_WINDOW_DAYS = 45;
export const POLICY_TOP_UP_TITLE = "Hedge policy top-up required";

/** Box labels as shown in the dashboard mock-up. */
export const PRODUCT_OPP_TITLE: Record<RiskBucket, string> = {
  conservative: "Protect product opp",
  balanced: "Balanced product opp",
  dynamic: "Dynamic product opp",
};

export function formatRate(value: number): string {
  return value >= 20 ? value.toFixed(2) : value.toFixed(4);
}

export function formatAmount(value: number, currency: string): string {
  return `${currency} ${Math.round(value).toLocaleString("en-US")}`;
}

/** True when a higher pair rate is better for the client (they sell the base currency). */
export function higherIsBetter(exposure: ClientExposure): boolean {
  return exposure.buy_currency === exposure.currency_pair.slice(3);
}

export function sellCurrency(exposure: ClientExposure): string {
  return higherIsBetter(exposure) ? exposure.currency_pair.slice(0, 3) : exposure.currency_pair.slice(3);
}

export function coverPct(exposure: ClientExposure): number | null {
  if (exposure.hedged_amount === null) return null;
  const amount = Number(exposure.amount);
  return amount > 0 ? (Number(exposure.hedged_amount) / amount) * 100 : null;
}

/** Amount still needed to reach the policy minimum (or max/100% if no minimum is set). */
export function coverGap(exposure: ClientExposure, client: ClientProfile): number {
  const amount = Number(exposure.amount);
  const hedged = Number(exposure.hedged_amount ?? 0);
  const policy = client.hedging_policy;
  const target = policy.min_cover_pct ?? policy.max_cover_pct ?? 100;
  let gap = (amount * target) / 100 - hedged;
  if (gap <= 0 && policy.max_cover_pct !== null) gap = (amount * policy.max_cover_pct) / 100 - hedged;
  return Math.max(0, gap);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

function budgetReason(exposure: ClientExposure, fact: MarketFact): OpportunityReason | null {
  if (exposure.budget_rate === null) return null;
  const budget = Number(exposure.budget_rate);
  if (!(budget > 0)) return null;
  const diffPct = ((fact.spot - budget) / budget) * 100;
  const favourable = higherIsBetter(exposure) ? diffPct > 0 : diffPct < 0;
  const position = fact.spot >= budget ? "above" : "below";
  const sign = diffPct >= 0 ? "+" : "";
  return {
    kind: "budget_rate",
    exposure_id: exposure.id,
    title: `${exposure.currency_pair} ${position} budget rate`,
    detail:
      `Spot ${formatRate(fact.spot)} (${fact.source}) vs budget ${formatRate(budget)} (${sign}${diffPct.toFixed(2)}%). ` +
      (favourable
        ? "The market is better than budget, so there is a chance to secure cover at or better than budget."
        : "The market is worse than budget, so unhedged amounts are exposed to further adverse moves."),
    tone: favourable ? "opportunity" : "risk",
    score: 30 + Math.min(25, Math.abs(diffPct) * 8),
  };
}

function policyReason(exposure: ClientExposure, client: ClientProfile): OpportunityReason | null {
  const cover = coverPct(exposure);
  if (cover === null) return null;
  const { min_cover_pct: min, max_cover_pct: max } = client.hedging_policy;
  if (min !== null && cover < min) {
    const gap = coverGap(exposure, client);
    return {
      kind: "hedge_policy",
      exposure_id: exposure.id,
      title: POLICY_TOP_UP_TITLE,
      detail: `Cover is ${cover.toFixed(0)}% against a policy minimum of ${min}%. ${formatAmount(gap, exposure.amount_currency)} is needed to reach policy.`,
      tone: "policy",
      score: 40 + Math.min(30, (min - cover) / 2),
    };
  }
  if (max !== null && cover > max) {
    return {
      kind: "hedge_policy",
      exposure_id: exposure.id,
      title: "Above hedge policy maximum",
      detail: `Cover is ${cover.toFixed(0)}% against a policy maximum of ${max}%. Review whether existing cover should be restructured.`,
      tone: "policy",
      score: 30,
    };
  }
  return null;
}

function rangeReason(exposure: ClientExposure, fact: MarketFact): OpportunityReason | null {
  const { week52_low: low, week52_high: high } = fact;
  if (low === null || high === null || high <= low) return null;
  const position = (fact.spot - low) / (high - low);
  if (position > 0.2 && position < 0.8) return null;
  const nearHigh = position >= 0.8;
  const favourable = nearHigh === higherIsBetter(exposure);
  const range = `52-week range ${formatRate(low)} to ${formatRate(high)}`;
  return {
    kind: "market_range",
    exposure_id: exposure.id,
    title: `Spot near 52-week ${nearHigh ? "high" : "low"}`,
    detail: favourable
      ? `Spot ${formatRate(fact.spot)} sits in the ${nearHigh ? "top" : "bottom"} ${Math.round((nearHigh ? 1 - position : position) * 100)}% of its ${range}. That is a historically favourable level for this exposure.`
      : `Spot ${formatRate(fact.spot)} sits in the ${nearHigh ? "top" : "bottom"} ${Math.round((nearHigh ? 1 - position : position) * 100)}% of its ${range}. That is a historically weak level for this exposure, so protection may be the conversation.`,
    tone: favourable ? "opportunity" : "risk",
    score: favourable ? 35 : 25,
  };
}

/** Hedge portfolio tactic: adding cover at today's better-than-existing rate improves the blended hedge rate. */
function averageRateReason(exposure: ClientExposure, client: ClientProfile, fact: MarketFact): OpportunityReason | null {
  if (exposure.hedged_rate === null || exposure.hedged_amount === null) return null;
  const hedged = Number(exposure.hedged_amount);
  const hedgedRate = Number(exposure.hedged_rate);
  if (!(hedged > 0) || !(hedgedRate > 0)) return null;
  const better = higherIsBetter(exposure) ? fact.spot > hedgedRate : fact.spot < hedgedRate;
  if (!better) return null;
  const topUp = coverGap(exposure, client);
  if (!(topUp > 0)) return null;
  const blended = (hedged * hedgedRate + topUp * fact.spot) / (hedged + topUp);
  const direction = higherIsBetter(exposure) ? "higher" : "lower";
  const improvement = Math.abs((fact.spot - hedgedRate) / hedgedRate) * 100;
  return {
    kind: "average_rate",
    exposure_id: exposure.id,
    title: `Average hedge rate ${direction}`,
    detail:
      `Existing cover of ${formatAmount(hedged, exposure.amount_currency)} averages ${formatRate(hedgedRate)}; spot is ${formatRate(fact.spot)}. ` +
      `Adding ${formatAmount(topUp, exposure.amount_currency)} at around spot would move the blended hedge rate ${direction} to about ${formatRate(blended)} (indicative, before pricing).`,
    tone: "opportunity",
    score: 30 + Math.min(20, improvement * 6),
  };
}

function settlementReason(exposure: ClientExposure, today: string): OpportunityReason | null {
  if (!exposure.next_settlement_date) return null;
  const days = daysBetween(today, exposure.next_settlement_date);
  if (days < 0 || days > SETTLEMENT_WINDOW_DAYS) return null;
  const cover = coverPct(exposure);
  if (cover !== null && cover >= 100) return null;
  const uncovered = Number(exposure.amount) - Number(exposure.hedged_amount ?? 0);
  return {
    kind: "settlement_due",
    exposure_id: exposure.id,
    title: days === 0 ? "Settlement due today" : `Settlement due in ${days} day${days === 1 ? "" : "s"}`,
    detail: `${exposure.label}: next settlement ${exposure.next_settlement_date}. ${
      exposure.hedged_amount === null ? "No hedged amount is recorded." : `${formatAmount(uncovered, exposure.amount_currency)} is uncovered.`
    }`,
    tone: "risk",
    score: 35 + (SETTLEMENT_WINDOW_DAYS - days) / 1.5,
  };
}

export function reasonsForExposure(
  client: ClientProfile,
  exposure: ClientExposure,
  fact: MarketFact | undefined,
  today: string,
): OpportunityReason[] {
  const reasons = [
    fact ? budgetReason(exposure, fact) : null,
    policyReason(exposure, client),
    fact ? rangeReason(exposure, fact) : null,
    fact ? averageRateReason(exposure, client, fact) : null,
    settlementReason(exposure, today),
  ].filter((reason): reason is OpportunityReason => reason !== null);
  return reasons.sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * Baseline bucket: the client's own risk profile, stepped one level more
 * conservative when the situation is urgent (imminent settlement, or a rate
 * worse than budget while below the policy minimum).
 */
export function suggestBucket(client: ClientProfile, reasons: OpportunityReason[]): RiskBucket {
  const urgentSettlement = reasons.some((r) => r.kind === "settlement_due" && r.score >= 45);
  const adverseAndUnder =
    reasons.some((r) => r.kind === "budget_rate" && r.tone === "risk") &&
    reasons.some((r) => r.kind === "hedge_policy" && r.title === POLICY_TOP_UP_TITLE);
  const index = RISK_BUCKETS.indexOf(client.risk_profile);
  return urgentSettlement || adverseAndUnder ? RISK_BUCKETS[Math.max(0, index - 1)] : client.risk_profile;
}

const BUCKET_WHY: Record<RiskBucket, string> = {
  conservative: "protection-first products (Protect classification) such as forwards, vanillas and collars",
  balanced: "products that protect while leaving room to participate (Participation classification)",
  dynamic: "enhanced structures with conditional terms (Enhanced classification)",
};

/** The "product opp" box from the mock-up: which product bucket fits, and why. */
export function productOpportunityBox(client: ClientProfile, exposureId: string, reasons: OpportunityReason[], bucket: RiskBucket): OpportunityReason {
  const stepped = bucket !== client.risk_profile;
  return {
    kind: "product_opportunity",
    exposure_id: exposureId,
    title: PRODUCT_OPP_TITLE[bucket],
    detail:
      `Suggested starting bucket: ${bucket}, meaning ${BUCKET_WHY[bucket]}. ` +
      (stepped
        ? `The client's profile is ${client.risk_profile}, stepped down because the situation is urgent (${reasons.map((r) => r.title.toLowerCase()).join("; ")}).`
        : `This matches the client's ${client.risk_profile} risk profile.`) +
      " The AI Generate popup lets you choose a different bucket.",
    tone: "product",
    score: 0,
  };
}

export function rankOpportunities(
  clients: ClientProfile[],
  facts: Map<string, MarketFact>,
  today: string,
  count: number,
): Opportunity[] {
  const opportunities: Opportunity[] = [];
  for (const client of clients) {
    if (client.status !== "active") continue;
    let best: Opportunity | null = null;
    for (const exposure of client.exposures) {
      const reasons = reasonsForExposure(client, exposure, facts.get(exposure.currency_pair), today);
      if (reasons.length === 0) continue;
      const score = reasons.reduce((sum, reason) => sum + reason.score, 0);
      if (!best || score > best.score) {
        const bucket = suggestBucket(client, reasons);
        best = {
          client_id: client.id,
          client_name: client.name,
          exposure_id: exposure.id,
          exposure_label: exposure.label,
          currency_pair: exposure.currency_pair,
          score: Math.round(score),
          // Up to 3 boxes: the two strongest factual reasons plus the product-opportunity box.
          reasons: [
            ...reasons.slice(0, 2).map((reason) => ({ ...reason, score: Math.round(reason.score) })),
            productOpportunityBox(client, exposure.id, reasons, bucket),
          ],
          suggested_bucket: bucket,
        };
      }
    }
    if (best) opportunities.push(best);
  }
  return opportunities.sort((a, b) => b.score - a.score).slice(0, count);
}
