# Repository guidance

## Project map

- This is the Municipality of Anda Online Travel Order System: a React, TypeScript, and Vite frontend backed by Supabase Auth and PostgreSQL.
- `src/App.tsx` owns the home, tracking, and admin routes. Public application, tracking, and admin screens live in `src/components/`.
- `src/services/travelOrderService.ts` is the frontend's Supabase boundary; shared models are in `src/types/travelOrder.ts`.
- `supabase/schema.sql` defines tables, RLS policies, RPCs, grants, workflow transitions, and travel-order numbering.
- `src/styles.css` contains responsive and print layouts. Keep name-search results readable on mobile as cards and on larger screens as a table.

## Security invariants

- Preserve applicant-name search. The public name-search RPC may return only a reference number, applicant name, status, and submission date. Never return a tracking token, database ID, or full travel details from name search.
- A tracking token is a bearer credential. Do not put it in search results, logs, analytics, or public URLs other than the private tracking link intentionally issued to the applicant.
- Full application details and correction resubmission require the private tracking token. Approved Travel Orders may be printed from name-search results through the narrow, audited print RPC, which returns only fields required for the official document.
- Never put a Supabase `service_role` key or a deployment proxy credential in frontend code, tracked files, build output, or examples. Use ignored local environment files for local credentials; `.env.example` must contain placeholders only.
- `SECURITY DEFINER` RPCs must use a fixed `search_path`, validate input, and enforce the caller's authorization internally. Explicitly revoke default `PUBLIC` execution and grant only the intended roles.
- Keep direct table access protected by RLS. Admin mutations belong in guarded RPCs, and audit records are written by the database functions.
- CSV exports must continue escaping spreadsheet formula prefixes.
- Never deploy or change hosted Supabase state unless the user explicitly requests it. SQL changes in `supabase/schema.sql` are not live until applied to the hosted project.

## Working and verification

- Install dependencies with `npm install` and run the development server with `npm run dev`.
- Run the production type-check and bundle with `npm run build` (`tsc && vite build`). There is no test script currently defined in `package.json`.
- Netlify and Vercel serve the Vite `dist` output. `deploy.bat` uses the authenticated Netlify CLI to trigger a build from the GitHub-connected production branch; it does not upload uncommitted local files.
- Update this guide when architecture, security boundaries, deployment behavior, or key product constraints change so future coding sessions have a reliable handoff.

## Current handoff

- Name search remains enabled and can print approved Travel Orders without the private token; full details and correction requests still require the tracking link/token.
- The current local mobile improvement renders name-search matches as compact cards below 640px; larger screens retain the table.
