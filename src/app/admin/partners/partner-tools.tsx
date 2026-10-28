"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Notice, Toggle } from "@/components/ui";
import type { PartnerRecord } from "@/lib/database.types";
import { createCode, savePartner, setCodeActive, setPartnerActive } from "./actions";

export function PartnerEditor({ partner, host }: { partner: PartnerRecord | null; host: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: partner?.name ?? "",
    slug: partner?.slug ?? "",
    blurb: partner?.blurb ?? "",
    contact_email: partner?.contact_email ?? "",
    discount_percent: partner?.discount_percent ?? 15,
    revenue_share_percent: partner?.revenue_share_percent ?? 10,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={partner ? "secondary" : "primary"} onClick={() => setOpen(true)}>
          {partner ? "Edit" : "Add a venue partner"}
        </Button>
        {partner && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            pending={pending}
            onClick={() => start(async () => void (await setPartnerActive(partner.id, !partner.active), router.refresh()))}
          >
            {partner.active ? "Pause" : "Turn back on"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-control border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await savePartner(partner?.id ?? null, f);
          if (!res.ok) return setError(res.error);
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Venue name">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} required />
        </Field>
        <Field label={`Page link: ${host}/…`} hint="Leave blank to use the name.">
          <Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} maxLength={40} placeholder="the-grand-hall" />
        </Field>
        <Field label="Customer discount (%)">
          <Input type="number" min={0} max={50} value={f.discount_percent} onChange={(e) => setF({ ...f, discount_percent: Number(e.target.value) })} />
        </Field>
        <Field label="Venue's share of revenue (%)">
          <Input
            type="number"
            min={0}
            max={50}
            value={f.revenue_share_percent}
            onChange={(e) => setF({ ...f, revenue_share_percent: Number(e.target.value) })}
          />
        </Field>
        <Field label="Contact email">
          <Input type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} />
        </Field>
        <Field label="Short intro for their page" hint="Optional. Up to 300 characters.">
          <Input value={f.blurb} onChange={(e) => setF({ ...f, blurb: e.target.value })} maxLength={300} />
        </Field>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" pending={pending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function CodeForm() {
  const router = useRouter();
  const [f, setF] = useState({ code: "", percent_off: 10, max_uses: "", expires_at: "", first_order_only: false });
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3 rounded-panel border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const res = await createCode({
            code: f.code,
            percent_off: f.percent_off,
            max_uses: f.max_uses ? Number(f.max_uses) : null,
            expires_at: f.expires_at || null,
            first_order_only: f.first_order_only,
          });
          if (!res.ok) return setMsg({ tone: "error", text: res.error });
          setMsg({ tone: "success", text: `${f.code.toUpperCase()} is ready to use.` });
          setF({ ...f, code: "" });
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Code">
          <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="SPRING20" maxLength={24} required />
        </Field>
        <Field label="Percent off">
          <Input type="number" min={1} max={90} value={f.percent_off} onChange={(e) => setF({ ...f, percent_off: Number(e.target.value) })} />
        </Field>
        <Field label="Max uses" hint="Blank for no limit.">
          <Input type="number" min={1} value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} />
        </Field>
        <Field label="Expires" hint="Optional.">
          <Input type="date" value={f.expires_at} onChange={(e) => setF({ ...f, expires_at: e.target.value })} />
        </Field>
      </div>
      <Toggle checked={f.first_order_only} onChange={(v) => setF({ ...f, first_order_only: v })} label="First paid order only" />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button type="submit" size="sm" pending={pending} className="self-start">
        Create code
      </Button>
    </form>
  );
}

export function CodeToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      pending={pending}
      onClick={() => start(async () => void (await setCodeActive(id, !active), router.refresh()))}
    >
      {active ? "Turn off" : "Turn on"}
    </Button>
  );
}
