import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const email = typeof sp.email === "string" ? sp.email.slice(0, 254) : undefined;
  return (
    <>
      <h1 className="display-md mb-2 text-4xl">Create an account</h1>
      <p className="mb-8 text-graphite">Organisers need an account. Guests never do.</p>
      <AuthForm mode="signup" next={next} defaultEmail={email} />
    </>
  );
}
