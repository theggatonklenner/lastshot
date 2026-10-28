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
  { id: "free", name: "Free", price: 0, guests: 10, blurb: "Try it with a few friends." },
  { id: "small", name: "Small", price: 4900, guests: 50, blurb: "Dinners, birthdays and small parties." },
  { id: "party", name: "Party", price: 9900, guests: 100, blurb: "Bigger parties and celebrations." },
  { id: "big", name: "Big event", price: 17900, guests: 300, blurb: "Weddings, formals and big celebrations." },
  { id: "unlimited", name: "Unlimited", price: 29900, guests: null, blurb: "Festivals, schools and anything huge." },
];

/** Extra seats on top of a plan (not needed on Unlimited). The more you add, the less each costs. */
export const SEATS_MIN = 5;
export const SEATS_MAX = 500;
export const SEATS_STEP = 5;
export const SEAT_TIERS = [
  { from: 150, cents: 100 },
  { from: 50, cents: 150 },
  { from: 1, cents: 200 },
];

/** Price per seat (cents) for a purchase of `seats`. */
export function seatRate(seats: number) {
  return (SEAT_TIERS.find((t) => seats >= t.from) ?? SEAT_TIERS[SEAT_TIERS.length - 1]).cents;
}

/** Discount (whole percent) off the standard seat price for a purchase of `seats`. */
export function seatDiscount(seats: number) {
  const base = SEAT_TIERS[SEAT_TIERS.length - 1].cents;
  return Math.round((1 - seatRate(seats) / base) * 100);
}

/** Total price (cents) for `seats` extra seats. */
export function seatPrice(seats: number) {
  return seats * seatRate(seats);
}

export function validSeatCount(n: number) {
  return Number.isInteger(n) && n >= SEATS_MIN && n <= SEATS_MAX && n % SEATS_STEP === 0;
}

/** Guest limit for an event: plan plus extra seats. Mirrors public.event_guest_limit(). */
export function eventGuestLimit(e: { plan: Plan; extra_guests: number }): number | null {
  const base = planInfo(e.plan).guests;
  return base === null ? null : base + e.extra_guests;
}

export const PLAN_ORDER: Plan[] = ["free", "small", "party", "big", "unlimited"];

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
