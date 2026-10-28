import type { Addon, Plan } from "@/lib/database.types";

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

/** What a plan's guests would cost at the standard seat price. null for Unlimited. */
export function planValue(plan: Plan): number | null {
  const g = planInfo(plan).guests;
  return g === null ? null : g * SEAT_TIERS[SEAT_TIERS.length - 1].cents;
}

/** Saving against the standard seat price, in cents and whole percent. */
export function planSaving(plan: Plan): { cents: number; percent: number } | null {
  const value = planValue(plan);
  const price = planInfo(plan).price;
  if (value === null || price === 0 || value <= price) return null;
  return { cents: value - price, percent: Math.round((1 - price / value) * 100) };
}

export type AddonInfo = { id: Addon; name: string; blurb: string; detail: string };

export const ADDONS: AddonInfo[] = [
  {
    id: "frame",
    name: "Custom photo frame",
    blurb: "Your names and date on every photo, like a printed border.",
    detail: "Applies to photos taken after you add it.",
  },
  {
    id: "branding",
    name: "Your branding",
    blurb: "Your logo on the guest pages, signs and slideshow instead of Lastshot's.",
    detail: "Great for businesses, schools and venues.",
  },
  {
    id: "storage1y",
    name: "Keep photos for 1 year",
    blurb: "Photos stay for a year after the event instead of 180 days.",
    detail: "You'll still get a reminder before they're deleted.",
  },
  {
    id: "storage",
    name: "Keep photos for 2 years",
    blurb: "Photos stay for 2 years after the event instead of 180 days.",
    detail: "You'll still get a reminder before they're deleted.",
  },
  {
    id: "sms",
    name: "SMS alerts",
    blurb: "Guests can leave a mobile number and get a text when the photos are ready.",
    detail: "Price depends on your plan, because bigger events send more texts.",
  },
];

type AddonFlags = { addon_frame: boolean; addon_branding: boolean; addon_storage: boolean; addon_storage_1y?: boolean; addon_sms: boolean };

/**
 * Add-on price in AUD cents. SMS scales with the event's size. Moving from
 * 1 year to 2 years of storage costs the difference.
 */
export function addonPrice(addon: Addon, e: { plan: Plan; addon_storage_1y?: boolean }): number {
  switch (addon) {
    case "frame":
      return 1900;
    case "branding":
      return 2900;
    case "storage1y":
      return 1200;
    case "storage":
      return e.addon_storage_1y ? 1900 - 1200 : 1900;
    case "sms":
      return e.plan === "unlimited" ? 5900 : e.plan === "big" ? 2900 : e.plan === "party" ? 1500 : 900;
  }
}

export function addonInfo(addon: Addon) {
  return ADDONS.find((a) => a.id === addon)!;
}

export function hasAddon(e: AddonFlags, addon: Addon) {
  return {
    frame: e.addon_frame,
    branding: e.addon_branding,
    storage: e.addon_storage,
    // 2 years covers 1 year.
    storage1y: !!e.addon_storage_1y || e.addon_storage,
    sms: e.addon_sms,
  }[addon];
}

/** Short name for a payment line, e.g. "Party plan + Custom photo frame". */
export function paymentLabel(p: { kind: string; plan: Plan | null; addon: Addon | null; addons?: Addon[] | null; extra_guests: number }) {
  if (p.kind === "seats") return `${p.extra_guests} extra seats`;
  if (p.kind === "addon" && p.addon) return addonInfo(p.addon).name;
  if (p.kind === "bundle") {
    return [p.plan ? `${planInfo(p.plan).name} plan` : null, ...(p.addons ?? []).map((a) => addonInfo(a).name)]
      .filter(Boolean)
      .join(" + ");
  }
  return `${planInfo(p.plan ?? "free").name} plan`;
}
