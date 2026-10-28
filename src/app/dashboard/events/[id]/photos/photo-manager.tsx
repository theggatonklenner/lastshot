"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { moderatePhotos } from "@/app/dashboard/actions";
import { downloadAsZips, downloadSingle } from "@/lib/client/zip";
import { formatDateTime } from "@/lib/format";
import { Lightbox } from "@/components/lightbox";
import { Button, EmptyState, Notice, Select, cx } from "@/components/ui";

export type ManagedPhoto = {
  id: string;
  guestId: string;
  guestName: string;
  thumbUrl: string;
  displayUrl: string;
  uploadedAt: string;
  status: "pending" | "approved" | "rejected";
  flagged: boolean;
  source: string;
};

type Filter = "all" | "pending" | "approved" | "rejected" | "flagged";

export function PhotoManager({
  eventId,
  title,
  timezone,
  photos,
  guests,
  initialGuest,
  requireApproval,
}: {
  eventId: string;
  title: string;
  timezone: string;
  photos: ManagedPhoto[];
  guests: { id: string; label: string }[];
  initialGuest: string;
  requireApproval: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(photos.some((p) => p.status === "pending") ? "pending" : "all");
  const [guest, setGuest] = useState(initialGuest);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const counts = useMemo(
    () => ({
      all: photos.length,
      pending: photos.filter((p) => p.status === "pending").length,
      approved: photos.filter((p) => p.status === "approved").length,
      rejected: photos.filter((p) => p.status === "rejected").length,
      flagged: photos.filter((p) => p.flagged).length,
    }),
    [photos],
  );

  const visible = useMemo(() => {
    const fromT = from ? new Date(from).getTime() : -Infinity;
    const toT = to ? new Date(to).getTime() + 86_400_000 : Infinity;
    return photos.filter((p) => {
      if (filter === "flagged" ? !p.flagged : filter !== "all" && p.status !== filter) return false;
      if (guest && p.guestId !== guest) return false;
      const t = new Date(p.uploadedAt).getTime();
      return t >= fromT && t < toT;
    });
  }, [photos, filter, guest, from, to]);

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function act(ids: string[], change: Parameters<typeof moderatePhotos>[2], done: string) {
    start(async () => {
      const res = await moderatePhotos(eventId, ids, change);
      setMessage(res.ok ? { tone: "success", text: done } : { tone: "error", text: res.error });
      if (res.ok) setSelected(new Set());
    });
  }

  function remove(ids: string[]) {
    if (!window.confirm(`Delete ${ids.length === 1 ? "this photo" : `${ids.length} photos`} permanently? This can't be undone.`)) return;
    start(async () => {
      const res = await fetch(`/api/events/${eventId}/photos`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ tone: "error", text: json.message });
        return;
      }
      setMessage({ tone: "success", text: `Deleted ${json.deleted === 1 ? "1 photo" : `${json.deleted} photos`}.` });
      setSelected(new Set());
      setViewer(null);
      router.refresh();
    });
  }

  async function download(ids: string[]) {
    setMessage(null);
    try {
      setProgress("Preparing download");
      const res = await fetch(`/api/events/${eventId}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      if (json.files.length === 1) {
        await downloadSingle(json.files[0].url, `${title}-${json.files[0].name}`);
      } else {
        await downloadAsZips(title, json.files, (d, t) => setProgress(`Downloading ${d} of ${t}`));
      }
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Download failed." });
    } finally {
      setProgress(null);
    }
  }

  const ids = [...selected];
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "pending", label: "To review" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "flagged", label: "Flagged" },
  ];

  if (photos.length === 0) {
    return (
      <EmptyState title="No photos yet">
        Photos show up here as soon as guests take them. {requireApproval ? "Each one will wait for your approval." : ""}
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {filters.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cx(
              "h-9 rounded-full border px-3.5 text-[15px] font-semibold transition-colors",
              filter === f.value ? "border-ink bg-ink text-paper" : "border-line bg-card hover:border-ink/40",
            )}
          >
            {f.label} <span className="numeric opacity-70">{counts[f.value]}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Guest
          <Select value={guest} onChange={(e) => setGuest(e.target.value)}>
            <option value="">Everyone</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 rounded-control border border-line bg-card px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-12 rounded-control border border-line bg-card px-3" />
        </label>
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {progress && <Notice tone="info">{progress}</Notice>}

      <div className="sticky top-[61px] z-20 -mx-4 flex flex-wrap items-center gap-2 border-y border-line bg-paper/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-control sm:border">
        <label className="mr-2 flex items-center gap-2 text-[15px] font-semibold">
          <input
            type="checkbox"
            className="size-5 accent-cobalt"
            checked={allVisibleSelected}
            onChange={() =>
              setSelected(allVisibleSelected ? new Set() : new Set(visible.map((p) => p.id)))
            }
          />
          {selected.size ? `${selected.size} selected` : `Select all ${visible.length}`}
        </label>
        <Button size="sm" disabled={!selected.size || pending} onClick={() => act(ids, { moderation_status: "approved" }, "Approved.")}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" disabled={!selected.size || pending} onClick={() => act(ids, { moderation_status: "rejected" }, "Rejected. Guests won't see these.")}>
          Reject
        </Button>
        <Button size="sm" variant="secondary" disabled={!selected.size || pending} onClick={() => act(ids, { flagged: true }, "Flagged.")}>
          Flag
        </Button>
        <Button size="sm" variant="secondary" disabled={!selected.size || !!progress} onClick={() => download(ids)}>
          Download
        </Button>
        <Button size="sm" variant="danger" disabled={!selected.size || pending} onClick={() => remove(ids)}>
          Delete
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nothing matches">Try another status, guest or date.</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((p, i) => (
            <li key={p.id} className={cx("group relative overflow-hidden rounded-control border-2 bg-card", selected.has(p.id) ? "border-cobalt" : "border-transparent")}>
              <button className="block aspect-[3/4] w-full bg-paper-2" onClick={() => setViewer(i)} aria-label={`Open photo by ${p.guestName}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl} alt="" loading="lazy" className={cx("size-full object-cover", p.status === "rejected" && "opacity-40 grayscale")} />
              </button>
              <label className="absolute top-2 left-2 flex size-8 cursor-pointer items-center justify-center rounded-full bg-card/90 shadow">
                <input type="checkbox" className="size-5 accent-cobalt" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label="Select photo" />
              </label>
              <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                {p.status === "pending" && <span className="rounded bg-cobalt px-1.5 text-xs font-semibold text-white">To review</span>}
                {p.status === "rejected" && <span className="rounded bg-ink px-1.5 text-xs font-semibold text-paper">Rejected</span>}
                {p.flagged && <span className="rounded bg-signal px-1.5 text-xs font-semibold text-white">Flagged</span>}
              </div>
              <div className="px-2.5 py-2 text-sm">
                <p className="truncate font-semibold">{p.guestName}</p>
                <p className="text-graphite">{formatDateTime(p.uploadedAt, timezone)}{p.source === "library" ? ", from library" : ""}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewer !== null && (
        <Lightbox
          items={visible.map((p) => ({
            id: p.id,
            src: p.displayUrl,
            alt: `Photo by ${p.guestName}`,
            caption: `${p.guestName}, ${formatDateTime(p.uploadedAt, timezone)}`,
          }))}
          index={viewer}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
          actions={(item) => {
            const p = visible.find((x) => x.id === item.id)!;
            return (
              <>
                {p.status !== "approved" && (
                  <button className="h-10 rounded-full bg-cobalt px-4 font-semibold text-white" disabled={pending} onClick={() => act([p.id], { moderation_status: "approved" }, "Approved.")}>
                    Approve
                  </button>
                )}
                {p.status !== "rejected" && (
                  <button className="h-10 rounded-full bg-cream/10 px-4 font-semibold hover:bg-cream/20" disabled={pending} onClick={() => act([p.id], { moderation_status: "rejected" }, "Rejected.")}>
                    Reject
                  </button>
                )}
                <button className="hidden h-10 rounded-full bg-cream/10 px-4 font-semibold hover:bg-cream/20 sm:block" onClick={() => download([p.id])}>
                  Download
                </button>
                <button className="h-10 rounded-full bg-signal px-4 font-semibold text-white" disabled={pending} onClick={() => remove([p.id])}>
                  Delete
                </button>
              </>
            );
          }}
        />
      )}
    </div>
  );
}
