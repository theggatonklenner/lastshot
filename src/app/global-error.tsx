"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client/report-error";

/** Last-resort screen when the root layout itself fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, { digest: error.digest });
  }, [error]);
  return (
    <html lang="en-AU">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f3f4f0", color: "#16171a" }}>
        <h1 style={{ fontSize: 32 }}>The film jammed</h1>
        <p>Something went wrong loading Lastshot. Your photos are safe.</p>
        <button onClick={reset} style={{ padding: "12px 20px", borderRadius: 12, border: 0, background: "#2546d8", color: "#fff", fontWeight: 600 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
