# Municipality of Anda — Online Travel Order Management System

A complete, production-ready Online Travel Order Management System built for the **Municipality of Anda, Pangasinan, Philippines**.

**Tech stack:** React 18 + Vite 6 + TypeScript · Supabase (PostgreSQL, Auth, RLS, RPCs) · Plain CSS (no extra framework) · Vercel / Netlify

---

## Application Workflow

1. **Applicant** opens the site, selects signing authority (**Municipal Mayor** or **Municipal Vice Mayor**).
2. Fills out the 10-field Travel Order Application Form and submits.
3. Application is saved to Supabase with status `PENDING REVIEW`, an official reference number (`ANDA-YYYY-XXXXXX`), and an unguessable private tracking link (`/track/<32-char-hex-token>`).
4. **HR / Admin** logs in via `/admin` (no public registration allowed).
5. HR / Admin actions: **1. START REVIEW** → **2. MARK AS VERIFIED** → **3. APPROVE** (generates Travel Order Number).
   - Or: **4. REQUEST CORRECTION** (applicant edits & resubmits via private link) · **5. REJECT** (requires reason).
6. Upon approval, Supabase atomically generates a unique sequential Travel Order Number in `SEQUENCE-YEAR` format (separate sequences for Mayor and Vice Mayor).
7. Both the **Applicant** (via private tracking link) and **HR / Admin** can click **PRINT TRAVEL ORDER** to print / save as PDF using the official Municipality of Anda templates.
8. Every action is logged in `audit_logs`. HR/Admin can export CSVs and a full JSON backup.

---

## 1. Supabase Setup

### A. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Keep the **Project URL** and **anon public key** handy (Settings → API).

### B. Run the SQL schema

1. Open **SQL Editor** in your Supabase Dashboard.
2. Paste and execute the entire contents of [`supabase/schema.sql`](supabase/schema.sql).
3. Verify these tables were created:
   - `public.travel_orders`
   - `public.admin_users`
   - `public.app_settings` (pre-seeded with JOGANIE C. RARANG / ERWIN C. CATABAY)
   - `public.audit_logs`

---

## 2. Create Your First HR / Admin Account

Public registration is **disabled**. Admin accounts must be created directly in Supabase:

1. In Supabase Dashboard → **Authentication → Users → Add user → Create new user**.
2. Enter email and password, check **Auto Confirm User**, click **Create user**.
3. Copy the new user's **User UID**.
4. In **SQL Editor**, run:

```sql
insert into public.admin_users (id, email, full_name, role, is_active)
values (
  'PASTE-USER-UUID-HERE',
  'hrmo@anda.gov.ph',
  'HRMO Administrator',
  'SUPER_ADMIN',
  true
);
```

---

## 3. Local Development

```bash
# 1. Copy and fill in environment variables
cp .env.example .env
# Edit .env:
# VITE_SUPABASE_URL=https://your-project-id.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

# 2. Install dependencies (already done if node_modules exists)
npm install

# 3. Start dev server
npm run dev
# → http://localhost:5173

# 4. Build for production
npm run build
```

> **Never** put the `service_role` key in `.env` or any frontend file.

---

## 4. Deploy to Vercel (Primary)

1. Push this folder to a GitHub / GitLab / Bitbucket repository.
2. Import the repo in [vercel.com](https://vercel.com).
3. Framework preset: **Vite** · Build command: `npm run build` · Output directory: `dist`.
4. Add Environment Variables in Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. The included `vercel.json` already rewrites all paths to `index.html` for SPA routing.

---

## 5. Deploy to Netlify (Compatible)

- `netlify.toml` is already included (build command, publish directory, SPA redirect).
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify → Site configuration → Environment variables.
- Deploy normally.

---

## 6. Travel Order Number Format

```
SEQUENCE-YEAR   e.g.  1617-2026
```

- Separate sequential counters for Mayor and Vice Mayor.
- Generated atomically in the database — no duplicates possible.
- Configurable starting sequence via Admin → Settings.
- Never assigned to unapproved or rejected applications.

---

## 7. Official Print Templates

The printable Travel Order matches the official Municipality of Anda Word templates:

- **Left logo:** Municipal Seal of Anda (`/assets/seal-anda.png`)
- **Right logo:** Human Resource Management Office logo (`/assets/logo-hrmo.png`)
- Document header: Republic of the Philippines / Province of Pangasinan / MUNICIPALITY OF ANDA
- All 9 form fields with underline formatting
- RECOMMENDED BY: `{Department Head}` — APPROVED BY: `{Mayor or Vice Mayor}`
- Mayor approval: **JOGANIE C. RARANG** · Municipal Mayor
- Vice Mayor approval: **ERWIN C. CATABAY** · Municipal Vice Mayor
- Both names are **configurable** in Admin → Settings (signatories update when officials change)

---

## 8. Security Architecture

| Concern | Solution |
|---|---|
| Public form submission | `security definer` RPC — bypasses RLS safely, returns only ref + token |
| Private tracking | 128-bit random hex token — only the applicant holding the URL can view their record |
| Admin-only actions | Supabase Auth + `is_active_admin()` check in every admin RPC |
| No public admin registration | Auth is create-user-only via Supabase Dashboard |
| Audit immutability | No UPDATE or DELETE policy on `audit_logs` |
| No service-role key in frontend | Only `VITE_SUPABASE_ANON_KEY` (public anon key) is exposed |

---

## 9. Admin Backup & Export

In **Admin → Settings & Backup**:

- **Export Application Records to CSV** — all travel orders (filtered or full list)
- **Export Activity Logs to CSV** — full audit trail
- **Download Full Backup (.json)** — combined snapshot for local archiving

CSV files include a UTF-8 BOM so they open correctly in Microsoft Excel.

---

## 10. Status Reference

| Status | Meaning |
|---|---|
| `PENDING_REVIEW` | Submitted, waiting for HR to open |
| `FOR_VERIFICATION` | HR started review |
| `VERIFIED` | HR confirmed all details correct |
| `APPROVED` | Approved; Travel Order Number generated |
| `CORRECTION_REQUESTED` | Applicant must edit & resubmit |
| `REJECTED` | Rejected with reason |

---

## 11. File Structure

```
src/
  components/
    AdminDashboard.tsx     — Admin login-protected dashboard
    AdminLogin.tsx         — HR/Admin sign-in form
    PrintableTravelOrder.tsx — Official printable document
    SetupGuide.tsx         — Shown when .env is not configured
    TrackingPage.tsx       — Public applicant tracking page
    UserPortal.tsx         — Homepage + application form
  lib/
    supabase.ts            — Supabase client (checks env vars)
  services/
    travelOrderService.ts  — All Supabase API calls
  types/
    travelOrder.ts         — TypeScript types
  utils/
    formatters.ts          — Date/status formatters, CSV export
  App.tsx                  — Root routing (/, /track/:token, /admin)
  main.tsx
  styles.css

supabase/
  schema.sql               — Full database setup (run once in Supabase SQL Editor)

public/
  assets/
    seal-anda.png          — Municipal Seal (extracted from official Word templates)
    logo-hrmo.png          — HRMO logo (extracted from official Word templates)

.env.example
vercel.json
netlify.toml
```
