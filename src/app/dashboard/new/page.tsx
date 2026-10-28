import type { Metadata } from "next";
import { Wizard } from "./wizard";

export const metadata: Metadata = { title: "New event" };

export default function NewEventPage() {
  return <Wizard />;
}
