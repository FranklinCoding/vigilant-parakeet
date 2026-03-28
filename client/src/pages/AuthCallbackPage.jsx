import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// This page handles the redirect from the server after Steam login.
// The JWT is passed in the URL hash: /auth/callback#token=JWT
// (Hash is never sent to the server, keeping the token client-side only)
export default function AuthCallbackPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash; // e.g. "#token=eyJ..."
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('token');
    const error = new URLSearchParams(window.location.search).get('error');

    if (token) {
      login(token);
      // Clear the token from the URL, then go to the Steam profile page
      window.history.replaceState(null, '', '/auth/callback');
      navigate('/steam', { replace: true });
    } else {
      console.error('[auth] Callback error:', error || 'no token');
      navigate('/?auth_error=' + encodeURIComponent(error || 'unknown'), { replace: true });
    }
  }, [login, navigate]);

  return (
    <div className="page">
      <div className="spinner" style={{ marginTop: 80 }} />
      <p className="state-msg">Signing you in...</p>
    </div>
  );
}
