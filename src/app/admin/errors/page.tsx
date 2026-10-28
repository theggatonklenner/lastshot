import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/admin-auth";
import { admin } from "@/lib/supabase/admin";
import { emailConfigured } from "@/lib/server/email";
import { formatDateTime } from "@/lib/format";
import { EmptyState, Notice } from "@/components/ui";
import { ErrorActions } from "./error-actions";

export const metadata: Metadata = { title: "Errors" };

export default async function AdminErrors({ searchParams }: PageProps<"/admin/errors">) {
  await requireAdmin();
  const sp = await searchParams;
  const showResolved = sp.all === "1";
  let q = admin().from("app_errors").select("*").order("last_seen_at", { ascending: false }).limit(100);
  if (!showResolved) q = q.is("resolved_at", null);
  const { data: errors } = await q;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display-md text-4xl">Errors</h1>
        <a href={showResolved ? "/admin/errors" : "/admin/errors?all=1"} className="font-semibold text-cobalt hover:underline">
          {showResolved ? "Hide resolved" : "Show resolved too"}
        </a>
      </div>
      <p className="max-w-2xl text-graphite">
        Crashes on the server and in visitors&apos; browsers. Repeats are grouped. Admins get an email the first time an
        error appears, and again if it keeps happening after a quiet hour.
      </p>
      {!emailConfigured() && <Notice tone="warn">Email isn&apos;t set up, so error alerts can&apos;t be emailed.</Notice>}

      {!errors?.length ? (
        <EmptyState title="No errors">Nothing has gone wrong recently.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {errors.map((e) => (
            <li key={e.id} className={`rounded-panel border bg-card p-4 ${e.resolved_at ? "border-line opacity-60" : "border-line"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">{e.message}</p>
                  <p className="mt-1 text-sm text-graphite">
                    {e.source === "server" ? "Server" : "Browser"}
                    {e.path ? `, ${e.path}` : ""}, {e.count} {e.count === 1 ? "time" : "times"}, last{" "}
                    {formatDateTime(e.last_seen_at, "Australia/Sydney")}
                    {e.digest ? `, digest ${e.digest}` : ""}
                  </p>
                </div>
                {!e.resolved_at && <ErrorActions id={e.id} />}
              </div>
              {e.detail && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-cobalt">Details</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-paper-2 p-3 text-xs whitespace-pre-wrap">{e.detail}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
