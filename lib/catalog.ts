import catalogJson from "@/data/catalog.json";
import requirementsJson from "@/data/product_requireds.json";
import type { Product } from "@/lib/types";

export const catalog = catalogJson as Product[];

type Requirements = {
  rates: string[];
  target: boolean;
  barrier: boolean;
  lev: boolean;
};

const requirements = requirementsJson as Record<string, Requirements>;

export function findProduct(name: string | null | undefined): Product | null {
  if (!name) return null;
  return catalog.find((product) => product.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
}

export function getRequirements(productName: string): Requirements {
  const match = Object.entries(requirements).find(
    ([name]) => name.toLowerCase() === productName.toLowerCase(),
  );
  if (!match) throw new Error(`No Trade Builder input schema found for ${productName}`);
  return match[1];
}

export function buildRiskWarning(product: Product): string | null {
  const features = new Set(product.features.map((feature) => feature.toLowerCase()));
  const warnings: string[] = [];

  if (features.has("knock-in")) {
    warnings.push(
      "Knock-in feature: a triggering condition may change the payoff or create additional exposure. Confirm the exact barrier, observation rules, and settlement obligations in approved product terms.",
    );
  }
  if (features.has("knock-out")) {
    warnings.push(
      "Knock-out feature: reaching the contractual condition may end or change the payoff. Confirm the exact level, observation rules, and resulting obligations in approved product terms.",
    );
  }
  if (features.has("participating")) {
    warnings.push(
      "Participation feature: the amount of participation and any related limits depend on approved terms. Confirm the participation ratio, boundaries, and remaining currency exposure.",
    );
  }
  if (features.has("collar")) {
    warnings.push(
      "Collar feature: outcomes may be bounded by contractual rate levels. Confirm each boundary and its effect in approved product terms.",
    );
  }
  if (features.has("reset")) {
    warnings.push(
      "Reset feature: contractual rates or exposure may change at specified reset events. Confirm the reset schedule and calculation rules in approved product terms.",
    );
  }
  if (product.leveragedVariant || features.has("leverage")) {
    warnings.push(
      "Leverage feature: exposure may exceed the protected or contracted amount under the product terms. Confirm maximum exposure, settlement obligations, and adverse scenarios.",
    );
  }
  if (warnings.length === 0 && product.classification.toLowerCase() === "enhanced") {
    warnings.push(
      "Enhanced structure: outcomes depend on detailed terms and may include obligations beyond a plain forward. Review the payoff and adverse scenarios against approved product documentation.",
    );
  }
  if (warnings.length === 0 && product.classification.toLowerCase() === "protect") {
    warnings.push(
      "FX exposure remains: the contracted rate may be less favorable than the prevailing market rate at settlement. Review amount, maturity, and cancellation terms.",
    );
  }
  return warnings.length > 0 ? warnings.join(" ") : null;
}
