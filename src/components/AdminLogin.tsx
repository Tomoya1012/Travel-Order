import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { travelOrderService } from '../services/travelOrderService';
import type { AdminUser } from '../types/travelOrder';

interface AdminLoginProps {
  onSuccess: (admin: AdminUser) => void;
}

export function AdminLogin({ onSuccess }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const admin = await travelOrderService.signInAdmin(email, password);
      onSuccess(admin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card login-card">
      <div className="login-header">
        <div className="login-icon">
          <Lock size={24} />
        </div>
        <div>
          <h2>HR / Admin Portal Login</h2>
          <p className="muted">
            Authorized Municipality of Anda HR and Administrator accounts only.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="travel-form">
        <div className="form-group">
          <label htmlFor="admin-email">Email Address</label>
          <input
            id="admin-email"
            type="email"
            required
            autoComplete="username"
            placeholder="hrmo@anda.gov.ph"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
          {loading ? 'Signing In...' : 'Sign In to Admin Dashboard'}
        </button>
      </form>

      <p className="field-hint">
        Public registration is disabled. New HR/Admin accounts are provisioned directly in
        Supabase Auth and linked in the <code>admin_users</code> table.
      </p>
    </section>
  );
}
