import { describe, expect, it } from "vitest";
import { formatPhone, normalisePhone } from "./phone";

describe("normalisePhone", () => {
  it("accepts Australian mobiles in common formats", () => {
    expect(normalisePhone("0412 345 678")).toBe("+61412345678");
    expect(normalisePhone("+61 412 345 678")).toBe("+61412345678");
    expect(normalisePhone("61412345678")).toBe("+61412345678");
    expect(normalisePhone("(04) 1234-5678")).toBe("+61412345678");
  });
  it("accepts international numbers with a country code", () => {
    expect(normalisePhone("+64 21 123 4567")).toBe("+64211234567");
    expect(normalisePhone("0044 7911 123456")).toBe("+447911123456");
  });
  it("rejects landlines, short numbers and junk", () => {
    expect(normalisePhone("02 9999 9999")).toBeNull();
    expect(normalisePhone("+61 2 9999 9999")).toBeNull();
    expect(normalisePhone("0412")).toBeNull();
    expect(normalisePhone("hello")).toBeNull();
  });
  it("formats Australian mobiles for display", () => {
    expect(formatPhone("+61412345678")).toBe("0412 345 678");
    expect(formatPhone("+447911123456")).toBe("+447911123456");
  });
});
