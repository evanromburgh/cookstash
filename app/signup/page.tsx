import Link from "next/link";
import { redirect } from "next/navigation";

import { getPublicEnvironment } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SearchParams = { [key: string]: string | string[] | undefined };

function readParam(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const error = readParam(searchParams, "error");

  async function signup(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const supabase = await createServerSupabaseClient();
    const { siteUrl } = getPublicEnvironment();

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback?next=/dashboard`,
      },
    });

    if (signUpError) {
      redirect(`/signup?error=${encodeURIComponent(signUpError.message)}`);
    }

    redirect("/login?message=Check your email to confirm your account.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">Create your Cookstash account</h1>
      {error ? <p className="mt-4 rounded-md bg-red-100 p-3 text-sm">{error}</p> : null}
      <form action={signup} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input className="rounded border px-3 py-2" type="email" name="email" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            className="rounded border px-3 py-2"
            type="password"
            name="password"
            minLength={8}
            required
          />
        </label>
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Create account
        </button>
      </form>
      <p className="mt-5 text-sm">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
