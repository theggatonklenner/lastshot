import "server-only";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";

/**
 * Site admin gate. Checks the database flag (confirmed account + is_admin) on
 * every request. Non-admins get a 404 so the admin area isn't advertised.
 */
export async function requireAdmin() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/admin");
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();
  return { supabase, user };
}

/** Same check for server actions; throws instead of redirecting. */
export async function assertAdmin() {
  const { supabase, user } = await getUser();
  if (!user) throw new Error("Sign in again.");
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) throw new Error("Not allowed.");
  return { supabase, user };
}
