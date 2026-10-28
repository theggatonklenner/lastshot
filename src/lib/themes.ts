export type ThemeId = "classic" | "vintage" | "minimal" | "custom";

export type CameraTheme = {
  id: ThemeId;
  name: string;
  description: string;
  /** Shell colour around the viewfinder */
  shell: string;
  /** Pixel filter applied to each shot */
  filter: "classic" | "vintage" | "none";
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
