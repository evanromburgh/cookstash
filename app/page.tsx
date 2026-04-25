import { getPublicEnvironment } from "@/lib/env";

export default function Home() {
  const { appEnvironment, supabaseUrl } = getPublicEnvironment();

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
      </main>
    </div>
  );
}
