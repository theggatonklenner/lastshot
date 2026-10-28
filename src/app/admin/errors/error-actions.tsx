"use client";

import { useTransition } from "react";
import { resolveError } from "@/app/admin/actions";
import { Button } from "@/components/ui";

export function ErrorActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" pending={pending} onClick={() => start(async () => void (await resolveError(id)))}>
      Mark fixed
    </Button>
  );
}
