import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function SignIn({ onSwitch }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>SE Content Hub</h1>
      <h2 style={styles.subtitle}>Sign In</h2>

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          style={styles.input}
          type="email"
          placeholder="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p style={styles.switchText}>
        No account?{' '}
        <button style={styles.link} onClick={onSwitch}>Create one</button>
      </p>

      <div style={styles.testCreds}>
        <strong>Test credentials:</strong>
        <div>admin@secontenthub.com / Admin1234!</div>
        <div>connor@secontenthub.com / Connor1234!</div>
        <div>jason@secontenthub.com / Jason1234!</div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 400,
    margin: '80px auto',
    padding: 32,
    border: '1px solid #ccc',
    borderRadius: 8,
    fontFamily: 'monospace',
  },
  title:    { margin: 0, fontSize: 24 },
  subtitle: { margin: '8px 0 24px', fontWeight: 'normal', fontSize: 16, color: '#555' },
  form:     { display: 'flex', flexDirection: 'column', gap: 12 },
  input:    { padding: 10, fontSize: 14, border: '1px solid #ccc', borderRadius: 4 },
  button:   { padding: 10, fontSize: 14, cursor: 'pointer', background: '#000', color: '#fff', border: 'none', borderRadius: 4 },
  error:    { color: 'red', fontSize: 13, margin: 0 },
  switchText: { marginTop: 16, fontSize: 13 },
  link:     { background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13 },
  testCreds: { marginTop: 24, padding: 12, background: '#f5f5f5', borderRadius: 4, fontSize: 12, lineHeight: 1.8 },
};
