import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="display-md mb-2 text-4xl">Create an account</h1>
      <p className="mb-8 text-graphite">Organisers need an account. Guests never do.</p>
      <AuthForm mode="signup" />
    </>
  );
}
