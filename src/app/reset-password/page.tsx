import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { Logo } from "@/components/ui";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage() {
  const { user } = await getUser();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <Link href="/" aria-label="Lastshot home" className="self-start">
        <Logo />
      </Link>
      {user ? (
        <>
          <div>
            <h1 className="display-md mb-2 text-4xl">Choose a new password</h1>
            <p className="text-graphite">For {user.email}.</p>
          </div>
          <NewPasswordForm />
        </>
      ) : (
        <>
          <h1 className="display-md text-4xl">That link has expired</h1>
          <p className="text-graphite">Reset links work once, for one hour. Request a new one.</p>
          <Link href="/forgot-password" className="font-semibold text-cobalt hover:underline">
            Send a new reset link
          </Link>
        </>
      )}
    </main>
  );
}
