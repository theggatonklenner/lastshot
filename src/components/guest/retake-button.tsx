"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { guestToken } from "@/lib/client/upload-queue";

/** "Blinked? Retake your last shot" on the finished-roll page. */
export function RetakeButton({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-5 flex flex-col gap-2">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const token = guestToken(code);
          const res = await fetch(`/api/e/${code}/retake`, { method: "POST", headers: token ? { "x-lastshot-guest": token } : {} }).catch(
            () => null,
          );
          const j = res ? await res.json().catch(() => ({})) : {};
          if (res?.ok) return router.push(`/e/${code}/camera`);
          setBusy(false);
          setError(j.message ?? "That didn't work. Check your connection and try again.");
        }}
        className="self-start font-semibold text-flash underline underline-offset-4 disabled:opacity-50"
      >
        {busy ? "Deleting your last shot…" : "Blinked? Retake your last shot"}
      </button>
      <p className="text-sm text-cream-dim">You get one retake. It deletes your most recent photo and gives the shot back.</p>
      {error && <p className="text-sm text-flash">{error}</p>}
    </div>
  );
}
