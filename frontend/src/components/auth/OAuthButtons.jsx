import { useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { TbBrandWindowsFilled } from 'react-icons/tb';
import { FaFacebook } from 'react-icons/fa';
import { API_BASE_URL } from '../../api/config';

const PROVIDERS = [
  {
    id: 'google',
    label: 'Continue with Google',
    Icon: FcGoogle,
    iconColor: undefined,
  },
  {
    id: 'microsoft',
    label: 'Continue with Microsoft',
    Icon: TbBrandWindowsFilled,
    iconColor: '#2F2F2F',
  },
  {
    id: 'facebook',
    label: 'Continue with Facebook',
    Icon: FaFacebook,
    iconColor: '#1877F2',
  },
];

export default function OAuthButtons() {
  const [loading, setLoading] = useState(null); // provider id while redirecting

  const handleClick = async (provider) => {
    setLoading(provider);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/oauth/login/${provider}`);
      if (!res.ok) throw new Error('Failed to get auth URL');
      const { auth_url } = await res.json();
      window.location.href = auth_url;
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="oauth-buttons">
      {PROVIDERS.map(({ id, label, Icon, iconColor }) => (
        <button
          key={id}
          type="button"
          className="oauth-btn"
          onClick={() => handleClick(id)}
          disabled={loading !== null}
          aria-label={label}
        >
          <Icon size={18} color={iconColor} />
          <span>{loading === id ? 'Redirecting…' : label}</span>
        </button>
      ))}
    </div>
  );
}
