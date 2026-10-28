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

/** Percent off the new plan when moving up from a paid plan (and off 2-year storage when extending from 1 year). */
export const UPGRADE_DISCOUNT = 25;

function discounted(cents: number) {
  return Math.round((cents * (100 - UPGRADE_DISCOUNT)) / 100 / 100) * 100;
}

/**
 * What upgrading costs: the new plan's price, with the upgrade discount when
 * the event is already on a paid plan. From Free it's the full price.
 */
export function upgradePrice(from: Plan, to: Plan) {
  if (planRank(to) <= planRank(from)) return 0;
  const full = planInfo(to).price;
  return from === "free" ? full : discounted(full);
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
  {
    id: "link",
    name: "Custom link",
    blurb: "A short, easy link like lastshot.app/sam-and-alex for your signs and invites.",
    detail: "Choose the link after paying. The usual QR code keeps working too.",
  },
  {
    id: "export",
    name: "Guest data export",
    blurb: "Download a spreadsheet of guests, their photo counts, contacts who opted in, and answers to up to 3 questions you ask when they join.",
    detail: "Great for brand activations, venues and corporate events.",
  },
];

type AddonFlags = {
  addon_frame: boolean;
  addon_branding: boolean;
  addon_storage: boolean;
  addon_storage_1y?: boolean;
  addon_sms: boolean;
  addon_link?: boolean;
  addon_export?: boolean;
};

/**
 * Add-on price in AUD cents. SMS scales with the event's size. Extending
 * storage from 1 year to 2 years gets the upgrade discount.
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
      return e.addon_storage_1y ? discounted(1900) : 1900;
    case "sms":
      return e.plan === "unlimited" ? 5900 : e.plan === "big" ? 2900 : e.plan === "party" ? 1500 : 900;
    case "link":
      return 900;
    case "export":
      return 900;
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
    link: !!e.addon_link,
    export: !!e.addon_export,
  }[addon];
}

/** Short name for a payment line, e.g. "Party plan + Custom photo frame". */
export function paymentLabel(p: {
  kind: string;
  plan: Plan | null;
  addon: Addon | null;
  addons?: Addon[] | null;
  extra_guests: number;
  pack?: string | null;
  pack_plan?: Plan | null;
  pack_events?: number | null;
  pack_branding?: boolean;
}) {
  if (p.kind === "pack") {
    if (p.pack === "school") return "School pack";
    return `${p.pack_events ?? ""}-event pack (${planInfo(p.pack_plan ?? "small").name}${p.pack_branding ? ", with branding" : ""})`;
  }
  if (p.kind === "seats") return `${p.extra_guests} extra seats`;
  if (p.kind === "addon" && p.addon) return addonInfo(p.addon).name;
  if (p.kind === "bundle") {
    return [p.plan ? `${planInfo(p.plan).name} plan` : null, ...(p.addons ?? []).map((a) => addonInfo(a).name)]
      .filter(Boolean)
      .join(" + ");
  }
  return `${planInfo(p.plan ?? "free").name} plan`;
}

export type CartLine = { key: string; label: string; detail: string; cents: number };

/**
 * Prices an order against the event as it is now: the plan upgrade (new
 * plan's price, discounted if already on a paid plan), extra seats (tiered, not on Unlimited) and add-ons not already
 * owned. SMS is priced on the plan the event will have. Used by the order
 * summary in the browser and again on the server before charging.
 */
export function priceCart(
  e: { plan: Plan; extra_guests: number } & AddonFlags,
  order: { plan: Plan; seats: number; addons: Addon[] },
) {
  const plan = planRank(order.plan) > planRank(e.plan) ? order.plan : null;
  const finalPlan = plan ?? e.plan;
  const seats = finalPlan === "unlimited" || !validSeatCount(order.seats) ? 0 : order.seats;
  let addons = [...new Set(order.addons)].filter((a) => ADDONS.some((x) => x.id === a) && !hasAddon(e, a));
  if (addons.includes("storage")) addons = addons.filter((a) => a !== "storage1y");

  const lines: CartLine[] = [];
  if (plan) {
    lines.push({
      key: `plan:${plan}`,
      label: `${planInfo(plan).name} plan`,
      detail:
        e.plan === "free"
          ? `${guestLimitText(plan)}.`
          : `Upgrade from ${planInfo(e.plan).name}, ${UPGRADE_DISCOUNT}% off. ${guestLimitText(plan)}.`,
      cents: upgradePrice(e.plan, plan),
    });
  }
  if (seats) {
    const off = seatDiscount(seats);
    lines.push({
      key: "seats",
      label: `${seats} extra seats`,
      detail: off ? `${off}% bulk discount included.` : "Standard price.",
      cents: seatPrice(seats),
    });
  }
  for (const a of addons) {
    lines.push({
      key: `addon:${a}`,
      label: addonInfo(a).name,
      detail: addonInfo(a).blurb,
      cents: addonPrice(a, { plan: finalPlan, addon_storage_1y: e.addon_storage_1y }),
    });
  }
  return { plan, seats, addons, lines, total: lines.reduce((n, l) => n + l.cents, 0) };
}

