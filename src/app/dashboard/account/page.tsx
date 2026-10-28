import type { Metadata } from "next";
import { requireOrganiser } from "@/lib/server/organiser";
import { AccountForms } from "./account-forms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { supabase, user } = await requireOrganiser("/dashboard/account");
  const [{ data: profile }, { count: owned }] = await Promise.all([
    supabase.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle(),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
  ]);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="display-md text-4xl">Account</h1>
      <AccountForms
        email={user.email ?? profile?.email ?? ""}
        displayName={profile?.display_name ?? ""}
        ownedEvents={owned ?? 0}
      />
    </div>
  );
}
