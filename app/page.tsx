import Link from "next/link";

export default function Home() {
  const appEnvironment = process.env.NEXT_PUBLIC_APP_ENV ?? "not configured";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "not configured";
  const envReady =
    appEnvironment !== "not configured" && supabaseUrl !== "not configured";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-16 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Cookstash bootstrap complete
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Next.js + Supabase foundation</h1>
        <p className="mt-4 text-zinc-700 dark:text-zinc-300">
          This workspace is configured for strict environment separation so local development uses
          development credentials only.
        </p>
        <div className="mt-8 grid gap-3 rounded-xl bg-zinc-100 p-4 text-sm dark:bg-zinc-800">
          <div className="flex justify-between gap-4">
            <span className="font-medium">Active app environment</span>
            <span>{appEnvironment}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="font-medium">Supabase URL</span>
            <span className="truncate">{supabaseUrl}</span>
          </div>
        </div>
        {!envReady ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Copy <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">.env.development.example</code> to{" "}
            <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">.env.local</code>, fill in your Supabase
            anon and service keys from the project dashboard, then restart{" "}
            <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">npm run dev</code>. After that, sign in
            and open <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">/dashboard</code> for recipes
            and lists.
          </p>
        ) : null}
        <div className="mt-6 flex gap-3">
          <Link className="rounded bg-black px-4 py-2 text-sm text-white" href="/signup">
            Create account
          </Link>
          <Link className="rounded border px-4 py-2 text-sm" href="/login">
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
