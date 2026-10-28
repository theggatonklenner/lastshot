import { LinkButton, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-5 px-5">
      <Logo />
      <h1 className="display text-5xl">Nothing on this frame</h1>
      <p className="text-lg text-graphite">This page doesn&apos;t exist. If you followed a link to an event, check it with the organiser.</p>
      <LinkButton href="/">Go to the home page</LinkButton>
    </main>
  );
}
