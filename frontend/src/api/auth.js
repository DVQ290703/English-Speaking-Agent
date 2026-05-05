import { API_BASE_URL, ENDPOINTS } from './config';

export async function loginRequest({ email, password }) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.login}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || 'Login failed');
  }

  return data;
}

export async function registerRequest({ display_name, email, password }) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.register}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ display_name, email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || 'Registration failed');
  }

  return data;
}

export async function fetchMe(token) {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.me}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || 'Failed to fetch profile');
  }

  return data;
}
