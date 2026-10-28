import type { Metadata } from "next";
import { Camera } from "@/components/camera/camera";
import { resolveTheme } from "@/lib/themes";

export const metadata: Metadata = {
  title: "Try the camera",
  description: "Try the Lastshot camera. Nothing you take here is uploaded.",
};

export default async function TryPage({ searchParams }: PageProps<"/try">) {
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const theme = str(sp.theme) ?? "classic";
  const accent = /^#[0-9a-f]{6}$/i.test(str(sp.accent) ?? "") ? str(sp.accent)! : "#2546d8";
  const shots = Math.min(100, Math.max(1, Number(str(sp.shots)) || 8));
  const title = (str(sp.title) ?? "Demo roll").slice(0, 120);
  const back = str(sp.back)?.startsWith("/dashboard/") ? str(sp.back)! : "/";

  return (
    <Camera
      demo
      code="demo"
      title={title}
      theme={resolveTheme(theme, accent)}
      dateStamp={str(sp.stamp) !== "0"}
      limit={shots}
      initialUsed={0}
      allowLibrary
      exitHref={back}
      doneHref={back}
    />
  );
}
