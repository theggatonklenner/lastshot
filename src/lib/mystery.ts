/** Surprise challenges for the mystery shot. Each guest gets one, picked from their camera ID. */
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

export const MAX_CHALLENGES = 20;
export const MAX_CHALLENGE_LENGTH = 120;

/** The organiser's challenges, stored one per line. */
export function parseChallenges(stored: string | null | undefined): string[] {
  return (stored ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_CHALLENGES);
}

export function joinChallenges(list: string[]): string | null {
  const clean = list.map((s) => s.trim().slice(0, MAX_CHALLENGE_LENGTH)).filter(Boolean).slice(0, MAX_CHALLENGES);
  return clean.length ? clean.join("\n") : null;
}

/** Challenges guests can land on: the organiser's own, or ours if they didn't add any. */
export function challengePool(stored: string | null | undefined): string[] {
  const own = parseChallenges(stored);
  return own.length ? own : MYSTERY_PROMPTS;
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** A stable random challenge for this guest from the pool. */
export function mysteryPromptFor(stored: string | null | undefined, guestId: string): string {
  const pool = challengePool(stored);
  return pool[hash(guestId) % pool.length];
}

/**
 * Up to 8 challenges for the spin wheel, always including the guest's own.
 * The same guest always sees the same wheel.
 */
export function wheelFor(stored: string | null | undefined, guestId: string): { slices: string[]; winner: number } {
  const pool = challengePool(stored);
  const mine = mysteryPromptFor(stored, guestId);
  const others = pool.filter((p) => p !== mine);
  // Deterministic shuffle so the wheel doesn't change between visits.
  let seed = hash(`${guestId}:wheel`) || 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const slices = others.slice(0, Math.min(7, others.length));
  const winner = Math.floor(rand() * (slices.length + 1));
  slices.splice(winner, 0, mine);
  // A wheel with one slice still spins; pad with repeats so it looks like a wheel.
  while (slices.length < 4) slices.push(slices[slices.length % Math.max(1, slices.length)]);
  return { slices, winner };
}
