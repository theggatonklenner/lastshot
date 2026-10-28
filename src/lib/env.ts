function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseKey: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
};

/** Public contact address shown in the terms and privacy notice. */
export const CONTACT_EMAIL = "support@lastshot.app";

/** The public home of the app. QR codes, share links and emails all point here. */
export const PRODUCTION_URL = "https://lastshot.app";

export function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  // Vercel production deployments always use the real domain, never the *.vercel.app address.
  if (process.env.VERCEL_ENV === "production") return PRODUCTION_URL;
  // Preview deployments use their own address so test QR codes work.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function guestUrl(code: string): string {
  return `${siteUrl()}/e/${code}`;
}

/** The link guests use: the event's custom link when it has one, otherwise /e/<code>. */
export function eventUrl(e: { code: string; addon_link?: boolean; custom_slug?: string | null }): string {
  return e.addon_link && e.custom_slug ? `${siteUrl()}/${e.custom_slug}` : guestUrl(e.code);
}