export type OrderChoice = { plan: Plan; seats: number; addons: Addon[] };

/** Order as URL params, so a cancelled or abandoned checkout comes back with the same choices. */
export function orderToParams(o: OrderChoice) {
  const p = new URLSearchParams();
  p.set("o_plan", o.plan);
  if (o.seats) p.set("o_seats", String(o.seats));
  if (o.addons.length) p.set("o_addons", o.addons.join(","));
  return p;
}

export function orderFromParams(sp: Record<string, string | string[] | undefined>): OrderChoice | null {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const plan = one("o_plan");
  if (!plan || !PLAN_ORDER.includes(plan as Plan)) return null;
  const seats = Number(one("o_seats") ?? 0);
  const addons = (one("o_addons") ?? "")
    .split(",")
    .filter((a): a is Addon => ADDONS.some((x) => x.id === a));
  return { plan: plan as Plan, seats: validSeatCount(seats) ? seats : 0, addons };
}

/** Takes a percentage off every line (rounded to the cent), so Stripe shows the real price of each item. */
export function applyDiscount(lines: CartLine[], percent: number, code: string | null) {
  if (!percent) return { lines, discount: 0, total: lines.reduce((n, l) => n + l.cents, 0) };
  const out = lines.map((l) => {
    const cents = Math.round((l.cents * (100 - percent)) / 100);
    return { ...l, cents, detail: `${l.detail} ${percent}% off${code ? ` with ${code}` : ""}.`.trim() };
  });
  const before = lines.reduce((n, l) => n + l.cents, 0);
  const total = out.reduce((n, l) => n + l.cents, 0);
  return { lines: out, discount: before - total, total };
}

// ---------------------------------------------------------------------------
// Bulk packs: buy several events up front at a discount.
// ---------------------------------------------------------------------------

export type PackId = "5" | "10" | "school";
export const BRANDING_PRICE = 2900;

export const PACKS: { id: Exclude<PackId, "school">; events: number; percent: number }[] = [
  { id: "5", events: 5, percent: 20 },
  { id: "10", events: 10, percent: 30 },
];

export const SCHOOL_PACK = {
  id: "school" as const,
  events: 6,
  plan: "big" as const,
  branding: true,
  cents: 89900,
  blurb: "Six Big events (up to 300 guests each) with your school's logo on every one. Formals, sports days, camps, graduations and more.",
};

/** Price of a pack, rounded to the dollar. */
export function packPrice(pack: PackId, plan: Exclude<Plan, "free">, branding: boolean) {
  if (pack === "school") return SCHOOL_PACK.cents;
  const p = PACKS.find((x) => x.id === pack)!;
  const each = planInfo(plan).price + (branding ? BRANDING_PRICE : 0);
  return Math.round((each * p.events * (100 - p.percent)) / 100 / 100) * 100;
}

/** What the same events would cost bought one at a time. */
export function packValue(pack: PackId, plan: Exclude<Plan, "free">, branding: boolean) {
  if (pack === "school") return SCHOOL_PACK.events * (planInfo(SCHOOL_PACK.plan).price + BRANDING_PRICE);
  const p = PACKS.find((x) => x.id === pack)!;
  return p.events * (planInfo(plan).price + (branding ? BRANDING_PRICE : 0));
}

// ---------------------------------------------------------------------------
// Short links: lastshot.app/<slug> for venue pages and the Custom link add-on.
// ---------------------------------------------------------------------------

/** Top-level paths the app already uses, plus words kept back for later. */
const RESERVED_SLUGS = new Set([
  "admin", "api", "auth", "dashboard", "e", "go", "invite", "login", "signup", "forgot-password",
  "reset-password", "privacy", "terms", "try", "show", "pricing", "help", "support", "about", "blog",
  "venues", "venue", "partners", "partner", "school", "schools", "app", "www", "mail", "static",
  "lastshot", "billing", "account", "settings", "contact", "careers", "press", "legal", "status",
  "favicon", "manifest", "robots", "sitemap", "icon", "apple-icon", "new",
]);

export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;

export function normaliseSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** null when the slug is fine, otherwise the reason it can't be used. */
export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return "Use at least 3 letters or numbers.";
  if (slug.length > 40) return "Keep it to 40 characters or fewer.";
  if (!SLUG_PATTERN.test(slug)) return "Use letters, numbers and dashes only.";
  if (RESERVED_SLUGS.has(slug)) return "That link is reserved. Try another.";
  return null;
}
