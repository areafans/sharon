import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Library from './pages/Library';
import Chat from './pages/Chat';

export default function App() {
  const [session, setSession]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showSignUp, setShowUp] = useState(false);
  const [page, setPage]         = useState('dashboard');

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ fontFamily: 'monospace', padding: 32, color: '#888' }}>
        Loading...
      </div>
    );
  }

  if (session) {
    if (page === 'upload')   return <Upload    session={session} navigate={setPage} />;
    if (page === 'library')  return <Library   session={session} navigate={setPage} />;
    if (page === 'chat')     return <Chat      session={session} navigate={setPage} />;
    return <Dashboard session={session} navigate={setPage} />;
  }

  if (showSignUp) {
    return <SignUp onSwitch={() => setShowUp(false)} />;
  }

  return <SignIn onSwitch={() => setShowUp(true)} />;
}
