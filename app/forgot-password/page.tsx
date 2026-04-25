import Link from "next/link";
import { redirect } from "next/navigation";

import { getPublicEnvironment } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SearchParams = { [key: string]: string | string[] | undefined };

function readParam(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const error = readParam(searchParams, "error");
  const message = readParam(searchParams, "message");

  async function sendResetEmail(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "");
    const supabase = await createServerSupabaseClient();
    const { siteUrl } = getPublicEnvironment();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
    });

    if (resetError) {
      redirect(`/forgot-password?error=${encodeURIComponent(resetError.message)}`);
    }

    redirect("/forgot-password?message=Reset link sent. Check your email.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">Reset your password</h1>
      {message ? <p className="mt-4 rounded-md bg-emerald-100 p-3 text-sm">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-100 p-3 text-sm">{error}</p> : null}
      <form action={sendResetEmail} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input className="rounded border px-3 py-2" type="email" name="email" required />
        </label>
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Send reset link
        </button>
      </form>
      <p className="mt-5 text-sm">
        Back to <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
