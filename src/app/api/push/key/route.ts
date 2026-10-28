import { pushKeys } from "@/lib/server/push";

export const dynamic = "force-dynamic";

/** The public web push key browsers need to subscribe. */
export async function GET() {
  const { publicKey } = await pushKeys();
  return Response.json({ publicKey }, { headers: { "cache-control": "public, max-age=3600" } });
}
