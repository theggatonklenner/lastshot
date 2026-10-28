import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

let cached: SupabaseClient<Database> | null = null;

/**
 * Service-role client. Bypasses RLS, so it is only used inside server routes
 * after the caller has been verified (guest token or organiser ownership).
 */
export function admin() {
  if (cached) return cached;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Missing SUPABASE_SECRET_KEY. See .env.example.");
  }
  cached = createClient<Database>(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const MEDIA_BUCKET = "event-media";
