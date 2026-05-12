import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function SignUp({ onSwitch }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Account created! Check your email to confirm, or sign in directly if email confirmation is disabled.');
    }
    setLoading(false);
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>SE Content Hub</h1>
      <h2 style={styles.subtitle}>Create Account</h2>

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          style={styles.input}
          type="text"
          placeholder="name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
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
          placeholder="password (min 6 chars)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
        />
        {error   && <p style={styles.error}>{error}</p>}
        {success && <p style={styles.success}>{success}</p>}
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Account'}
        </button>
      </form>

      <p style={styles.switchText}>
        Already have an account?{' '}
        <button style={styles.link} onClick={onSwitch}>Sign in</button>
      </p>
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
  success:  { color: 'green', fontSize: 13, margin: 0 },
  switchText: { marginTop: 16, fontSize: 13 },
  link:     { background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13 },
};
