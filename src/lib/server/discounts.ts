import "server-only";
import { cookies } from "next/headers";
import { admin } from "@/lib/supabase/admin";
import type { DiscountCodeRecord } from "@/lib/database.types";

/** Cookie set by lastshot.app/go/<code> links (referrals and venue pages). */
export const CODE_COOKIE = "ls_code";

export type Discount = {
  codeId: string | null;
  code: string | null;
  percent: number;
  /** Shown in the order summary, e.g. "Friend referral". */
  label: string;
  partnerId: string | null;
};

export type DiscountResult = { discount: Discount | null; error?: string };

export function cleanCode(raw: string | null | undefined) {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 24);
}

const LABELS: Record<DiscountCodeRecord["kind"], string> = {
  referral: "Friend referral",
  reward: "Referral reward",
  second_event: "Next event discount",
  partner: "Venue discount",
  manual: "Discount code",
};

/** Code saved from a referral or venue link, if any. */
export async function savedCode() {
  try {
    return cleanCode((await cookies()).get(CODE_COOKIE)?.value);
  } catch {
    return "";
  }
}

/**
 * Works out the discount for an order: the code the organiser typed (checked
 * against its rules), or their venue's standing discount. If both apply, the
 * bigger one wins. Codes are never combined.
 */
export async function resolveDiscount(
  userId: string,
  rawCode: string | null | undefined,
  ctx: { eventId: string | null },
): Promise<DiscountResult> {
  const db = admin();
  const code = cleanCode(rawCode);
  const { data: profile } = await db.from("profiles").select("partner_id").eq("id", userId).maybeSingle();

  let fromCode: Discount | null = null;
  if (code) {
    const { data: dc } = await db.from("discount_codes").select("*").eq("code", code).maybeSingle();
    const problem = await codeProblem(dc, userId, ctx.eventId);
    if (problem) return { discount: null, error: problem };
    let partnerId = dc!.partner_id;
    if (partnerId) {
      const { data: partner } = await db.from("partners").select("active").eq("id", partnerId).maybeSingle();
      if (!partner?.active) return { discount: null, error: "That code has ended." };
    }
    partnerId = partnerId ?? profile?.partner_id ?? null;
    fromCode = { codeId: dc!.id, code: dc!.code, percent: dc!.percent_off, label: LABELS[dc!.kind], partnerId };
  }

  let fromPartner: Discount | null = null;
  if (profile?.partner_id) {
    const { data: partner } = await db
      .from("partners")
      .select("id, name, discount_percent, active")
      .eq("id", profile.partner_id)
      .maybeSingle();
    if (partner?.active && partner.discount_percent > 0) {
      fromPartner = { codeId: null, code: null, percent: partner.discount_percent, label: `${partner.name} discount`, partnerId: partner.id };
    }
  }

  if (fromCode && fromPartner && fromPartner.percent > fromCode.percent) {
    return { discount: fromPartner };
  }
  return { discount: fromCode ?? fromPartner };
}

async function codeProblem(dc: DiscountCodeRecord | null, userId: string, eventId: string | null): Promise<string | null> {
  if (!dc || !dc.active) return "That code isn't valid. Check it and try again.";
  if (dc.expires_at && new Date(dc.expires_at).getTime() < Date.now()) return "That code has expired.";
  if (dc.max_uses !== null && dc.uses >= dc.max_uses) return "That code has already been used.";

  switch (dc.kind) {
    case "referral":
      if (dc.owner_id === userId) return "That's your own referral code. Share it with friends instead.";
      break;
    case "reward":
    case "second_event":
      // Same message as an unknown code, so codes can't be confirmed by guessing.
      if (dc.owner_id !== userId) return "That code isn't valid. Check it and try again.";
      if (dc.kind === "second_event" && eventId && dc.source_event_id === eventId) {
        return "This code is for your next event, not this one.";
      }
      break;
  }

  if (dc.first_order_only) {
    const { count } = await admin()
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "paid")
      .gt("amount_cents", 0);
    if ((count ?? 0) > 0) return "That code is for a first order only.";
  }
  return null;
}

/** The organiser's referral code, made the first time it's needed. */
export async function referralCode(userId: string) {
  const { data } = await admin().rpc("ensure_referral_code", { p_user_id: userId });
  return data;
}
