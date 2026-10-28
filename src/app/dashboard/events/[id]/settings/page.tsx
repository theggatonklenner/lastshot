import type { Metadata } from "next";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { signOne } from "@/lib/server/media";
import { STATUS_LABEL, galleryRevealed } from "@/lib/rules";
import { Panel } from "@/components/ui";
import { LifecycleActions } from "../lifecycle";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/dashboard/events/[id]/settings">) {
  const { id } = await params;
  const { event } = await requireOwnedEvent(id);
  const coverUrl = await signOne(event.cover_image_path);
  return (
    <div className="flex flex-col gap-6">
      <Panel className="max-w-3xl">
        <h2 className="mb-1 text-xl font-bold">Event status</h2>
        <p className="mb-4 text-graphite">
          Currently: {STATUS_LABEL[event.status]}
          {event.submissions_closed_at && event.status !== "ended" ? ", new photos paused" : ""}.
        </p>
        <LifecycleActions event={event} revealed={galleryRevealed(event)} />
      </Panel>
      <SettingsForm event={event} coverUrl={coverUrl} />
    </div>
  );
}
