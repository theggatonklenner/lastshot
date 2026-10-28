import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <>
      <h1 className="display-md mb-2 text-4xl">Welcome back</h1>
      <p className="mb-8 text-graphite">Sign in to manage your events.</p>
      <AuthForm
        mode="login"
        next={next}
        linkError={sp.error === "link"}
        defaultEmail={typeof sp.email === "string" ? sp.email.slice(0, 254) : undefined}
      />
    </>
  );
}
