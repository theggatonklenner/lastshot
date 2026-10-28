export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-body text-cream-dim" aria-busy="true">
      <span className="flex items-center gap-3">
        <span className="size-2.5 animate-pulse rounded-full bg-flash" />
        Loading the roll
      </span>
    </div>
  );
}
