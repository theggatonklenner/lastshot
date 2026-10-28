import type { MetadataRoute } from "next";

/** Lets organisers and guests add Lastshot to their home screen with the camera icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lastshot",
    short_name: "Lastshot",
    description: "A disposable camera for your event.",
    start_url: "/",
    display: "standalone",
    background_color: "#1d1e21",
    theme_color: "#2546d8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
