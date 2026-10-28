"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EVENT_DEFAULTS, EventInput, type EventInputType } from "@/lib/event-schema";
import { changeLifecycle, createEvent, setAccessCode as saveAccessCode, updateEvent } from "@/app/dashboard/actions";
import { BasicsFields, GalleryFields, RollFields } from "@/components/event-fields";
import { CoverPicker } from "@/components/cover-picker";
import { Button, Notice, cx } from "@/components/ui";
import { formatEventDate, formatDateTime } from "@/lib/format";
import { eventTypeLabel } from "@/lib/rules";
import { THEMES } from "@/lib/themes";
import { ADDONS, PLANS, addonPrice, applyDiscount, formatPrice, planInfo, planRank, priceCart } from "@/lib/plans";
import { DiscountField, type AppliedDiscount } from "@/components/discount-field";
import { PlanPrice } from "@/components/plan-price";
import { redeemCredit, startCartCheckout } from "@/app/dashboard/events/[id]/upgrade/actions";
import type { Addon, Plan } from "@/lib/database.types";

const STEPS = ["Basics", "The roll", "Gallery", "Cover", "Plan", "Add-ons", "Review"] as const;
const PLAN_STEP = 4;
const ADDON_STEP = 5;
const REVIEW_STEP = 6;

export type WizardCredit = { id: string; pack: string; plan: Exclude<Plan, "free">; branding: boolean; remaining: number };

