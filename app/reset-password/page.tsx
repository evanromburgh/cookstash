import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type SearchParams = { [key: string]: string | string[] | undefined };

function readParam(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const error = readParam(searchParams, "error");
  const message = readParam(searchParams, "message");

  async function updatePassword(formData: FormData) {
    "use server";

    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      redirect("/reset-password?error=Passwords do not match.");
    }

    const supabase = await createServerSupabaseClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      redirect(`/reset-password?error=${encodeURIComponent(updateError.message)}`);
    }

    redirect("/login?message=Password updated. You can sign in now.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">Set a new password</h1>
      {message ? <p className="mt-4 rounded-md bg-emerald-100 p-3 text-sm">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-100 p-3 text-sm">{error}</p> : null}
      <form action={updatePassword} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          New password
          <input
            className="rounded border px-3 py-2"
            type="password"
            name="password"
            minLength={8}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Confirm password
          <input
            className="rounded border px-3 py-2"
            type="password"
            name="confirmPassword"
            minLength={8}
            required
          />
        </label>
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Update password
        </button>
      </form>
    </main>
  );
}
