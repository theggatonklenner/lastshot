import type { Metadata } from "next";
import { requireOrganiser } from "@/lib/server/organiser";
import { referralCode } from "@/lib/server/discounts";
import { siteUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { EmptyState, Panel } from "@/components/ui";

export const metadata: Metadata = { title: "Refer a friend" };

export default async function CodesPage() {
  const { supabase, user } = await requireOrganiser("/dashboard/codes");
  const ref = await referralCode(user.id);
  const { data: codes } = await supabase
    .from("discount_codes")
    .select("id, code, kind, percent_off, uses, max_uses, expires_at, active, created_at")
    .eq("owner_id", user.id)
    .neq("kind", "referral")
    .order("created_at", { ascending: false });
  const link = ref ? `${siteUrl()}/go/${ref.code}` : null;
  const usable = (codes ?? []).filter(
    (c) => c.active && (c.max_uses === null || c.uses < c.max_uses) && !(c.expires_at && new Date(c.expires_at) < new Date()),
  );
  const used = (codes ?? []).filter((c) => !usable.includes(c));

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="display-md text-[clamp(28px,4vw,40px)]">Refer a friend</h1>
        <p className="text-graphite">
          Give friends 15% off their first paid event. When one of them pays, you get a 15% off code for your next one.
        </p>
      </div>

      {ref && link && (
        <Panel className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-graphite">Your code</p>
            <p className="display text-4xl tracking-wide">{ref.code}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-graphite">Or share this link. The code is filled in for them.</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-paper px-3 py-2 text-[15px]">{link}</code>
              <CopyButton text={link} label="Copy link" />
            </div>
          </div>
          <p className="text-sm text-graphite">
            {ref.uses === 0
              ? "No one has used it yet."
              : `Used ${ref.uses} ${ref.uses === 1 ? "time" : "times"}. Thanks for spreading the word.`}
          </p>
        </Panel>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Your discount codes</h2>
        {usable.length === 0 ? (
          <EmptyState title="No codes yet">
            Reward codes from referrals show up here, along with a 20% off code each time one of your events wraps up.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {usable.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-card px-4 py-3">
                <span>
                  <span className="block font-mono text-lg font-bold">{c.code}</span>
                  <span className="text-sm text-graphite">
                    {c.percent_off}% off ·{" "}
                    {c.kind === "reward" ? "Thanks for a referral" : c.kind === "second_event" ? "Your next event" : "Discount"}
                    {c.expires_at ? ` · Use by ${formatDateTime(c.expires_at)}` : ""}
                  </span>
                </span>
                <CopyButton text={c.code} label="Copy" />
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-graphite">Type a code at checkout under &quot;Have a discount code?&quot;. One code per order.</p>
      </section>

      {used.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Used or expired</h2>
          <ul className="text-[15px] text-graphite">
            {used.map((c) => (
              <li key={c.id}>
                <span className="font-mono">{c.code}</span> · {c.percent_off}% off
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
