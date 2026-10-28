"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrganiser } from "@/lib/server/organiser";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { createCheckoutSession, stripeConfigured } from "@/lib/server/stripe";
import { resolveDiscount } from "@/lib/server/discounts";
import { recordError } from "@/lib/server/error-log";
import { PACKS, SCHOOL_PACK, applyDiscount, packPrice, packValue, planInfo, type PackId } from "@/lib/plans";

const Pack = z.object({
  pack: z.enum(["5", "10", "school"]),
  plan: z.enum(["small", "party", "big", "unlimited"]),
  branding: z.boolean(),
  code: z.string().max(24).optional(),
});

/** Checkout for a bulk pack. The events are added to the account as credits once paid. */
export async function startPackCheckout(input: z.infer<typeof Pack>): Promise<{ error?: string } | undefined> {
  const parsed = Pack.safeParse(input);
  if (!parsed.success) return { error: "Check your choice and try again." };
  const { user } = await requireOrganiser("/dashboard/packs");
  if (!stripeConfigured()) return { error: "Payments aren't set up yet. Try again soon." };

  const school = parsed.data.pack === "school";
  const pack = parsed.data.pack as PackId;
  const plan = school ? SCHOOL_PACK.plan : parsed.data.plan;
  const branding = school ? true : parsed.data.branding;
  const events = school ? SCHOOL_PACK.events : PACKS.find((p) => p.id === pack)!.events;
  const subtotal = packPrice(pack, plan, branding);
  const saving = packValue(pack, plan, branding) - subtotal;

  const { discount, error: codeError } = await resolveDiscount(user.id, parsed.data.code, { eventId: null });
  if (codeError) return { error: codeError };
  const name = school ? "Lastshot School pack" : `Lastshot ${events}-event pack`;
  const detail = `${events} ${planInfo(plan).name} events${branding ? " with your branding" : ""}. Saves ${Math.round(saving / 100)} dollars.`;
  const priced = applyDiscount([{ key: "pack", label: name, detail, cents: subtotal }], discount?.percent ?? 0, discount?.code ?? null);

  let url: string | null = null;
  try {
    const session = await createCheckoutSession({
      items: priced.lines.map((l) => ({ amountCents: l.cents, name: l.label, description: l.detail })),
      description: name,
      email: user.email!,
      successUrl: `${siteUrl()}/dashboard/packs?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl()}/dashboard/packs?cancelled=1`,
      metadata: { kind: "pack", pack, plan, branding: branding ? "1" : "0", user_id: user.id, code: discount?.code ?? "" },
      idempotencyKey: ["pack", user.id, pack, plan, branding ? "b" : "", discount?.code ?? "", Math.floor(Date.now() / 600_000)].join(":"),
    });
    const { error } = await admin().from("payments").upsert(
      {
        event_id: null,
        user_id: user.id,
        kind: "pack",
        pack,
        pack_plan: plan,
        pack_events: events,
        pack_branding: branding,
        amount_cents: priced.total,
        subtotal_cents: subtotal,
        discount_cents: priced.discount,
        discount_code_id: discount?.codeId ?? null,
        partner_id: discount?.partnerId ?? null,
        stripe_session_id: session.id,
      },
      { onConflict: "stripe_session_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    url = session.url;
  } catch (e) {
    await recordError({
      source: "server",
      message: `Pack checkout failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500),
      path: "/dashboard/packs",
      detail: JSON.stringify({ pack, plan, branding }),
    }).catch(() => {});
    return { error: "Couldn't open the payment page. Try again in a minute." };
  }
  if (!url) return { error: "Couldn't open the payment page. Try again in a minute." };
  redirect(url);
}
