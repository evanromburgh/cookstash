import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type SearchParams = { [key: string]: string | string[] | undefined };

function readParam(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const error = readParam(searchParams, "error");
  const message = readParam(searchParams, "message");
  const next = readParam(searchParams, "next") ?? "/dashboard";

  async function login(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const redirectTarget = String(formData.get("next") ?? "/dashboard");
    const supabase = await createServerSupabaseClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      redirect(`/login?error=${encodeURIComponent(signInError.message)}`);
    }

    redirect(redirectTarget);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">Sign in to Cookstash</h1>
      {message ? <p className="mt-4 rounded-md bg-emerald-100 p-3 text-sm">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-100 p-3 text-sm">{error}</p> : null}
      <form action={login} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input className="rounded border px-3 py-2" type="email" name="email" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input className="rounded border px-3 py-2" type="password" name="password" required />
        </label>
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Sign in
        </button>
      </form>
      <div className="mt-5 flex justify-between text-sm">
        <Link href="/signup">Create account</Link>
        <Link href="/forgot-password">Forgot password?</Link>
      </div>
    </main>
  );
}
