import { cx } from "@/components/ui";

/** The brand object: a single-use camera, drawn in CSS. */
export function CameraArt({ count = 12, className, accent }: { count?: number; className?: string; accent?: string }) {
  return (
    <div
      className={cx("relative aspect-[1.62] w-full max-w-[560px] select-none", className)}
      aria-label={`A disposable camera showing ${count} shots left`}
      role="img"
    >
      {/* top ridge and shutter button */}
      <div className="absolute top-0 right-[14%] h-[7%] w-[13%] rounded-t-[10px] bg-body-3" />
      <div
        className="absolute inset-x-0 top-[5%] bottom-0 overflow-hidden rounded-[9%/14%] shadow-[0_30px_60px_-30px_rgb(22_23_26/0.55),inset_0_-8px_0_rgb(0_0_0/0.18)]"
        style={{ background: accent ?? "var(--color-cobalt)" }}
      >
        {/* grip texture */}
        <div className="absolute inset-y-[8%] left-[3%] w-[7%] rounded-[30%] bg-[repeating-linear-gradient(0deg,rgb(0_0_0/0.18)_0_3px,transparent_3px_7px)]" />
        {/* paper wrap band */}
        <div className="absolute inset-y-0 left-[12%] w-[46%] bg-paper/95">
          <div className="flex h-full flex-col justify-between p-[6%]">
            <span className="display text-[clamp(18px,4.2vw,34px)] text-ink">lastshot</span>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[clamp(10px,1.6vw,13px)] leading-tight font-semibold text-graphite">
                Single-use
                <br />
                event camera
              </span>
              <span className="display rounded-md bg-ink px-2 py-1 text-[clamp(14px,2.6vw,22px)] text-flash">
                {String(count).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
        {/* flash window */}
        <div className="absolute top-[12%] right-[6%] h-[20%] w-[28%] rounded-[12px] bg-[linear-gradient(180deg,#fffbe6,#f1e7b8)] shadow-[inset_0_0_0_3px_rgb(0_0_0/0.15)]">
          <div className="absolute inset-[18%] rounded-md bg-[repeating-linear-gradient(90deg,rgb(0_0_0/0.08)_0_2px,transparent_2px_6px)]" />
        </div>
        {/* lens */}
        <div className="absolute right-[10%] bottom-[12%] aspect-square w-[22%] rounded-full bg-body shadow-[0_0_0_6px_rgb(0_0_0/0.2)]">
          <div className="absolute inset-[16%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#7d93ff_0%,#1e2a6b_45%,#06070b_75%)]" />
          <div className="absolute top-[26%] left-[30%] size-[14%] rounded-full bg-white/70 blur-[1px]" />
        </div>
        {/* viewfinder */}
        <div className="absolute top-[42%] right-[40%] h-[12%] w-[9%] rounded-[6px] bg-body/90 shadow-[inset_0_0_0_2px_rgb(255_255_255/0.15)]" />
        {/* flash ready lamp */}
        <div className="absolute top-[38%] right-[8%] size-[3.4%] rounded-full bg-flash shadow-[0_0_14px_3px_rgb(255_210_63/0.8)]" />
      </div>
    </div>
  );
}
