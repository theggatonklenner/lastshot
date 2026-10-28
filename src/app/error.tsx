"use client";

import { useEffect } from "react";
import { Button, Logo } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-5 px-5">
      <Logo />
      <h1 className="display text-5xl">The film jammed</h1>
      <p className="text-lg text-graphite">
        Something went wrong loading this page. Your photos are safe. Try again, and if it keeps happening, reload the
        page.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
