import type { Metadata, Viewport } from "next";
import { getEventByCode } from "@/lib/server/guest";

// Guest screens are charcoal, so the iPhone status bar and browser chrome match.
export const viewport: Viewport = {
  themeColor: "#1d1e21",
};

export async function generateMetadata({ params }: LayoutProps<"/e/[code]">): Promise<Metadata> {
  const { code } = await params;
  const event = await getEventByCode(code);
  if (!event || event.status === "draft") return {};
  return {
    // Each event gets its own home screen app that opens straight to the event.
    manifest: `/e/${code}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: event.title.length > 20 ? "Lastshot" : event.title,
      statusBarStyle: "black-translucent",
    },
  };
}

export default function GuestLayout({ children }: LayoutProps<"/e/[code]">) {
  return <div className="min-h-dvh overscroll-none bg-body">{children}</div>;
}
