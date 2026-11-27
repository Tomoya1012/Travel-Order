# Repository guidance

## Project map

- This is the Municipality of Anda Online Travel Order System: a React, TypeScript, and Vite frontend backed by Supabase Auth and PostgreSQL.
- `src/App.tsx` owns the home, tracking, and admin routes. Public application, tracking, and admin screens live in `src/components/`.
- `src/services/travelOrderService.ts` is the frontend's Supabase boundary; shared models are in `src/types/travelOrder.ts`.
- `supabase/schema.sql` is the full schema reference; incremental hosted database changes belong in `supabase/migrations/`.
- `.github/workflows/supabase-migrations.yml` applies migrations on `main` after the one-time baseline is recorded and the `SUPABASE_MIGRATIONS_READY` Actions variable is enabled.
- `src/styles.css` contains responsive and print layouts. Keep name-search results readable on mobile as cards and on larger screens as a table.

## Security invariants

- Preserve applicant-name search. The public name-search RPC may return only a reference number, applicant name, status, and submission date. Never return a tracking token, database ID, or full travel details from name search.
- A tracking token is a bearer credential. Do not put it in search results, logs, analytics, or public URLs other than the private tracking link intentionally issued to the applicant.
- Full application details and correction resubmission require the private tracking token. Approved Travel Orders may be printed from name-search results through the narrow, audited print RPC, which returns only fields required for the official document.
- Never put a Supabase `service_role` key or a deployment proxy credential in frontend code, tracked files, build output, or examples. Use ignored local environment files for local credentials; `.env.example` must contain placeholders only.
- `SECURITY DEFINER` RPCs must use a fixed `search_path`, validate input, and enforce the caller's authorization internally. Explicitly revoke default `PUBLIC` execution and grant only the intended roles.
- Keep direct table access protected by RLS. Admin mutations belong in guarded RPCs, and audit records are written by the database functions.
- New-submission desktop alerts use a private Supabase Realtime Broadcast channel restricted to active admins. The event may contain only the reference number; never broadcast the tracking token or full travel-order row.
- CSV exports must continue escaping spreadsheet formula prefixes.
- Never deploy or change hosted Supabase state unless the user explicitly requests it. SQL changes in `supabase/schema.sql` are not live until applied to the hosted project.
- When staging future SQL in `supabase/pending_migrations/`, move it into `supabase/migrations/` only after confirming the hosted baseline, and give it a timestamp later than the latest recorded migration.

## Working and verification

- Install dependencies with `npm install` and run the development server with `npm run dev`.
- Run the production type-check and bundle with `npm run build` (`tsc && vite build`). There is no test script currently defined in `package.json`.
- Netlify and Vercel serve the Vite `dist` output. `deploy.bat` uses the authenticated Netlify CLI to trigger a build from the GitHub-connected production branch; it does not upload uncommitted local files.
- Update this guide when architecture, security boundaries, deployment behavior, or key product constraints change so future coding sessions have a reliable handoff.

## Current handoff

- Name search remains enabled and can print approved Travel Orders without the private token; full details and correction requests still require the tracking link/token.
- The current local mobile improvement renders name-search matches as compact cards below 640px; larger screens retain the table.
- The admin dashboard supports Chrome desktop notifications for newly submitted applications. The live feed requires the matching notification migration to be applied to hosted Supabase.
- The hosted production schema was captured in `supabase/migrations/20261127021044_remote_schema.sql`; `supabase migration list --remote` confirmed this baseline is recorded locally and remotely.
- The notification SQL is in `supabase/migrations/20261127021200_admin_submission_notifications.sql`, ordered after the baseline. It has not been applied to the hosted database.
- `.github/workflows/supabase-migrations.yml` is prepared for `main` and `SUPABASE_MIGRATIONS_READY=true` is configured. Local `npm run build` and `supabase migration list --remote` passed; changes remain uncommitted locally with no GitHub push yet.
- Docker Desktop and WSL were installed locally to support the schema pull. If Docker/WSL reports an update is pending, restart the PC before using the CLI again.
