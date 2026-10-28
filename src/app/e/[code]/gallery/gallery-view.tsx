"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadAsZips, downloadSingle } from "@/lib/client/zip";
import { guestToken } from "@/lib/client/upload-queue";
import { formatDateTime } from "@/lib/format";
import { Lightbox } from "@/components/lightbox";
import { ReportDialog } from "@/components/guest/report-dialog";
import { cx } from "@/components/ui";
import { makeCollage, type CollageLayout } from "@/lib/client/collage";
import { makeStoryCard } from "@/lib/client/story-card";

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
  canMine,
  dateLine = "",
}: {
  dateLine?: string;
  code: string;
  title: string;
  timezone: string;
  initial: Page;
  downloads: boolean;
  showNames: boolean;
  /** The viewer joined with a camera, so they can see just their own photos. */
  canMine?: boolean;
}) {
  const [mine, setMine] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [layout, setLayout] = useState<CollageLayout>("grid");
  const [collage, setCollage] = useState<{ url: string; blob: Blob; kind?: "story" } | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);

  async function storyCard(src: string) {
    setStoryBusy(true);
    try {
      const blob = await makeStoryCard(src, { title, dateLine });
      setViewer(null);
      setCollage({ url: URL.createObjectURL(blob), blob, kind: "story" });
    } catch {
      setError("Couldn't make the story image. Try again.");
    } finally {
      setStoryBusy(false);
    }
  }
  const [making, setMaking] = useState(false);
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
    async (s: Sort, offset: number, onlyMine = mine): Promise<Page> => {
      const token = guestToken(code);
      const res = await fetch(`/api/e/${code}/gallery?sort=${s}&offset=${offset}${onlyMine ? "&mine=1" : ""}`, {
        headers: token ? { "x-lastshot-guest": token } : {},
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "The gallery didn't load.");
      return json;
    },
    [code, mine],
  );

  async function changeView(s: Sort, onlyMine: boolean) {
    setSort(s);
    setMine(onlyMine);
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage(s, 0, onlyMine);
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
      const res = await fetch(`/api/e/${code}/gallery/download${mine ? "?mine=1" : ""}`, { headers: token ? { "x-lastshot-guest": token } : {} });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      await downloadAsZips(title, json.files, (d, t) => setZip(`${d} of ${t}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download didn't finish.");
    } finally {
      setZip(null);
    }
  }

  function togglePick(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 9 ? p : [...p, id]));
  }

  async function buildCollage() {
    setMaking(true);
    setError(null);
    try {
      const urls = picked.map((id) => photos.find((p) => p.id === id)?.displayUrl).filter((u): u is string => !!u);
      const blob = await makeCollage(urls, layout, title);
      setCollage({ url: URL.createObjectURL(blob), blob });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The collage didn't work. Try again.");
    } finally {
      setMaking(false);
    }
  }

  async function shareCollage() {
    if (!collage) return;
    const file = new File([collage.blob], `${title.replace(/[^\w]+/g, "-")}-${collage.kind ?? "collage"}.jpg`, { type: "image/jpeg" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    } catch {
      /* cancelled or not supported: fall back to saving */
    }
    const a = document.createElement("a");
    a.href = collage.url;
    a.download = file.name;
    a.click();
  }

  if (photos.length === 0 && !loading && !mine) {
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
              onClick={() => changeView(s, mine)}
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
        <div className="flex flex-wrap items-center gap-2">
        {canMine && (
          <div className="flex rounded-full bg-body-2 p-1" role="group" aria-label="Whose photos">
            {[
              [false, "Everyone"],
              [true, "Mine"],
            ].map(([v, label]) => (
              <button
                key={String(label)}
                onClick={() => changeView(sort, v as boolean)}
                aria-pressed={mine === v}
                className={cx(
                  "h-9 rounded-full px-3.5 text-[15px] font-semibold transition-colors",
                  mine === v ? "bg-cream text-body" : "text-cream-dim hover:text-cream",
                )}
              >
                {label as string}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => {
            setPicking((p) => !p);
            setPicked([]);
          }}
          className={cx(
            "h-10 rounded-full px-4 text-[15px] font-semibold",
            picking ? "bg-flash text-body" : "bg-cream/10 hover:bg-cream/15",
          )}
        >
          {picking ? "Cancel collage" : "Make a collage"}
        </button>
        {downloads && (
          <button
            onClick={downloadAll}
            disabled={!!zip}
            className="h-10 rounded-full bg-cream/10 px-4 text-[15px] font-semibold hover:bg-cream/15 disabled:opacity-60"
          >
            {zip ? `Downloading ${zip}` : mine ? `Download my ${total}` : `Download all ${total}`}
          </button>
        )}
        </div>
      </div>
      {picking && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-body-2 p-3 shadow-xl">
          <span className="text-[15px]">
            <span className="font-semibold text-cream numeric">{picked.length}</span>
            <span className="text-cream-dim"> of 9 picked. Tap photos to add them.</span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex rounded-full bg-body p-1" role="group" aria-label="Collage layout">
              {(
                [
                  ["grid", "Grid"],
                  ["strip", "Film strip"],
                ] as [CollageLayout, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setLayout(v)}
                  aria-pressed={layout === v}
                  className={cx("h-8 rounded-full px-3 text-sm font-semibold", layout === v ? "bg-cream text-body" : "text-cream-dim")}
                >
                  {label}
                </button>
              ))}
            </span>
            <button
              onClick={buildCollage}
              disabled={picked.length < 2 || making}
              className="h-10 rounded-full bg-flash px-4 font-bold text-body disabled:opacity-40"
            >
              {making ? "Making…" : "Make it"}
            </button>
          </span>
        </div>
      )}
      {mine && photos.length === 0 && !loading && (
        <p className="rounded-[14px] bg-body-2 px-4 py-6 text-center text-cream-dim">None of your photos are in the gallery yet.</p>
      )}
      {error && (
        <p role="alert" className="rounded-[12px] bg-signal/20 px-4 py-3">
          {error}
        </p>
      )}

      <ul className="columns-2 gap-2 sm:columns-3 [&>li]:mb-2">
        {photos.map((p, i) => (
          <li key={p.id} className="break-inside-avoid">
            <button
              onClick={() => (picking ? togglePick(p.id) : setViewer(i))}
              aria-pressed={picking ? picked.includes(p.id) : undefined}
              className={cx(
                "relative block w-full overflow-hidden rounded-[8px] bg-body-2",
                fresh.has(p.id) && "develop",
                picking && picked.includes(p.id) && "ring-4 ring-flash",
              )}
              style={{ aspectRatio: `${p.width} / ${p.height}` }}
              aria-label={`Open photo${p.guestName && showNames ? ` by ${p.guestName}` : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              {picking && picked.includes(p.id) && (
                <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-flash text-sm font-bold text-body numeric">
                  {picked.indexOf(p.id) + 1}
                </span>
              )}
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
                {p && (
                  <button
                    className="h-10 rounded-full bg-flash px-4 font-semibold text-body disabled:opacity-60"
                    disabled={storyBusy}
                    onClick={() => storyCard(p.displayUrl)}
                  >
                    {storyBusy ? "Making it" : "Share to story"}
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
      {collage && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4" role="dialog" aria-label="Your collage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={collage.url}
            alt={collage.kind === "story" ? "Your story image" : "Your collage"}
            className="max-h-[72dvh] max-w-full rounded-[8px] object-contain shadow-2xl"
          />
          {collage.kind === "story" && (
            <p className="max-w-xs text-center text-sm text-cream-dim">
              Tap Save or share, then pick Instagram and choose Story. On a computer it downloads instead.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={shareCollage} className="h-12 rounded-full bg-flash px-6 font-bold text-body">
              Save or share
            </button>
            <button
              onClick={() => {
                URL.revokeObjectURL(collage.url);
                setCollage(null);
              }}
              className="h-12 rounded-full bg-cream/15 px-6 font-semibold text-cream"
            >
              Close
            </button>
          </div>
        </div>
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
