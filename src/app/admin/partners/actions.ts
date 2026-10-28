"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/server/admin-auth";
import { normaliseSlug, slugProblem } from "@/lib/plans";

type Result = { ok: true } | { ok: false; error: string };

const PartnerInput = z.object({
  name: z.string().trim().min(1, "Give the venue a name.").max(80),
  slug: z.string().trim().max(40),
  blurb: z.string().trim().max(300).optional(),
  contact_email: z.union([z.email("Check the email."), z.literal("")]).optional(),
  discount_percent: z.number().int().min(0).max(50),
  revenue_share_percent: z.number().int().min(0).max(50),
});

function fail(e: unknown): Result {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
}

export async function savePartner(id: string | null, input: unknown): Promise<Result> {
  try {
    await assertAdmin();
    const p = PartnerInput.parse(input);
    const slug = normaliseSlug(p.slug || p.name);
    const problem = slugProblem(slug);
    if (problem) throw new Error(problem);
    const row = {
      name: p.name,
      slug,
      blurb: p.blurb || null,
      contact_email: p.contact_email || null,
      discount_percent: p.discount_percent,
      revenue_share_percent: p.revenue_share_percent,
    };
    const db = admin();
    const { error } = id ? await db.from("partners").update(row).eq("id", z.uuid().parse(id)) : await db.from("partners").insert(row);
    if (error) {
      if (error.code === "23505" || error.message.includes("slug_taken")) throw new Error("That link is already used. Pick another.");
      throw new Error(error.message);
    }
    revalidatePath("/admin/partners");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setPartnerActive(id: string, active: boolean): Promise<Result> {
  try {
    await assertAdmin();
    const { error } = await admin().from("partners").update({ active }).eq("id", z.uuid().parse(id));
    if (error) throw new Error(error.message);
    revalidatePath("/admin/partners");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const CodeInput = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,24}$/, "Use 4 to 24 letters, numbers or dashes."),
  percent_off: z.number().int().min(1).max(90),
  max_uses: z.number().int().min(1).max(100000).nullable(),
  expires_at: z.string().nullable(),
  first_order_only: z.boolean(),
});

/** A general discount code anyone can use, e.g. for a promotion. */
export async function createCode(input: unknown): Promise<Result> {
  try {
    await assertAdmin();
    const c = CodeInput.parse(input);
    const { error } = await admin()
      .from("discount_codes")
      .insert({ ...c, kind: "manual", expires_at: c.expires_at ? new Date(c.expires_at).toISOString() : null });
    if (error) {
      if (error.code === "23505") throw new Error("That code already exists.");
      throw new Error(error.message);
    }
    revalidatePath("/admin/partners");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setCodeActive(id: string, active: boolean): Promise<Result> {
  try {
    await assertAdmin();
    const { error } = await admin().from("discount_codes").update({ active }).eq("id", z.uuid().parse(id));
    if (error) throw new Error(error.message);
    revalidatePath("/admin/partners");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
