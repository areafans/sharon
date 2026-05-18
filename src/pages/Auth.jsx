import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signupDone, setSignupDone] = useState(false);

  function switchMode(next) {
    setMode(next);
    setError('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setLoading(false);
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    if (err) {
      setError(err.message);
    } else {
      setSignupDone(true);
    }
    setLoading(false);
  }

  const brand = (
    <div className="auth-brand">
      <img className="brand-mark" src="/sharon-logo.png" alt="Sharon" />
      <div className="brand-name">
        Sharon
        <small>Content Assistant</small>
      </div>
    </div>
  );

  if (signupDone) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          {brand}
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-subtitle">
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account, then come back here to sign in.
          </p>
          <div className="auth-switch">
            Already confirmed?{' '}
            <button type="button" onClick={() => { setSignupDone(false); switchMode('signin'); }}>
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'signup') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          {brand}
          <h1 className="auth-title">Create account</h1>
          <p className="auth-subtitle">Get started with Sharon.</p>

          <form className="auth-form" onSubmit={handleSignUp}>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={loading || !email || !password || !confirmPassword}
            >
              {loading
                ? <><div className="thinking"><span /><span /><span /></div> Creating account…</>
                : 'Create account'}
            </button>
          </form>

          <div className="auth-switch">
            Already have an account?{' '}
            <button type="button" onClick={() => switchMode('signin')}>Sign in</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {brand}
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to chat with Sharon.</p>

        <form className="auth-form" onSubmit={handleSignIn}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading || !email || !password}
          >
            {loading
              ? <><div className="thinking"><span /><span /><span /></div> Signing in…</>
              : 'Sign in'}
          </button>
        </form>

        <div className="auth-switch">
          Don't have an account?{' '}
          <button type="button" onClick={() => switchMode('signup')}>Create one</button>
        </div>
      </div>
    </div>
  );
}
