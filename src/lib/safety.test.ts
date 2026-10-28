import { describe, expect, it } from "vitest";
import { csvCell, isPushServiceUrl, safeRedirectTarget } from "./safety";
import { applyDiscount, packPrice, priceCart, slugProblem } from "./plans";

const O = "https://lastshot.app";

describe("safeRedirectTarget (audit: open redirect in /go)", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirectTarget("/signup", O).href).toBe(`${O}/signup`);
    expect(safeRedirectTarget("/dashboard/new?x=1", O).href).toBe(`${O}/dashboard/new?x=1`);
  });
  it("blocks other hosts however they're disguised", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/%09/evil.com", "https://evil.com", "/\n/evil.com", "javascript:alert(1)"]) {
      const t = safeRedirectTarget(bad, O);
      expect(t.origin).toBe(O);
    }
    expect(safeRedirectTarget(null, O).href).toBe(`${O}/`);
  });
});

describe("isPushServiceUrl (audit: SSRF via push endpoints)", () => {
  it("accepts real push services", () => {
    expect(isPushServiceUrl("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushServiceUrl("https://web.push.apple.com/QW1")).toBe(true);
    expect(isPushServiceUrl("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
  });
  it("rejects everything else", () => {
    for (const bad of [
      "https://evil.com/x",
      "http://fcm.googleapis.com/x",
      "https://fcm.googleapis.com.evil.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://169.254.169.254/latest",
      "https://user@fcm.googleapis.com/x",
      "not a url",
    ]) {
      expect(isPushServiceUrl(bad)).toBe(false);
    }
  });
});

describe("csvCell (audit: spreadsheet formula injection)", () => {
  it("neutralises formulas and quotes", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("a,b")).toBe('"a,b"');
  });
  it("leaves numbers and phone numbers alone", () => {
    expect(csvCell("+61412345678")).toBe("+61412345678");
    expect(csvCell(-12)).toBe("-12");
    expect(csvCell("49.00")).toBe("49.00");
    expect(csvCell(null)).toBe("");
  });
});

describe("pricing (audit: server-side totals)", () => {
  const free = { plan: "free" as const, extra_guests: 0, addon_frame: false, addon_branding: false, addon_storage: false, addon_storage_1y: false, addon_sms: false };
  it("prices a cart and applies a discount line by line", () => {
    const cart = priceCart(free, { plan: "party", seats: 0, addons: ["frame", "sms"] });
    expect(cart.total).toBe(9900 + 1900 + 1500);
    const d = applyDiscount(cart.lines, 15, "FRIEND-X");
    expect(d.total).toBe(cart.lines.reduce((n, l) => n + Math.round((l.cents * 85) / 100), 0));
    expect(d.discount).toBe(cart.total - d.total);
    expect(d.lines.every((l) => l.cents >= 50)).toBe(true);
  });
  it("ignores add-ons already owned and plans not above the current one", () => {
    const cart = priceCart({ ...free, plan: "big", addon_frame: true }, { plan: "party", seats: 0, addons: ["frame"] });
    expect(cart.total).toBe(0);
  });
  it("prices packs", () => {
    expect(packPrice("5", "party", false)).toBe(39600);
    expect(packPrice("school", "small", false)).toBe(89900);
  });
  it("rejects reserved and malformed short links", () => {
    expect(slugProblem("dashboard")).not.toBeNull();
    expect(slugProblem("a")).not.toBeNull();
    expect(slugProblem("sam-and-alex")).toBeNull();
  });
});
