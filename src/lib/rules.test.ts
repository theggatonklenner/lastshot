import { describe, expect, it } from "vitest";
import { acceptingSubmissions, counterText, galleryAccess, galleryRevealed, readyForEmail, remainingShots } from "./rules";

const base = {
  status: "active" as const,
  reveal_mode: "live" as const,
  reveal_at: null,
  revealed_at: null,
  gallery_visibility: "guests" as const,
  submissions_closed_at: null,
};

describe("galleryRevealed", () => {
  it("live is always revealed", () => {
    expect(galleryRevealed(base)).toBe(true);
  });
  it("scheduled reveals at the configured time", () => {
    const e = { ...base, reveal_mode: "scheduled" as const, reveal_at: "2026-11-01T10:00:00Z" };
    expect(galleryRevealed(e, new Date("2026-11-01T09:59:59Z"))).toBe(false);
    expect(galleryRevealed(e, new Date("2026-11-01T10:00:00Z"))).toBe(true);
  });
  it("scheduled without a time stays hidden", () => {
    expect(galleryRevealed({ ...base, reveal_mode: "scheduled" })).toBe(false);
  });
  it("manual needs the organiser to reveal", () => {
    expect(galleryRevealed({ ...base, reveal_mode: "manual" })).toBe(false);
    expect(galleryRevealed({ ...base, reveal_mode: "manual", revealed_at: "2026-01-01T00:00:00Z" })).toBe(true);
  });
});

describe("galleryAccess", () => {
  const guest = { isOwner: false, isGuest: true };
  const stranger = { isOwner: false, isGuest: false };
  const owner = { isOwner: true, isGuest: false };

  it("owner always has access, even before reveal or when private", () => {
    expect(galleryAccess({ ...base, reveal_mode: "manual", gallery_visibility: "private" }, owner)).toEqual({ allowed: true });
  });
  it("guests-only galleries need a joined guest", () => {
    expect(galleryAccess(base, stranger)).toMatchObject({ allowed: false, reason: "join_required" });
    expect(galleryAccess(base, guest)).toEqual({ allowed: true });
  });
  it("public galleries are open to anyone after reveal", () => {
    expect(galleryAccess({ ...base, gallery_visibility: "public" }, stranger)).toEqual({ allowed: true });
  });
  it("private galleries block guests", () => {
    expect(galleryAccess({ ...base, gallery_visibility: "private" }, guest)).toMatchObject({ reason: "private" });
  });
  it("hidden until reveal, with the reveal time for scheduled events", () => {
    const e = { ...base, reveal_mode: "scheduled" as const, reveal_at: "2030-01-01T00:00:00Z" };
    expect(galleryAccess(e, guest, new Date("2029-12-31T00:00:00Z"))).toEqual({
      allowed: false,
      reason: "not_revealed",
      revealAt: "2030-01-01T00:00:00Z",
    });
  });
  it("drafts are unavailable to non-owners", () => {
    expect(galleryAccess({ ...base, status: "draft" }, guest)).toMatchObject({ reason: "unavailable" });
  });
});

describe("acceptingSubmissions", () => {
  it("only published or active events without a pause", () => {
    expect(acceptingSubmissions({ status: "published", submissions_closed_at: null })).toBe(true);
    expect(acceptingSubmissions({ status: "active", submissions_closed_at: null })).toBe(true);
    expect(acceptingSubmissions({ status: "active", submissions_closed_at: "2026-01-01T00:00:00Z" })).toBe(false);
    for (const s of ["draft", "ended", "archived"] as const) {
      expect(acceptingSubmissions({ status: s, submissions_closed_at: null })).toBe(false);
    }
  });
});

describe("counter", () => {
  it("formats like a film counter and never goes negative", () => {
    expect(counterText(8)).toBe("08");
    expect(counterText(27)).toBe("27");
    expect(remainingShots(12, 15)).toBe(0);
    expect(counterText(remainingShots(12, 4))).toBe("08");
  });
});

describe("suspension", () => {
  it("blocks guests and submissions but not the owner", () => {
    const e = { ...base, suspended_at: "2026-01-01T00:00:00Z" };
    expect(acceptingSubmissions(e)).toBe(false);
    expect(galleryAccess(e, { isOwner: false, isGuest: true })).toMatchObject({ reason: "unavailable" });
    expect(galleryAccess(e, { isOwner: true, isGuest: false })).toEqual({ allowed: true });
  });
});

describe("readyForEmail", () => {
  it("live galleries wait for the event to end", () => {
    expect(readyForEmail(base)).toBe(false);
    expect(readyForEmail({ ...base, status: "ended" })).toBe(true);
  });
  it("scheduled galleries send at reveal time", () => {
    const e = { ...base, reveal_mode: "scheduled" as const, reveal_at: "2026-11-01T10:00:00Z" };
    expect(readyForEmail(e, new Date("2026-11-01T09:00:00Z"))).toBe(false);
    expect(readyForEmail(e, new Date("2026-11-01T10:00:01Z"))).toBe(true);
  });
  it("private or suspended never send", () => {
    expect(readyForEmail({ ...base, status: "ended", gallery_visibility: "private" })).toBe(false);
    expect(readyForEmail({ ...base, status: "ended", suspended_at: "2026-01-01T00:00:00Z" })).toBe(false);
  });
});
