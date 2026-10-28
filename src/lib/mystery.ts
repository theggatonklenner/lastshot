/** Surprise prompts for the mystery shot. Each guest gets one, picked from their camera ID. */
export const MYSTERY_PROMPTS = [
  "Photograph whoever is closest to you right now",
  "Get a photo of someone laughing",
  "Find the best-dressed person here",
  "Capture the dance floor",
  "Take a photo with someone you met tonight",
  "Snap the host when they're not looking",
  "Get a group shot of your table",
  "Find something gold, sparkly or shiny",
  "Photograph a pair of great shoes",
  "Capture a hug",
  "Get the oldest and youngest person in one shot",
  "Take a photo from a strange angle",
  "Find someone doing their best pose",
  "Capture the best thing on the dessert table",
  "Photograph the view from where you're standing",
];

/** The organiser's prompt if they set one, otherwise a stable random prompt for this guest. */
export function mysteryPromptFor(eventPrompt: string | null | undefined, guestId: string): string {
  if (eventPrompt?.trim()) return eventPrompt.trim();
  let h = 0;
  for (const c of guestId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MYSTERY_PROMPTS[h % MYSTERY_PROMPTS.length];
}
