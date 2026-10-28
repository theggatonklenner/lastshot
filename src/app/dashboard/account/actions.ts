"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getUser } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { deleteAccountCompletely } from "@/lib/server/cleanup";

export type AccountState = { error?: string; notice?: string } | undefined;

async function signedIn() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/dashboard/account");
  return { supabase, user };
}

export async function saveName(_prev: AccountState, form: FormData): Promise<AccountState> {
  const { supabase, user } = await signedIn();
  const name = String(form.get("displayName") ?? "").trim().slice(0, 80) || null;
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
  return error ? { error: "Your name wasn't saved. Try again." } : { notice: "Name saved." };
}

export async function changeEmail(_prev: AccountState, form: FormData): Promise<AccountState> {
  const { supabase, user } = await signedIn();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { error: "Enter a valid email address." };
  if (email === user.email?.toLowerCase()) return { error: "That's already your email." };
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard/account` },
  );
  if (error) return { error: error.message };
  return { notice: `Check ${email} for a confirmation link. Your email changes once you click it.` };
}

export async function changePassword(_prev: AccountState, form: FormData): Promise<AccountState> {
  const { user } = await signedIn();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (next.length < 8) return { error: "Use at least 8 characters for your new password." };
  if (next !== confirm) return { error: "The two new passwords don't match." };

  // Check the current password before changing it.
  const supabase = await createClient();
  const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email!, password: current });
  if (checkError) return { error: "Your current password isn't right." };
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };
  return { notice: "Password changed." };
}

export async function deleteMyAccount(_prev: AccountState, form: FormData): Promise<AccountState> {
  const { supabase, user } = await signedIn();
  const typed = String(form.get("confirmEmail") ?? "").trim().toLowerCase();
  if (typed !== user.email?.toLowerCase()) return { error: "Type your email exactly to confirm." };
  try {
    await deleteAccountCompletely(user.id);
  } catch (e) {
    console.error("account delete failed", e);
    return { error: "Your account wasn't deleted. Try again, or contact us." };
  }
  await supabase.auth.signOut();
  redirect("/?account=deleted");
}
