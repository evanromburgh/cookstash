import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  async function signOut() {
    "use server";

    const authClient = await createServerSupabaseClient();
    await authClient.auth.signOut();
    redirect("/login?message=You have been signed out.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-12">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-3 text-sm text-zinc-600">Signed in as {user.email}</p>
      <p className="mt-8 rounded-md bg-zinc-100 p-4 text-sm dark:bg-zinc-800">
        Protected page access is active. Unauthenticated users are redirected to sign in.
      </p>
      <form action={signOut} className="mt-6">
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
