import "server-only";
import { isEventOrganiser } from "@/lib/server/organiser";
import { getUser } from "@/lib/supabase/server";
import { getEventByCode, getGuestForEvent, hasViewPass } from "@/lib/server/guest";
import { signOne } from "@/lib/server/media";
import { acceptingSubmissions, galleryAccess } from "@/lib/rules";

/** Everything a guest page needs to decide what to show. */
export async function loadGuestContext(code: string) {
  const event = await getEventByCode(code);
  if (!event) return null;
  const [{ user }, guest, pass] = await Promise.all([getUser(), getGuestForEvent(event, code), hasViewPass(event, code)]);
  // Organisers (owner or co-organiser) can always preview and see everything.
  const isOwner = await isEventOrganiser(event, user?.id);
  if (event.status === "draft" && !isOwner) return null;
  const isGuest = (!!guest && !guest.blocked) || pass;
  const access = galleryAccess(event, { isOwner, isGuest });
  // Show a gallery link when it's open, or when it will open for this person.
  const galleryVisibleLater =
    event.gallery_visibility !== "private" && (event.gallery_visibility === "public" || isGuest || isOwner);
  return {
    event,
    guest,
    isOwner,
    accepting: acceptingSubmissions(event),
    access,
    galleryHref: access.allowed || galleryVisibleLater ? `/e/${code}/gallery` : null,
    coverUrl: await signOne(event.cover_image_path),
    brand: event.addon_branding ? { logoUrl: await signOne(event.brand_logo_path) } : null,
  };
}
