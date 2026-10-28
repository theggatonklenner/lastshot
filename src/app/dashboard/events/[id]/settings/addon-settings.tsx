"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { saveLeadQuestions, updateFrame } from "@/app/dashboard/actions";
import type { LeadQuestion } from "@/lib/database.types";
import { MAX_LEAD_QUESTIONS } from "@/lib/lead-questions";
import { Button, Field, Input, Notice, Panel, cx } from "@/components/ui";

type FrameColor = "white" | "cream" | "black";
const SWATCH: Record<FrameColor, { bg: string; ink: string; label: string }> = {
  white: { bg: "#fbfaf7", ink: "#16171a", label: "White" },
  cream: { bg: "#f1ecdf", ink: "#16171a", label: "Cream" },
  black: { bg: "#16171a", ink: "#f1ecdf", label: "Black" },
};

export function AddonSettings({
  eventId,
  hasFrame,
  hasBranding,
  frame,
  logoUrl,
  coverUrl,
  hasExport = false,
  questions = [],
}: {
  hasExport?: boolean;
  questions?: LeadQuestion[];
  eventId: string;
  hasFrame: boolean;
  hasBranding: boolean;
  frame: { text: string | null; subtext: string | null; color: FrameColor };
  logoUrl: string | null;
  coverUrl: string | null;
}) {
  const plan = `/dashboard/events/${eventId}/upgrade#addons`;
  return (
    <Panel className="max-w-3xl">
      <div id="addons" className="scroll-mt-24">
        <h2 className="mb-1 text-xl font-bold">Add-ons</h2>
        <p className="mb-6 text-graphite">
          Set up the extras you&apos;ve added. Others are on the{" "}
          <Link href={plan} className="font-semibold text-cobalt hover:underline">
            plan page
          </Link>
          .
        </p>
        <div className="flex flex-col gap-8">
          {hasFrame ? (
            <FrameEditor eventId={eventId} initial={frame} coverUrl={coverUrl} />
          ) : (
            <Locked title="Custom photo frame" body="Print your names and date on every photo." href={plan} />
          )}
          <div className="border-t border-line" />
          {hasBranding ? (
            <LogoEditor endpoint={`/api/events/${eventId}/logo`} initialUrl={logoUrl} />
          ) : (
            <Locked title="Your branding" body="Show your logo instead of Lastshot's on guest pages, signs and the slideshow." href={plan} />
          )}
          <div className="border-t border-line" />
          {hasExport ? (
            <LeadQuestionsEditor eventId={eventId} initial={questions} />
          ) : (
            <Locked
              title="Guest data export and questions"
              body="Ask guests up to 3 questions when they join, then download everything as a spreadsheet."
              href={plan}
            />
          )}
        </div>
      </div>
    </Panel>
  );
}

function Locked({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-graphite">{body}</p>
      </div>
      <Link href={href} className="text-sm font-semibold text-cobalt hover:underline">
        Add it
      </Link>
    </div>
  );
}

function FrameEditor({
  eventId,
  initial,
  coverUrl,
}: {
  eventId: string;
  initial: { text: string | null; subtext: string | null; color: FrameColor };
  coverUrl: string | null;
}) {
  const [text, setText] = useState(initial.text ?? "");
  const [subtext, setSubtext] = useState(initial.subtext ?? "");
  const [color, setColor] = useState<FrameColor>(initial.color);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const s = SWATCH[color];

  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_220px]">
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-semibold">Custom photo frame</p>
          <p className="text-sm text-graphite">Every photo taken from now on gets this border. Leave both lines empty to turn it off.</p>
        </div>
        <Field label="Main line" htmlFor="frame_text">
          <Input id="frame_text" value={text} maxLength={40} onChange={(e) => setText(e.target.value)} placeholder="Mia & Jordan" />
        </Field>
        <Field label="Second line (optional)" htmlFor="frame_subtext">
          <Input id="frame_subtext" value={subtext} maxLength={40} onChange={(e) => setSubtext(e.target.value)} placeholder="14 November 2026" />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[15px] font-semibold">Frame colour</legend>
          <div className="flex gap-2">
            {(Object.keys(SWATCH) as FrameColor[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cx(
                  "flex items-center gap-2 rounded-control border px-3 py-2 text-sm font-semibold",
                  color === c ? "border-cobalt ring-2 ring-cobalt/20" : "border-line",
                )}
              >
                <span className="size-4 rounded-full border border-line" style={{ background: SWATCH[c].bg }} />
                {SWATCH[c].label}
              </button>
            ))}
          </div>
        </fieldset>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Button
          type="button"
          className="self-start"
          pending={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const res = await updateFrame(eventId, { text, subtext, color });
              setMsg(res.ok ? { tone: "success", text: "Frame saved." } : { tone: "error", text: res.error });
            })
          }
        >
          Save frame
        </Button>
      </div>
      {/* Preview */}
      <div aria-hidden className="self-start p-2.5 pb-0 shadow-md" style={{ background: s.bg }}>
        <div
          className="aspect-[3/4] w-full bg-cover bg-center"
          style={{ background: coverUrl ? `url(${coverUrl}) center/cover` : "linear-gradient(160deg,#f6d365,#fda085 55%,#6b3b5a)" }}
        />
        <div className="flex min-h-14 flex-col items-center justify-center px-2 py-2.5 text-center" style={{ color: s.ink }}>
          <span className="display w-full truncate text-base leading-tight">{text || subtext || "Your text"}</span>
          {text && subtext && <span className="w-full truncate text-[11px] font-semibold opacity-70">{subtext}</span>}
        </div>
      </div>
    </div>
  );
}

