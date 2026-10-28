import Link from "next/link";
import { CameraArt } from "@/components/camera-art";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <header>
          <Link href="/" aria-label="Lastshot home" className="self-start">
            <Logo />
          </Link>
        </header>
        <main className="flex flex-1 items-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
      <div className="hidden items-center justify-center bg-body p-12 lg:flex" aria-hidden>
        <CameraArt count={27} className="rotate-[6deg]" />
      </div>
    </div>
  );
}
