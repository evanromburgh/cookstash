# Environment setup

Cookstash uses separate Supabase projects for development and production from day one.

## 1) Create Supabase projects

- Create one Supabase project for `development`.
- Create a separate Supabase project for `production`.
- Keep credentials isolated; do not share keys across environments.

## 2) Configure local development

1. Copy `.env.development.example` to `.env.local`.
2. Replace placeholder values with your development Supabase credentials.
3. Run `npm run dev`.

Next.js local dev loads `.env.local` and development-scoped values.

## 3) Configure production deployment

- Use `.env.production.example` as the reference for your production environment variables.
- Set these variables in your hosting provider's production environment (for example: Vercel production project settings).
- Do not commit production values to the repository.

## 4) Required variables

- `NEXT_PUBLIC_APP_ENV`: `development` or `production`
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL for the active environment
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key for the active environment
- `NEXT_PUBLIC_SITE_URL`: base URL used for auth email redirects
- `SUPABASE_SERVICE_ROLE_KEY`: Server-side key for privileged operations only

## 5) Supabase auth redirects

In Supabase Auth settings, add:

- `http://localhost:3000/auth/callback` for development.
- `https://your-production-domain/auth/callback` for production.

These are required for signup confirmation and password recovery links.

## 6) Security migration baseline

After linking your Supabase project locally, apply migrations:

```bash
npx supabase db push
```

This sets up RLS policies and feature flag infrastructure used by issue `#13`.

To link this workspace to your hosted project:

```bash
npx supabase login
npx supabase link --project-ref tbcjeoovhomafrpbepry
```

If login fails with permission errors, verify you are using a Supabase account with access to that project.

## Guardrails

- `.env*` files are ignored by git.
- Only `.env.example`, `.env.development.example`, and `.env.production.example` are committed.
- Local development should always run against development Supabase credentials.