export function LogoEditor({
  endpoint,
  initialUrl,
  title = "Your branding",
  body = "Your logo replaces Lastshot's on the guest pages, printable signs and TV slideshow. A PNG with a transparent background works best.",
}: {
  endpoint: string;
  initialUrl: string | null;
  title?: string;
  body?: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("logo", file, file.name);
      const res = await fetch(endpoint, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "The logo didn't upload.");
      setUrl(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The logo didn't upload.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    await fetch(endpoint, { method: "DELETE" });
    setUrl(null);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-graphite">{body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-56 items-center justify-center rounded-control border border-dashed border-line bg-body p-3">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Your logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-sm text-cream-dim">No logo yet</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <Button type="button" variant="secondary" pending={busy} onClick={() => input.current?.click()}>
            {url ? "Change logo" : "Upload logo"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" onClick={remove} disabled={busy}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function LeadQuestionsEditor({ eventId, initial }: { eventId: string; initial: LeadQuestion[] }) {
  const [rows, setRows] = useState<LeadQuestion[]>(initial);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<LeadQuestion>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveLeadQuestions(eventId, rows);
      setMsg(res.ok ? { tone: "success", text: "Questions saved. New guests will see them when they join." } : { tone: "error", text: res.error });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Questions when guests join</p>
          <p className="text-sm text-graphite">
            Up to {MAX_LEAD_QUESTIONS}, like &quot;Company&quot; or &quot;Want a demo?&quot;. Answers go in the guest
            spreadsheet.
          </p>
        </div>
        <a
          href={`/api/events/${eventId}/export`}
          download
          className="rounded-[10px] border border-line px-3 py-1.5 text-sm font-semibold hover:border-ink/30"
        >
          Download guest data
        </a>
      </div>
      {rows.map((q, i) => (
        <div key={q.id} className="flex flex-col gap-2 rounded-control border border-line p-3">
          <Input
            aria-label={`Question ${i + 1}`}
            value={q.label}
            maxLength={80}
            placeholder={i === 0 ? "Company" : "Want us to get in touch?"}
            onChange={(e) => set(i, { label: e.target.value })}
          />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <span className="font-semibold">Answer</span>
              <select
                value={q.kind}
                onChange={(e) => set(i, { kind: e.target.value as LeadQuestion["kind"] })}
                className="rounded-[8px] border border-line bg-card px-2 py-1"
              >
                <option value="text">Short text</option>
                <option value="yesno">Yes or no</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={q.required} onChange={(e) => set(i, { required: e.target.checked })} className="size-4 accent-cobalt" />
              Required
            </label>
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              className="ml-auto font-semibold text-graphite hover:text-ink"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {rows.length < MAX_LEAD_QUESTIONS && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRows([...rows, { id: `q${Date.now().toString(36)}`, label: "", kind: "text", required: false }])}
          >
            Add a question
          </Button>
        )}
        <Button type="button" size="sm" onClick={save} pending={pending}>
          Save questions
        </Button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
