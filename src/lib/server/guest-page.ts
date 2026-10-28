import "server-only";
import { getUser } from "@/lib/supabase/server";
import { getEventByCode, getGuestForEvent } from "@/lib/server/guest";
import { signOne } from "@/lib/server/media";
import { acceptingSubmissions, galleryAccess } from "@/lib/rules";

/** Everything a guest page needs to decide what to show. */
export async function loadGuestContext(code: string) {
  const event = await getEventByCode(code);
  if (!event) return null;
  const [{ user }, guest] = await Promise.all([getUser(), getGuestForEvent(event, code)]);
  const isOwner = !!user && user.id === event.owner_id;
  if (event.status === "draft" && !isOwner) return null;
  const isGuest = !!guest && !guest.blocked;
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
  };
}
