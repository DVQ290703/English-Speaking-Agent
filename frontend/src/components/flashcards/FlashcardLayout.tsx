import { useState, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';

import { useLanguage } from '../../i18n/useLanguage';
import { getAuthSession, clearAuthSession } from '../../auth/tokenStorage';
import { fetchMe } from '../../api/auth';
import { User } from '../../auth/AuthContext';

export function FlashcardLayout() {
  const navigate = useNavigate();
  useLanguage();
  const [, setProfile] = useState<User | null>(null);

  useEffect(() => {
    const session = getAuthSession();
    if (!session?.token) {
      navigate('/', { replace: true });
      return;
    }
    if (session.user) {
      setProfile(session.user);
      return;
    }
    fetchMe(session.token)
      .then((user) => setProfile(user))
      .catch(() => {
        clearAuthSession();
        navigate('/', { replace: true });
      });
  }, [navigate]);

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 md:px-6 md:py-8">
      <Outlet />
    </div>
  );
}
