## Cookstash

Cookstash is a mobile-first recipe and shopping workflow app built with Next.js and Supabase.

This repository is bootstrapped for issue `#2` with strict development/production environment separation from day one.

## Environment setup

Follow `docs/environment-setup.md` to configure Supabase projects and local env files.

Quick start for local development:

```bash
copy .env.development.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` - Runs local app with development env loading.
- `npm run build` - Production build (uses production env in CI/deploy).
- `npm run start` - Serves production build.
- `npm run lint` - Runs ESLint.

## Stack baseline

- Next.js (App Router)
- Supabase (`@supabase/supabase-js`)
- TypeScript
- Tailwind CSS

## Notes

- Local development should never use production Supabase credentials.
- `.env.local` is gitignored and intended for your development values only.
