"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

export type LightboxItem = { id: string; src: string; alt: string; caption?: ReactNode };

/** Full-screen viewer with keyboard and swipe navigation. */
export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  actions,
}: {
  items: LightboxItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  actions?: (item: LightboxItem) => ReactNode;
}) {
  const item = items[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);

  const prev = useCallback(() => index > 0 && onIndex(index - 1), [index, onIndex]);
  const next = useCallback(() => index < items.length - 1 && onIndex(index + 1), [index, items.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, prev, next]);

  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-50 flex flex-col bg-body/97 text-cream"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (dx > 50) prev();
        if (dx < -50) next();
        touchX.current = null;
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <span className="numeric text-[15px] text-cream-dim">
          {index + 1} of {items.length}
        </span>
        <div className="flex items-center gap-2">
          {actions?.(item)}
          <button
            ref={closeRef}
            onClick={onClose}
            className="flex h-10 items-center rounded-full bg-cream/10 px-4 font-semibold hover:bg-cream/20"
          >
            Close
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={item.id} src={item.src} alt={item.alt} className="develop max-h-full max-w-full rounded-sm object-contain shadow-2xl" />
        <button
          onClick={prev}
          disabled={index === 0}
          aria-label="Previous photo"
          className="absolute top-1/2 left-3 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-cream/10 text-2xl hover:bg-cream/20 disabled:opacity-0 sm:flex"
        >
          ‹
        </button>
        <button
          onClick={next}
          disabled={index === items.length - 1}
          aria-label="Next photo"
          className="absolute top-1/2 right-3 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-cream/10 text-2xl hover:bg-cream/20 disabled:opacity-0 sm:flex"
        >
          ›
        </button>
      </div>
      <div className="min-h-14 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] text-center text-[15px] text-cream-dim">
        {item.caption}
      </div>
    </div>
  );
}
