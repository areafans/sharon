import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Dashboard({ session, navigate }) {
  const [content, setContent]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [dbStatus, setDbStatus] = useState('checking...');

  const user = session.user;

  useEffect(() => {
    async function fetchContent() {
      const { data, error } = await supabase
        .from('content_items')
        .select('id, title, description, content_type, tags, view_count, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        if (error.code === '42P01') {
          setDbStatus('tables not yet created — run the migration first');
        } else {
          setDbStatus(`error: ${error.message}`);
        }
        setContent([]);
      } else {
        setDbStatus('connected ✓');
        setContent(data || []);
      }
      setLoading(false);
    }

    fetchContent();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <strong>SE Content Hub</strong>
          <nav style={styles.nav}>
            <button style={{ ...styles.navLink, ...styles.navLinkActive }}>Dashboard</button>
            <button style={styles.navLink} onClick={() => navigate('library')}>Library</button>
            <button style={styles.navLink} onClick={() => navigate('chat')}>Chat</button>
          </nav>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userBadge}>
            {user.user_metadata?.full_name || user.email}
          </span>
          <button style={styles.uploadBtn} onClick={() => navigate('upload')}>+ Upload</button>
          <button style={styles.signOutBtn} onClick={handleSignOut}>Sign Out</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.statusBox}>
          <h2 style={styles.h2}>✓ Authenticated</h2>
          <table style={styles.table}>
            <tbody>
              <tr><td style={styles.label}>User ID</td><td>{user.id}</td></tr>
              <tr><td style={styles.label}>Email</td><td>{user.email}</td></tr>
              <tr><td style={styles.label}>Name</td><td>{user.user_metadata?.full_name || '—'}</td></tr>
              <tr><td style={styles.label}>Last sign in</td><td>{new Date(user.last_sign_in_at).toLocaleString()}</td></tr>
              <tr><td style={styles.label}>DB status</td><td>{dbStatus}</td></tr>
            </tbody>
          </table>
        </div>

        <div style={styles.section}>
          <h3 style={styles.h3}>Content Library ({loading ? '...' : content.length} items)</h3>

          {loading && <p style={styles.muted}>Loading...</p>}

          {!loading && content.length === 0 && (
            <p style={styles.muted}>
              No content items yet.
              {dbStatus.includes('not yet created') && (
                <span> Run <code>DB_PASSWORD='...' node scripts/run_migration.js</code> to create tables.</span>
              )}
            </p>
          )}

          {content.map(item => (
            <div key={item.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <strong>{item.title}</strong>
                <span style={styles.typeBadge}>{item.content_type}</span>
              </div>
              {item.description && <p style={styles.cardDesc}>{item.description}</p>}
              <div style={styles.cardMeta}>
                <span>views: {item.view_count}</span>
                {item.tags?.length > 0 && (
                  <span>tags: {item.tags.join(', ')}</span>
                )}
                <span style={styles.muted}>{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const styles = {
  page:          { fontFamily: 'monospace', minHeight: '100vh', background: '#fafafa' },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', height: 52, borderBottom: '1px solid #ddd', background: '#fff' },
  headerLeft:    { display: 'flex', alignItems: 'center', gap: 20 },
  nav:           { display: 'flex', gap: 4 },
  navLink:       { fontSize: 13, padding: '4px 10px', background: 'none', border: 'none', cursor: 'pointer', color: '#888', borderRadius: 6, fontFamily: 'monospace' },
  navLinkActive: { background: '#f0f0f0', color: '#1a1a1a', fontWeight: 600 },
  headerRight:   { display: 'flex', alignItems: 'center', gap: 12 },
  userBadge:  { fontSize: 13, color: '#555' },
  uploadBtn:  { padding: '6px 12px', fontSize: 12, cursor: 'pointer', border: 'none', background: '#1a1a1a', color: '#fff', borderRadius: 4 },
  signOutBtn: { padding: '6px 12px', fontSize: 12, cursor: 'pointer', border: 'none', background: '#1a1a1a', color: '#fff', borderRadius: 4 },
  main:       { maxWidth: 800, margin: '32px auto', padding: '0 24px' },
  statusBox:  { padding: 20, border: '1px solid #ddd', borderRadius: 6, background: '#fff', marginBottom: 24 },
  h2:         { margin: '0 0 16px', fontSize: 18, color: '#2a7a2a' },
  h3:         { margin: '0 0 12px', fontSize: 16 },
  table:      { borderCollapse: 'collapse', width: '100%', fontSize: 13 },
  label:      { padding: '4px 12px 4px 0', color: '#666', width: 120, verticalAlign: 'top' },
  section:    { padding: 20, border: '1px solid #ddd', borderRadius: 6, background: '#fff' },
  muted:      { color: '#888', fontSize: 13 },
  card:       { padding: '12px 0', borderBottom: '1px solid #f0f0f0' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge:  { fontSize: 11, padding: '2px 8px', background: '#eee', borderRadius: 10 },
  cardDesc:   { margin: '4px 0', fontSize: 13, color: '#555' },
  cardMeta:   { display: 'flex', gap: 16, fontSize: 12, color: '#888', marginTop: 4 },
};
