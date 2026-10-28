import type { FilmLookId } from "@/lib/database.types";
export type ThemeId = "classic" | "vintage" | "minimal" | "custom";

export type CameraTheme = {
  id: ThemeId;
  name: string;
  description: string;
  /** Shell colour around the viewfinder */
  shell: string;
  /** Pixel filter applied to each shot */
  filter: "classic" | "vintage" | "none" | "bw" | "warm" | "cool" | "faded";
  grain: number; // 0..1
  vignette: number; // 0..1
};

export const THEMES: Record<ThemeId, CameraTheme> = {
  classic: {
    id: "classic",
    name: "Classic disposable",
    description: "Punchy colour, a touch of grain, warm flash.",
    shell: "#2546d8",
    filter: "classic",
    grain: 0.35,
    vignette: 0.25,
  },
  vintage: {
    id: "vintage",
    name: "Vintage film",
    description: "Faded blacks, warm highlights, heavier grain.",
    shell: "#7a5a3a",
    filter: "vintage",
    grain: 0.6,
    vignette: 0.45,
  },
  minimal: {
    id: "minimal",
    name: "Minimal digital",
    description: "True-to-life colour. No grain, no vignette.",
    shell: "#3a3b40",
    filter: "none",
    grain: 0,
    vignette: 0,
  },
  custom: {
    id: "custom",
    name: "Event colours",
    description: "Classic look with the camera in your event colour.",
    shell: "#2546d8",
    filter: "classic",
    grain: 0.35,
    vignette: 0.25,
  },
};

export function resolveTheme(id: string, accent: string): CameraTheme {
  const base = THEMES[(id as ThemeId) in THEMES ? (id as ThemeId) : "classic"];
  return base.id === "custom" ? { ...base, shell: accent } : base;
}


/** Looks guests can pick per shot when the organiser turns on the film roll picker. */
export const FILM_LOOKS: { id: FilmLookId; name: string; filter: CameraTheme["filter"]; grain: number; vignette: number; css: string }[] = [
  { id: "classic", name: "Classic", filter: "classic", grain: 0.35, vignette: 0.25, css: "contrast(1.1) saturate(1.18) brightness(1.03)" },
  { id: "vintage", name: "Vintage", filter: "vintage", grain: 0.6, vignette: 0.45, css: "sepia(0.35) contrast(0.88) brightness(1.06)" },
  { id: "bw", name: "Black and white", filter: "bw", grain: 0.5, vignette: 0.35, css: "grayscale(1) contrast(1.2)" },
  { id: "warm", name: "Golden hour", filter: "warm", grain: 0.3, vignette: 0.3, css: "sepia(0.25) saturate(1.3) hue-rotate(-8deg) brightness(1.05)" },
  { id: "cool", name: "Cool blue", filter: "cool", grain: 0.3, vignette: 0.25, css: "saturate(0.9) hue-rotate(12deg) brightness(1.02)" },
  { id: "faded", name: "Faded", filter: "faded", grain: 0.45, vignette: 0.2, css: "contrast(0.78) saturate(0.7) brightness(1.1)" },
  { id: "true", name: "True colour", filter: "none", grain: 0, vignette: 0, css: "none" },
];

export function filmLook(id: string) {
  return FILM_LOOKS.find((l) => l.id === id) ?? null;
}

/** The event's camera with a guest-chosen look applied (the camera colour stays the event's). */
export function withLook(theme: CameraTheme, id: string | null | undefined): CameraTheme {
  const look = id ? filmLook(id) : null;
  return look ? { ...theme, filter: look.filter, grain: look.grain, vignette: look.vignette } : theme;
}
