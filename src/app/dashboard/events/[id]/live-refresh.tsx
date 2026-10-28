"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { browserClient } from "@/lib/supabase/browser";

/**
 * Subscribes to this event's photo and guest changes over Supabase Realtime
 * (RLS limits it to the owner) and refreshes the server-rendered dashboard.
 */
export function LiveRefresh({ eventId }: { eventId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = browserClient();
    const schedule = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        router.refresh();
      }, 1500);
    };
    const channel = supabase
      .channel(`event-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "photos", filter: `event_id=eq.${eventId}` }, schedule)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_guests", filter: `event_id=eq.${eventId}` },
        schedule,
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  return null;
}
