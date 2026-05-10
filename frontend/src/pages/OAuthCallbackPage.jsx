import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext';
import Spinner from '../components/ui/Spinner';

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Provider sent back an error (e.g. user denied permission)
    if (searchParams.get('error') === 'oauth_failed') {
      toast.error('Sign-in failed. Please try again.');
      navigate('/login', { replace: true });
      return;
    }

    // Backend sets token in the URL fragment: /auth/callback#token=...&user=...
    const hash = window.location.hash.slice(1); // strip leading #
    if (!hash) {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    const params = new URLSearchParams(hash);
    const token = params.get('token');
    const userRaw = params.get('user');

    if (!token || !userRaw) {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    let user;
    try {
      user = JSON.parse(decodeURIComponent(userRaw));
    } catch {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    login({ token, user });
    navigate('/chat', { replace: true }); // replace so back-button skips callback
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <Spinner size={32} />
      <p style={{ margin: 0, color: 'var(--color-muted, #888)' }}>Signing you in…</p>
    </div>
  );
}
