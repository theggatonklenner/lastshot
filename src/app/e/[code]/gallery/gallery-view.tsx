"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadAsZips, downloadSingle } from "@/lib/client/zip";
import { guestToken } from "@/lib/client/upload-queue";
import { formatDateTime } from "@/lib/format";
import { Lightbox } from "@/components/lightbox";
import { ReportDialog } from "@/components/guest/report-dialog";
import { cx } from "@/components/ui";

type Photo = {
  id: string;
  thumbUrl: string;
  displayUrl: string;
  originalUrl: string | null;
  width: number;
  height: number;
  takenAt: string;
  guestName: string | null;
};
type Page = { photos: Photo[]; nextOffset: number | null; total: number };
type Sort = "newest" | "oldest" | "shuffle";

const POLL_MS = 20_000;

export function GalleryView({
  code,
  title,
  timezone,
  initial,
  downloads,
  showNames,
}: {
  code: string;
  title: string;
  timezone: string;
  initial: Page;
  downloads: boolean;
  showNames: boolean;
}) {
  const [sort, setSort] = useState<Sort>("newest");
  const [photos, setPhotos] = useState<Photo[]>(initial.photos);
  const [nextOffset, setNextOffset] = useState<number | null>(initial.nextOffset);
  const [total, setTotal] = useState(initial.total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [zip, setZip] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const sentinel = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(
    async (s: Sort, offset: number): Promise<Page> => {
      const token = guestToken(code);
      const res = await fetch(`/api/e/${code}/gallery?sort=${s}&offset=${offset}`, {
        headers: token ? { "x-lastshot-guest": token } : {},
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "The gallery didn't load.");
      return json;
    },
    [code],
  );

  async function changeSort(s: Sort) {
    setSort(s);
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage(s, 0);
      setPhotos(page.photos);
      setNextOffset(page.nextOffset);
      setTotal(page.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The gallery didn't load.");
    } finally {
      setLoading(false);
    }
  }

  const loadMore = useCallback(async () => {
    if (loading || nextOffset === null) return;
    setLoading(true);
    try {
      const page = await fetchPage(sort, nextOffset);
      setPhotos((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.photos.filter((p) => !seen.has(p.id))];
      });
      setNextOffset(page.nextOffset);
      setTotal(page.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "More photos didn't load.");
    } finally {
      setLoading(false);
    }
  }, [fetchPage, loading, nextOffset, sort]);

  // Lazy load as the end of the grid comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // New photos appear at the top while viewing newest first.
  useEffect(() => {
    if (sort !== "newest") return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const page = await fetchPage("newest", 0);
        setTotal(page.total);
        setPhotos((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const added = page.photos.filter((p) => !seen.has(p.id));
          if (!added.length) return prev;
          setFresh(new Set(added.map((p) => p.id)));
          setNextOffset((o) => (o === null ? null : o + added.length));
          return [...added, ...prev];
        });
      } catch {
        /* try again next tick */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [sort, fetchPage]);

  async function downloadAll() {
    setError(null);
    try {
      setZip("Preparing");
      const token = guestToken(code);
      const res = await fetch(`/api/e/${code}/gallery/download`, { headers: token ? { "x-lastshot-guest": token } : {} });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      await downloadAsZips(title, json.files, (d, t) => setZip(`${d} of ${t}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download didn't finish.");
    } finally {
      setZip(null);
    }
  }

  if (photos.length === 0 && !loading) {
    return (
      <div className="rounded-[18px] border border-dashed border-cream/20 px-6 py-12 text-center">
        <p className="display-md text-2xl">No photos yet</p>
        <p className="mt-2 text-cream-dim">They&apos;ll appear here as people take them. This page updates on its own.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full bg-body-2 p-1" role="group" aria-label="Sort photos">
          {(["newest", "oldest", "shuffle"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => changeSort(s)}
              aria-pressed={sort === s}
              className={cx(
                "h-9 rounded-full px-3.5 text-[15px] font-semibold capitalize transition-colors",
                sort === s ? "bg-cream text-body" : "text-cream-dim hover:text-cream",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        {downloads && (
          <button
            onClick={downloadAll}
            disabled={!!zip}
            className="h-10 rounded-full bg-cream/10 px-4 text-[15px] font-semibold hover:bg-cream/15 disabled:opacity-60"
          >
            {zip ? `Downloading ${zip}` : `Download all ${total}`}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-[12px] bg-signal/20 px-4 py-3">
          {error}
        </p>
      )}

      <ul className="columns-2 gap-2 sm:columns-3 [&>li]:mb-2">
        {photos.map((p, i) => (
          <li key={p.id} className="break-inside-avoid">
            <button
              onClick={() => setViewer(i)}
              className={cx("relative block w-full overflow-hidden rounded-[8px] bg-body-2", fresh.has(p.id) && "develop")}
              style={{ aspectRatio: `${p.width} / ${p.height}` }}
              aria-label={`Open photo${p.guestName && showNames ? ` by ${p.guestName}` : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <div ref={sentinel} className="flex h-10 items-center justify-center text-cream-dim" aria-live="polite">
        {loading ? "Loading photos" : nextOffset === null ? `${total} ${total === 1 ? "photo" : "photos"}` : ""}
      </div>

      {viewer !== null && (
        <Lightbox
          items={photos.map((p) => ({
            id: p.id,
            src: p.displayUrl,
            alt: p.guestName && showNames ? `Photo by ${p.guestName}` : "Event photo",
            caption: [showNames && p.guestName, formatDateTime(p.takenAt, timezone)].filter(Boolean).join(", "),
          }))}
          index={viewer}
          onIndex={(i) => {
            setViewer(i);
            if (i >= photos.length - 3) loadMore();
          }}
          onClose={() => setViewer(null)}
          actions={(item) => {
            const p = photos.find((x) => x.id === item.id);
            return (
              <>
                {reported.has(item.id) ? (
                  <span className="px-2 text-sm text-cream-dim">Reported</span>
                ) : (
                  <button
                    className="h-10 rounded-full bg-cream/10 px-4 font-semibold hover:bg-cream/20"
                    onClick={() => setReporting(item.id)}
                  >
                    Report
                  </button>
                )}
                {downloads && p?.originalUrl && (
                  <button
                    className="h-10 rounded-full bg-cream/10 px-4 font-semibold hover:bg-cream/20"
                    onClick={() =>
                      downloadSingle(p.originalUrl!, `${title.replace(/[^\w]+/g, "-")}-${p.id.slice(0, 6)}.jpg`).catch(() =>
                        setError("That photo didn't download."),
                      )
                    }
                  >
                    Download
                  </button>
                )}
              </>
            );
          }}
        />
      )}
      {reporting && (
        <ReportDialog
          code={code}
          photoId={reporting}
          onClose={() => setReporting(null)}
          onReported={(hidden) => {
            const id = reporting;
            setReported((r) => new Set(r).add(id));
            if (hidden) {
              // Enough reports to hide it: take it out of this view too.
              setViewer(null);
              setPhotos((list) => list.filter((x) => x.id !== id));
            }
          }}
        />
      )}
    </div>
  );
}
