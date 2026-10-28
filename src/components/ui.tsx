import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "flash";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-cobalt text-white hover:bg-cobalt-deep shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)]",
  secondary: "bg-card text-ink border border-line hover:border-ink/40",
  ghost: "text-ink hover:bg-ink/5",
  danger: "bg-signal text-white hover:brightness-95",
  flash: "bg-flash text-ink hover:brightness-95 shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[15px] rounded-[10px]",
  md: "h-11 px-5 text-base rounded-control",
  lg: "h-14 px-7 text-lg rounded-[14px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap transition-[background,border,filter] duration-150 disabled:opacity-50 disabled:pointer-events-none select-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  pending,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; pending?: boolean }) {
  return (
    <button {...props} disabled={props.disabled || pending} className={buttonClass(variant, size, className)}>
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[15px] font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-signal" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-graphite">{hint}</p>
      ) : null}
    </div>
  );
}

const control =
  "w-full rounded-control border border-line bg-card px-3.5 text-base text-ink placeholder:text-graphite/70 focus:border-cobalt focus:outline-none focus:ring-2 focus:ring-cobalt/25";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(control, "h-12", props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(control, "min-h-24 py-3", props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(control, "h-12 appearance-none bg-[length:12px] pr-9", props.className)} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx("flex cursor-pointer items-start justify-between gap-4 py-3", disabled && "opacity-50")}>
      <span className="flex flex-col">
        <span className="font-semibold">{label}</span>
        {description && <span className="text-sm text-graphite">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-7 w-12 rounded-full bg-line transition-colors peer-checked:bg-cobalt peer-focus-visible:ring-3 peer-focus-visible:ring-cobalt/40" />
        <span className="absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Choice<T extends string>({
  name,
  value,
  onChange,
  options,
  columns = 1,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; description?: string }[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      role="radiogroup"
      className={cx("grid gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={cx(
            "flex cursor-pointer flex-col gap-0.5 rounded-control border bg-card px-4 py-3 transition-colors",
            value === o.value ? "border-cobalt ring-2 ring-cobalt/20" : "border-line hover:border-ink/30",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          <span className="font-semibold">{o.label}</span>
          {o.description && <span className="text-sm text-graphite">{o.description}</span>}
        </label>
      ))}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
  action,
}: {
  tone?: "info" | "error" | "success" | "warn";
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: "bg-cobalt-soft text-cobalt-deep",
    error: "bg-signal-soft text-signal",
    success: "bg-ok-soft text-ok",
    warn: "bg-flash/30 text-ink",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex flex-wrap items-center justify-between gap-3 rounded-control px-4 py-3 text-[15px]", tones[tone])}>
      <div>{children}</div>
      {action}
    </div>
  );
}

export function Panel({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className={cx("rounded-panel border border-line bg-card p-5 sm:p-6", className)}>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-dashed border-line px-6 py-10 sm:items-center sm:text-center">
      <FilmCanister className="h-12 text-graphite/60" />
      <h3 className="display-md text-xl">{title}</h3>
      {children && <div className="max-w-md text-graphite">{children}</div>}
      {action}
    </div>
  );
}

export function FilmCanister({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 48" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <rect x="6" y="8" width="24" height="34" rx="4" />
      <rect x="12" y="3" width="12" height="5" rx="1.5" />
      <path d="M30 16h6v18h-6" />
      <path d="M33 20v2M33 26v2" />
    </svg>
  );
}

export function Logo({ className, tone = "ink" }: { className?: string; tone?: "ink" | "cream" }) {
  const color = tone === "cream" ? "text-cream" : "text-ink";
  return (
    <span className={cx("inline-flex items-center gap-2", color, className)}>
      <svg viewBox="0 0 512 512" className="size-7" aria-hidden>
        <rect width="512" height="512" rx="112" fill="#2546d8" />
        <rect x="318" y="96" width="92" height="44" rx="14" fill="#16171a" />
        <rect x="56" y="124" width="400" height="280" rx="56" fill="#f1ecdf" />
        <rect x="96" y="164" width="104" height="58" rx="14" fill="#ffd23f" />
        <circle cx="300" cy="270" r="104" fill="#16171a" />
        <circle cx="300" cy="270" r="62" fill="#2546d8" />
        <circle cx="276" cy="244" r="20" fill="#ffffff" opacity="0.85" />
      </svg>
      <span className="display text-[22px] leading-none tracking-tight">lastshot</span>
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-paper-2 text-graphite" },
    published: { label: "Ready for guests", cls: "bg-cobalt-soft text-cobalt-deep" },
    active: { label: "Shooting", cls: "bg-flash/40 text-ink" },
    ended: { label: "Ended", cls: "bg-ink text-paper" },
    archived: { label: "Archived", cls: "bg-paper-2 text-graphite" },
  };
  const s = map[status] ?? map.draft;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold", s.cls)}>
      {status === "active" && <span className="size-1.5 rounded-full bg-signal" aria-hidden />}
      {s.label}
    </span>
  );
}
