import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { LogOut, Mic, Library } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "../../i18n/useLanguage";
import LanguageToggle from "../../i18n/LanguageToggle";
import ThemeToggle from "../../theme/ThemeToggle";
import { useDarkMode } from "../../theme/useDarkMode";
import { getAuthSession, clearAuthSession } from "../../auth/tokenStorage";
import { fetchMe } from "../../api/auth";

export function FlashcardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const [dark, toggleDark] = useDarkMode();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [profile, setProfile] = useState<any>(null);

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
    fetchMe(session.token).then(user => setProfile(user)).catch(() => {
      clearAuthSession();
      navigate('/', { replace: true });
    });
  }, [navigate]);

  const handleLogout = () => {
    clearAuthSession();
    toast.success(t('toast.signedOut'));
    navigate('/', { replace: true });
  };

  const displayName = profile?.display_name || profile?.email || t('dash.fallbackName');

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 md:px-6 md:py-8">
      <Outlet />
    </div>
  );
}
