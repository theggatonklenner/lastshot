import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { PLANS, formatPrice, planInfo, planSaving, planValue, seatDiscount, seatPrice, seatRate, upgradePrice, validSeatCount } from "./plans";
import { bonusPending, bonusUnlocked, shotLimit } from "./rules";
import { verifyStripeSignature } from "./server/stripe";

describe("plans", () => {
  it("matches the guest limits in public.plan_guest_limit()", () => {
    expect(PLANS.map((p) => [p.id, p.guests])).toEqual([
      ["free", 10],
      ["small", 50],
      ["party", 100],
      ["big", 300],
      ["unlimited", null],
    ]);
  });
  it("charges full price from Free and 25% off when moving up from a paid plan", () => {
    expect(upgradePrice("free", "small")).toBe(4900);
    expect(upgradePrice("party", "big")).toBe(13400);
    expect(upgradePrice("small", "unlimited")).toBe(22400);
    expect(upgradePrice("big", "party")).toBe(0);
  });
  it("formats prices", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(29900)).toBe("$299");
    expect(formatPrice(4950)).toBe("$49.50");
    expect(planInfo("big").name).toBe("Big event");
  });
});

describe("extra seats", () => {
  it("gets cheaper per seat as you add more", () => {
    expect(seatPrice(5)).toBe(1000);
    expect(seatPrice(45)).toBe(9000);
    expect(seatPrice(50)).toBe(7500);
    expect(seatPrice(150)).toBe(15000);
    expect(seatRate(500)).toBe(100);
    expect([seatDiscount(5), seatDiscount(50), seatDiscount(150)]).toEqual([0, 25, 50]);
  });
  it("only accepts slider values", () => {
    expect(validSeatCount(5)).toBe(true);
    expect(validSeatCount(7)).toBe(false);
    expect(validSeatCount(0)).toBe(false);
    expect(validSeatCount(505)).toBe(false);
  });
});

describe("plan value", () => {
  it("compares plans with $2 seats", () => {
    expect(planValue("party")).toBe(20000);
    expect(planSaving("big")).toEqual({ cents: 42100, percent: 70 });
    expect(planSaving("free")).toBeNull();
    expect(planValue("unlimited")).toBeNull();
  });
});

describe("bonus shots", () => {
  const base = { photos_per_guest: 10, bonus_shots: 5, bonus_at: "2026-10-28T11:00:00Z" };
  it("adds bonus shots only after the unlock time", () => {
    expect(shotLimit(base, new Date("2026-10-28T10:59:00Z"))).toBe(10);
    expect(shotLimit(base, new Date("2026-10-28T11:00:00Z"))).toBe(15);
    expect(bonusPending(base, new Date("2026-10-28T10:00:00Z"))).toBe(true);
    expect(bonusUnlocked(base, new Date("2026-10-28T12:00:00Z"))).toBe(true);
  });
  it("ignores bonus settings with no shots", () => {
    expect(shotLimit({ ...base, bonus_shots: 0 }, new Date("2030-01-01"))).toBe(10);
  });
});

describe("stripe webhook signature", () => {
  const secret = "whsec_test";
  const payload = '{"id":"evt_1"}';
  const sign = (t: number, body = payload) => createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  it("accepts a valid recent signature", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(payload, `t=${t},v1=${sign(t)}`, secret)).toBe(true);
  });
  it("rejects a tampered body, old timestamp or missing header", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature('{"id":"evt_2"}', `t=${t},v1=${sign(t)}`, secret)).toBe(false);
    expect(verifyStripeSignature(payload, `t=${t - 1000},v1=${sign(t - 1000)}`, secret)).toBe(false);
    expect(verifyStripeSignature(payload, null, secret)).toBe(false);
  });
});

describe("add-ons", () => {
  it("prices SMS by event size", async () => {
    const { addonPrice } = await import("./plans");
    expect(addonPrice("sms", { plan: "free" })).toBe(900);
    expect(addonPrice("sms", { plan: "party" })).toBe(1500);
    expect(addonPrice("sms", { plan: "unlimited" })).toBe(5900);
    expect(addonPrice("frame", { plan: "big" })).toBe(1900);
  });
});

describe("mystery shot", () => {
  it("uses the organiser's challenge or a stable random one per guest", async () => {
    const { mysteryPromptFor, MYSTERY_PROMPTS } = await import("./mystery");
    expect(mysteryPromptFor("Find a hat", "g1")).toBe("Find a hat");
    const a = mysteryPromptFor(null, "guest-abc");
    expect(MYSTERY_PROMPTS).toContain(a);
    expect(mysteryPromptFor("", "guest-abc")).toBe(a);
  });
  it("adds one shot once unlocked", async () => {
    const { shotLimit } = await import("./rules");
    const e = { photos_per_guest: 10, bonus_shots: 0, bonus_at: null, mystery_at: "2026-10-28T10:00:00Z" };
    expect(shotLimit(e, new Date("2026-10-28T09:59:00Z"))).toBe(10);
    expect(shotLimit(e, new Date("2026-10-28T10:00:00Z"))).toBe(11);
  });
});
