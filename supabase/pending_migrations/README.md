# Pending migrations

SQL in this folder is staging only; the Supabase CLI and GitHub Actions apply files from `supabase/migrations/`.

The hosted production schema is baselined in `supabase/migrations/20261127021044_remote_schema.sql`. The notification migration now follows it in `supabase/migrations/20261127021200_admin_submission_notifications.sql`.

For future changes, move staged SQL into `supabase/migrations/` only after confirming the hosted migration history, and assign a timestamp later than the latest recorded migration. Enable the GitHub workflow only after its required Actions secrets are set and `SUPABASE_MIGRATIONS_READY=true` is configured.
