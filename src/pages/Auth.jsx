import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Icons from '../components/Icons';

export default function Auth() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [error, setError] = useState('');
  const [signedUp, setSignedUp] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    } else {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) {
        setError(err.message);
      } else {
        setSignedUp(true);
      }
    }
    setLoading(false);
  }

  async function handleGitHub() {
    setGithubLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin },
    });
    if (err) {
      setError(err.message);
      setGithubLoading(false);
    }
  }

  if (signedUp) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
          <h2 className="auth-title" style={{ textAlign: 'center' }}>Check your email</h2>
          <p className="auth-subtitle" style={{ textAlign: 'center' }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            onClick={() => { setMode('signin'); setSignedUp(false); }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">SE</div>
          <div className="brand-name">
            Content Hub
            <small>Solutions Engineering</small>
          </div>
        </div>

        <h1 className="auth-title">
          {mode === 'signin' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="auth-subtitle">
          {mode === 'signin'
            ? 'Sign in to access the SE Content Hub.'
            : 'Join the SE team on the Content Hub.'}
        </p>

        <button className="auth-btn-github" onClick={handleGitHub} disabled={githubLoading}>
          <Icons.Github size={18} />
          {githubLoading ? 'Redirecting…' : 'Continue with GitHub'}
        </button>

        <div className="auth-divider">
          <span>or continue with email</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
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
              placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading || !email || !password}
          >
            {loading
              ? <><div className="thinking"><span /><span /><span /></div> {mode === 'signin' ? 'Signing in…' : 'Creating account…'}</>
              : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'signin' ? (
            <>No account?{' '}<button onClick={() => { setMode('signup'); setError(''); }}>Create one</button></>
          ) : (
            <>Already have an account?{' '}<button onClick={() => { setMode('signin'); setError(''); }}>Sign in</button></>
          )}
        </div>

        {mode === 'signin' && (
          <div className="auth-test-creds">
            <strong>Test credentials</strong>
            admin@secontenthub.com / Admin1234!
            <br />connor@secontenthub.com / Connor1234!
            <br />jason@secontenthub.com / Jason1234!
          </div>
        )}
      </div>
    </div>
  );
}
