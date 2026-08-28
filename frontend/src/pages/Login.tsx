import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from '../components/BrandLogo';
import { Alert, Button, Input } from '../components/ui';
import { APP_NAME, INSTITUTION_NAME } from '../brand';
import { errorMessage } from '../utils/format';

export default function Login() {
  const { login, token, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!loading && token) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      setPassword('');
      navigate('/');
    } catch (err) {
      setError(errorMessage(err) || 'Wrong username or password');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-sidebar text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(13,115,119,0.45), transparent 45%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.08), transparent 40%)',
          }}
        />
        <div className="relative">
          <BrandLogo size="lg" className="mb-5 ring-2 ring-white/10" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-300/90">
            {INSTITUTION_NAME}
          </p>
          <h1 className="mt-4 max-w-md font-display text-4xl font-semibold leading-tight tracking-tight">
            Collect and track school fees with ease
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
            Record tuition, books, uniforms, and more — all in one secure place for your school staff.
          </p>
        </div>
        <ul className="relative space-y-3 text-sm text-slate-300">
          <li className="border-l-2 border-teal-400/70 pl-3">Monthly tuition by school year</li>
          <li className="border-l-2 border-teal-400/40 pl-3">Quick fee collection at the counter</li>
          <li className="border-l-2 border-teal-400/30 pl-3">Reports and receipts when you need them</li>
        </ul>
      </section>

      <section className="flex items-center justify-center bg-page p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <BrandLogo size="md" className="mb-3" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              {INSTITUTION_NAME}
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-primary">Sign in</h1>
          </div>

          <div className="rounded-lg border border-border bg-white p-7 shadow-[0_8px_30px_rgba(15,39,68,0.06)] sm:p-8">
            <div className="mb-6 hidden lg:block">
              <BrandLogo size="sm" className="mb-3" />
              <h2 className="font-display text-2xl font-semibold text-primary">Sign in to {APP_NAME}</h2>
              <p className="mt-1.5 text-sm text-muted">Enter your staff username and password.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
              {error ? <Alert>{error}</Alert> : null}
              <Input
                id="login-username"
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoFocus
              />
              <div>
                <Input
                  id="login-password"
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                  />
                  Show password
                </label>
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </div>

          <div className="mt-5 space-y-1 text-center text-xs text-muted">
            <p>For authorized school staff only.</p>
            <p>You will be signed out after 30 minutes of no activity.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
