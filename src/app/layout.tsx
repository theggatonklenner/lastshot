import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/standard.css";
import "./globals.css";
import { siteUrl } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Lastshot", template: "%s | Lastshot" },
  description:
    "A disposable camera for your event. Guests scan a QR code, shoot a limited roll on their phone, and every photo lands in one shared gallery.",
  applicationName: "Lastshot",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f4f0",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
