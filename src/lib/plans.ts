import type { Plan } from "@/lib/database.types";

export type PlanInfo = {
  id: Plan;
  name: string;
  /** Price in AUD cents, paid once per event. */
  price: number;
  /** Camera limit. null means no limit. Keep in sync with public.plan_guest_limit(). */
  guests: number | null;
  blurb: string;
};

export const PLANS: PlanInfo[] = [
  { id: "free", name: "Free", price: 0, guests: 20, blurb: "Try it at a small get-together." },
  { id: "party", name: "Party", price: 4900, guests: 100, blurb: "Birthdays, dinners and most parties." },
  { id: "big", name: "Big event", price: 9900, guests: 300, blurb: "Weddings, formals and big celebrations." },
  { id: "unlimited", name: "Unlimited", price: 19900, guests: null, blurb: "Festivals, schools and anything huge." },
];

export const PLAN_ORDER: Plan[] = ["free", "party", "big", "unlimited"];

export function planInfo(plan: Plan): PlanInfo {
  return PLANS.find((p) => p.id === plan) ?? PLANS[0];
}

export function planRank(plan: Plan) {
  return PLAN_ORDER.indexOf(plan);
}

/** What upgrading costs: the difference from what the event already has. */
export function upgradePrice(from: Plan, to: Plan) {
  return Math.max(0, planInfo(to).price - planInfo(from).price);
}

export function formatPrice(cents: number) {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

export function guestLimitText(plan: Plan) {
  const g = planInfo(plan).guests;
  return g === null ? "No guest limit" : `Up to ${g} guests`;
}
