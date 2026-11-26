export function SetupGuide() {
  return (
    <section className="card setup-card">
      <h2>Supabase Database Setup Required</h2>
      <p className="muted">
        This application requires a live Supabase project so Travel Orders, HR verification,
        sequential Travel Order numbering, and audit logs are stored securely online.
      </p>

      <ol className="setup-steps">
        <li>
          Create a free project at <strong>supabase.com</strong>.
        </li>
        <li>
          Open <strong>SQL Editor</strong> in Supabase and run the SQL script in{' '}
          <code>supabase/schema.sql</code>.
        </li>
        <li>
          In Supabase <strong>Authentication &rarr; Users</strong>, create your HR/Admin account and
          insert its User UUID into <code>public.admin_users</code>.
        </li>
        <li>
          Copy <code>.env.example</code> to <code>.env</code> (locally) or configure Environment
          Variables in Vercel / Netlify:
          <pre className="code-block">
            {`VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co\nVITE_SUPABASE_ANON_KEY=YOUR-SUPABASE-ANON-KEY`}
          </pre>
        </li>
        <li>Restart the development server or redeploy to connect.</li>
      </ol>
    </section>
  );
}
