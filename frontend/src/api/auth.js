import { API_BASE_URL, ENDPOINTS } from './config';
import { handleUnauthorized } from './authFetch';

async function parseAuthResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    handleUnauthorized(response);
    throw new Error(data.detail || data.message || fallbackMessage);
  }

  return data;
}

export async function loginRequest({ email, password }) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.login}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  return parseAuthResponse(response, 'Login failed');
}

export async function registerRequest({ display_name, email, password }) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.register}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ display_name, email, password }),
  });

  return parseAuthResponse(response, 'Registration failed');
}

export async function fetchMe(token) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.me}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseAuthResponse(response, 'Failed to fetch profile');
}

export async function forgotPasswordRequest({ email }) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.forgotPassword}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  return parseAuthResponse(response, 'Failed to start password reset');
}

export async function resetPasswordRequest({ token, new_password }) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.resetPassword}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, new_password }),
  });

  return parseAuthResponse(response, 'Failed to reset password');
}

export async function changePasswordRequest({ token, current_password, new_password }) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.changePassword}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ current_password, new_password }),
  });

  return parseAuthResponse(response, 'Failed to change password');
}
