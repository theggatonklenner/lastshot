"use server";

import { redirect } from "next/navigation";
import { admin } from "@/lib/supabase/admin";
import { EVENT_CODE_RE, hashToken, isTokenShape } from "@/lib/server/guest";

export async function unsubscribe(form: FormData) {
  const code = String(form.get("code") ?? "");
  const token = String(form.get("token") ?? "");
  if (!EVENT_CODE_RE.test(code) || !isTokenShape(token)) redirect("/");
  await admin()
    .from("guest_emails")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("view_token_hash", hashToken(token))
    .is("unsubscribed_at", null);
  redirect(`/e/${code}/unsubscribe/${token}?done=1`);
}
