/**
 * Included GitHub AI Credits per plan (docs.github.com, checked 2026-10-12).
 * Individual plans: base credits + flex allotment. Business/Enterprise: per seat, pooled.
 */

export type Plan = "pro" | "pro-plus" | "max" | "business" | "enterprise";

export type PlanConfig = {
  label: string;
  includedCredits: number;
  pooled: boolean;
};

export const PLAN_CONFIGS: Record<Plan, PlanConfig> = {
  pro: { label: "Copilot Pro", includedCredits: 1_500, pooled: false },
  "pro-plus": { label: "Copilot Pro+", includedCredits: 7_000, pooled: false },
  max: { label: "Copilot Max", includedCredits: 20_000, pooled: false },
  business: { label: "Copilot Business", includedCredits: 1_900, pooled: true },
  enterprise: { label: "Copilot Enterprise", includedCredits: 3_900, pooled: true },
};

export const PLAN_NAMES = Object.keys(PLAN_CONFIGS) as Plan[];

export function parsePlan(value: string): Plan {
  const normalized = value.trim().toLowerCase();

  if (isPlan(normalized)) {
    return normalized;
  }

  throw new Error(`Unknown plan: ${value}. Supported plans: ${PLAN_NAMES.join(", ")}`);
}

export function isPlan(value: string): value is Plan {
  return Object.prototype.hasOwnProperty.call(PLAN_CONFIGS, value);
}

export function isPooledPlan(plan: Plan): boolean {
  return PLAN_CONFIGS[plan].pooled;
}