export function Wizard({
  credits = [],
  initialDiscount = null,
  standingDiscount = null,
}: {
  credits?: WizardCredit[];
  initialDiscount?: AppliedDiscount | null;
  standingDiscount?: AppliedDiscount | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [value, setValue] = useState<EventInputType>(() => ({
    ...EVENT_DEFAULTS,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Sydney",
  }));
  const [accessCode, setAccessCode] = useState("");
  const [plan, setPlan] = useState<Plan>("free");
  const [addons, setAddons] = useState<Addon[]>([]);
  const [creditId, setCreditId] = useState<string | null>(null);
  const credit = credits.find((c) => c.id === creditId) ?? null;
  const [discount, setDiscount] = useState<AppliedDiscount | null>(initialDiscount);
  // Same pricing the server uses before charging. A new event starts on Free with nothing added,
  // or on the pack's plan when a pack event is used.
  const cart = priceCart(
    {
      plan: credit?.plan ?? "free",
      extra_guests: 0,
      addon_frame: false,
      addon_branding: !!credit?.branding,
      addon_storage: false,
      addon_storage_1y: false,
      addon_sms: false,
    },
    { plan, seats: 0, addons },
  );
  const priced = applyDiscount(cart.lines, discount?.percent ?? 0, discount?.code ?? null);
  const lineItems = [
    ...(credit
      ? [{ label: `${planInfo(credit.plan).name} plan${credit.branding ? " + Your branding" : ""} (from your pack)`, cents: 0 }]
      : []),
    ...priced.lines.map((l) => ({ label: l.label, cents: l.cents })),
  ];
  const total = priced.total;
  const [eventId, setEventId] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof EventInputType, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof EventInputType>(key: K, v: EventInputType[K]) => {
    setValue((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validateStep(): boolean {
    const next: typeof errors = {};
    if (step === 0 && !value.title.trim()) next.title = "Give the event a name.";
    if (step === 1 && !(value.photos_per_guest >= 1 && value.photos_per_guest <= 100)) {
      next.photos_per_guest = "Choose between 1 and 100 shots.";
    }
    if (step === 2 && value.reveal_mode === "scheduled" && !value.reveal_at) next.reveal_at = "Pick when the gallery opens.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /** Saves the draft so far. Creates it the first time. */
  async function save(): Promise<string | null> {
    const parsed = EventInput.safeParse(value);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Check the details.");
      return null;
    }
    if (!eventId) {
      const res = await createEvent(parsed.data, accessCode || null);
      if (!res.ok) {
        setMessage(res.error);
        return null;
      }
      setEventId(res.data!.id);
      setSavedCode(accessCode || null);
      return res.data!.id;
    }
    const res = await updateEvent(eventId, parsed.data);
    if (!res.ok) {
      setMessage(res.error);
      return null;
    }
    if ((accessCode || null) !== savedCode) {
      const codeRes = await saveAccessCode(eventId, accessCode || null);
      if (!codeRes.ok) {
        setMessage(codeRes.error);
        return null;
      }
      setSavedCode(accessCode || null);
    }
    return eventId;
  }

  function next() {
    if (!validateStep()) return;
    setMessage(null);
    start(async () => {
      // Save from step 1 onwards so nothing is lost if the tab closes.
      const id = await save();
      if (id) setStep((s) => Math.min(s + 1, STEPS.length - 1));
    });
  }

  function saveDraft() {
    start(async () => {
      const id = await save();
      if (id) router.push(`/dashboard/events/${id}`);
    });
  }

  function publish() {
    start(async () => {
      const id = await save();
      if (!id) return;
      if (credit) {
        const used = await redeemCredit(id, credit.id);
        if (!used.ok) {
          setMessage(`${used.error} Your event is saved as a draft.`);
          return;
        }
      }
      if (total > 0) {
        // Price everything, then charge. The event goes live once Stripe confirms the payment.
        const pay = await startCartCheckout(
          id,
          { plan, seats: 0, addons },
          { publish: true, from: "new", code: discount?.code ?? undefined },
        );
        if (pay?.error) setMessage(`${pay.error} Your event is saved as a draft.`);
        return;
      }
      const res = await changeLifecycle(id, "publish");
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      router.push(`/dashboard/events/${id}/share?published=1`);
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link href="/dashboard" className="text-[15px] font-semibold text-graphite hover:text-ink">
          Back to your events
        </Link>
        <h1 className="display-md text-4xl">New event</h1>
        <ol className="flex gap-1.5" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1">
              <button
                type="button"
                disabled={i > step || pending}
                onClick={() => setStep(i)}
                className="flex w-full flex-col gap-1.5 text-left disabled:cursor-default"
                aria-current={i === step ? "step" : undefined}
              >
                <span className={cx("h-1.5 rounded-full", i <= step ? "bg-cobalt" : "bg-line")} />
                <span className={cx("hidden text-sm sm:block", i === step ? "font-semibold text-ink" : "text-graphite")}>
                  {label}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="text-sm text-graphite sm:hidden">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </div>

      {message && <Notice tone="error">{message}</Notice>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) next();
          else publish();
        }}
        className="flex flex-col gap-8"
      >
        {step === 0 && <BasicsFields value={value} set={set} errors={errors} />}
        {step === 1 && <RollFields value={value} set={set} errors={errors} />}
        {step === 2 && (
          <GalleryFields
            value={value}
            set={set}
            errors={errors}
            accessCode={accessCode}
            setAccessCode={setAccessCode}
          />
        )}
        {step === 3 && eventId && (
          <div className="flex flex-col gap-3">
            <p className="text-graphite">
              Guests see this when they scan the code. A wide photo of the venue or the people being celebrated works
              well. You can skip this.
            </p>
            <CoverPicker eventId={eventId} initialUrl={null} accent={value.theme === "custom" ? value.accent_color : "#2546d8"} />
          </div>
        )}
        {step === PLAN_STEP && (
          <>
            {credits.length > 0 && (
              <PackChoice
                credits={credits}
                creditId={creditId}
                setCreditId={(id) => {
                  setCreditId(id);
                  const c = credits.find((x) => x.id === id);
                  if (c && planRank(plan) < planRank(c.plan)) setPlan(c.plan);
                  if (c?.branding) setAddons((a) => a.filter((x) => x !== "branding"));
                }}
              />
            )}
            <PlanStep plan={plan} setPlan={setPlan} minPlan={credit?.plan} />
          </>
        )}
        {step === ADDON_STEP && (
          <AddonStep plan={plan} addons={addons} setAddons={setAddons} included={credit?.branding ? ["branding"] : []} />
        )}
        {step === REVIEW_STEP && (
          <Review
            value={value}
            hasCode={!!accessCode}
            items={lineItems}
            total={total}
            before={priced.discount > 0 ? cart.total : null}
            discountField={
              cart.total > 0 ? (
                <DiscountField eventId={null} applied={discount} setApplied={setDiscount} standing={standingDiscount} />
              ) : null
            }
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={pending}>
                Back
              </Button>
            )}
            {eventId && (
              <Button type="button" variant="secondary" onClick={saveDraft} disabled={pending}>
                Save draft
              </Button>
            )}
          </div>
          {step < STEPS.length - 1 ? (
            <Button type="submit" pending={pending}>
              {step === ADDON_STEP ? "Continue to review" : "Continue"}
            </Button>
          ) : (
            <Button type="submit" pending={pending}>
              {total > 0 ? `Publish and pay ${formatPrice(total)}` : "Publish event"}
            </Button>
          )}
        </div>
        {step === STEPS.length - 1 && eventId && (
          <p className="text-sm text-graphite">
            Want to see it first?{" "}
            <Link href={`/dashboard/events/${eventId}/preview`} className="font-semibold text-cobalt hover:underline">
              Preview the guest page
            </Link>{" "}
            (saves the draft).
          </p>
        )}
      </form>
    </div>
  );
}

function PackChoice({
  credits,
  creditId,
  setCreditId,
}: {
  credits: WizardCredit[];
  creditId: string | null;
  setCreditId: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-cobalt/40 bg-cobalt-soft/40 p-4">
      <p className="font-bold">Use an event from your pack</p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Pack">
        {[...credits, null].map((c) => (
          <label key={c?.id ?? "none"} className="flex cursor-pointer items-center gap-3 rounded-control bg-card px-3 py-2.5">
            <input
              type="radio"
              name="credit"
              checked={creditId === (c?.id ?? null)}
              onChange={() => setCreditId(c?.id ?? null)}
              className="size-4 accent-cobalt"
            />
            <span>
              {c ? (
                <>
                  <span className="font-semibold">
                    {planInfo(c.plan).name}
                    {c.branding ? " with your branding" : ""}
                  </span>{" "}
                  <span className="text-sm text-graphite">
                    ({c.remaining} left in your {c.pack === "school" ? "school pack" : `${c.pack}-event pack`})
                  </span>
                </>
              ) : (
                <span className="font-semibold">Don&apos;t use a pack event</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function PlanStep({ plan, setPlan, minPlan }: { plan: Plan; setPlan: (p: Plan) => void; minPlan?: Plan }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-graphite">
        How many guests are coming? Pick a plan now, or start free and upgrade any time, even during the event.
      </p>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Plan">
        {PLANS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={plan === p.id}
            onClick={() => setPlan(p.id)}
            disabled={!!minPlan && planRank(p.id) < planRank(minPlan)}
            className={cx(
              "flex flex-col gap-3 rounded-panel border bg-card p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              plan === p.id ? "border-cobalt ring-2 ring-cobalt/25" : "border-line hover:border-ink/30",
              p.id === "unlimited" && "sm:col-span-2",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-lg font-bold">{p.name}</span>
              <span
                aria-hidden
                className={cx("size-5 rounded-full border-2", plan === p.id ? "border-cobalt bg-cobalt shadow-[inset_0_0_0_3px_white]" : "border-line")}
              />
            </span>
            {minPlan === p.id ? <PlanPrice plan={p.id} priceOverride={0} note="From your pack" /> : <PlanPrice plan={p.id} />}
            <span className="font-semibold">{p.guests === null ? "Unlimited guests" : `Up to ${p.guests} guests`}</span>
            <span className="text-sm text-graphite">
              {p.id === "free" ? "Small Lastshot watermark on photos." : "No watermark."} {p.blurb}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AddonStep({
  plan,
  addons,
  setAddons,
  included = [],
}: {
  plan: Plan;
  addons: Addon[];
  setAddons: (a: Addon[]) => void;
  /** Add-ons already covered (e.g. branding from a pack). */
  included?: Addon[];
}) {
  const toggle = (id: Addon) => {
    if (addons.includes(id)) return setAddons(addons.filter((a) => a !== id));
    // 1 year and 2 years of storage are either/or.
    const other = id === "storage" ? "storage1y" : id === "storage1y" ? "storage" : null;
    setAddons([...addons.filter((a) => a !== other), id]);
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-graphite">Optional extras for this event. You can also add them later from the event&apos;s plan page.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ADDONS.map((a) => {
          const inPack = included.includes(a.id);
          const on = inPack || addons.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={inPack}
              onClick={() => toggle(a.id)}
              className={cx(
                "flex flex-col gap-2 rounded-panel border bg-card p-4 text-left transition-colors",
                on ? "border-cobalt ring-2 ring-cobalt/25" : "border-line hover:border-ink/30",
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="font-bold">{a.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="display text-xl numeric">{inPack ? "In pack" : formatPrice(addonPrice(a.id, { plan }))}</span>
                  <span
                    aria-hidden
                    className={cx(
                      "flex size-5 items-center justify-center rounded-[6px] border-2 text-xs text-white",
                      on ? "border-cobalt bg-cobalt" : "border-line",
                    )}
                  >
                    {on ? "✓" : ""}
                  </span>
                </span>
              </span>
              <span className="text-sm text-graphite">{a.blurb}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Review({
  value,
  hasCode,
  items,
  total,
  before,
  discountField,
}: {
  value: EventInputType;
  hasCode: boolean;
  items: { label: string; cents: number }[];
  total: number;
  before: number | null;
  discountField: React.ReactNode;
}) {
  const reveal =
    value.reveal_mode === "live"
      ? "Straight away"
      : value.reveal_mode === "scheduled"
        ? `At ${formatDateTime(value.reveal_at ?? null)}`
        : "When you choose";
  const visibility = { guests: "Guests who joined", public: "Anyone with the link", private: "Only you" }[
    value.gallery_visibility
  ];
  const rows: [string, string][] = [
    ["Event", `${value.title} (${eventTypeLabel(value.event_type)})`],
    ["Date", formatEventDate(value.event_date ?? null, value.start_time, value.end_time)],
    [
      "Shots per guest",
      value.bonus_shots > 0
        ? `${value.photos_per_guest}, plus ${value.bonus_shots} at ${formatDateTime(value.bonus_at ?? null)}`
        : String(value.photos_per_guest),
    ],
    ["Mystery shot", value.mystery_at ? `At ${formatDateTime(value.mystery_at)}${value.mystery_prompt ? `: ${value.mystery_prompt}` : ""}` : "Off"],
    ["Camera style", THEMES[value.theme].name],
    ["Gallery opens", reveal],
    ["Who sees the gallery", visibility],
    ["Approval", value.require_approval ? "You approve each photo" : "Photos go straight in"],
    ["Downloads", value.guest_downloads_enabled ? "Guests can download" : "Only you can download"],
    ["Camera roll", value.camera_roll_uploads_enabled ? "Allowed" : "Camera only"],
    [
      "Email when ready",
      value.email_capture_enabled && value.gallery_visibility !== "private" ? "Guests can ask for an email" : "Off",
    ],
    ["Access code", hasCode ? "Required" : "None"],
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-graphite">
        Publishing creates the QR code and lets guests join. Everything here can still be changed afterwards.
      </p>
      <div className="rounded-panel border border-line bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <span className="font-semibold">Your order</span>
          <span className="flex items-baseline gap-2">
            {before !== null && <span className="text-graphite line-through numeric">{formatPrice(before)}</span>}
            <span className="display text-2xl numeric">{total ? formatPrice(total) : "$0"}</span>
          </span>
        </div>
        <ul className="divide-y divide-line">
          {items.length === 0 ? (
            <li className="px-4 py-3 text-graphite">Free plan, up to 10 guests. Upgrade any time.</li>
          ) : (
            items.map((i) => (
              <li key={i.label} className="flex justify-between gap-3 px-4 py-2.5">
                <span>{i.label}</span>
                <span className="numeric">{i.cents ? formatPrice(i.cents) : "Included"}</span>
              </li>
            ))
          )}
        </ul>
        {discountField && <div className="flex flex-col border-t border-line px-4 py-3">{discountField}</div>}
        {total > 0 && (
          <p className="border-t border-line px-4 py-3 text-sm text-graphite">
            AUD, paid once with a card through Stripe. Your event goes live as soon as the payment goes through. If you
            stop at the payment page, it&apos;s kept as a draft.
          </p>
        )}
      </div>
      <dl className="divide-y divide-line rounded-panel border border-line bg-card">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-graphite">{k}</dt>
            <dd className="font-semibold sm:text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
