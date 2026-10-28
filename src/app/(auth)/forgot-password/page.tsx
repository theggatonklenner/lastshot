import type { Metadata } from "next";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="display-md mb-2 text-4xl">Reset your password</h1>
      <p className="mb-8 text-graphite">Enter the email you signed up with and we&apos;ll send you a link to choose a new password.</p>
      <ResetRequestForm />
    </>
  );
}
