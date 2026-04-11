import type { UserRole } from './rbac';

const DEFAULT_API_BASE_URL = 'http://localhost/Activities/real_estate/api';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
const AUTH_STORAGE_KEY = 'estateflow_auth';
const AUTH_EVENT = 'estateflow-auth-changed';

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar: string | null;
  emailVerifiedAt: string | null;
  verificationStatus: string;
}

interface AuthResponse {
  ok: boolean;
  data?: {
    token?: string;
    user?: AuthUser;
    loggedOut?: boolean;
    message?: string;
    needsRole?: boolean;
    email?: string;
    name?: string;
    pendingToken?: string;
  };
  error?: string;
}

interface StoredAuth {
  token: string;
  user: AuthUser;
}

function emitAuthChanged(): void {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function setStoredAuth(auth: StoredAuth): void {
  // Store only non-sensitive user info in localStorage for UI display.
  // The session token is now managed via HttpOnly cookie set by the server.
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: auth.user }));
  emitAuthChanged();
}

export function getStoredAuth(): StoredAuth | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { token?: string; user?: AuthUser };
    if (!parsed.user) return null;
    // Token may be absent from localStorage (HttpOnly cookie handles it).
    // Return a placeholder so isLoggedIn() still works based on stored user.
    return { token: parsed.token ?? '__cookie__', user: parsed.user };
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function getAuthToken(): string | null {
  // Token is now primarily in HttpOnly cookie; this returns a sentinel
  // so callers know the user is logged in, but the real token is sent
  // automatically by the browser via credentials: 'include'.
  return getStoredAuth() ? '__cookie__' : null;
}

export function updateStoredUser(updates: Partial<AuthUser>): void {
  const stored = getStoredAuth();
  if (!stored) return;
  setStoredAuth({ ...stored, user: { ...stored.user, ...updates } });
}

/** Update stored token after rotation (refresh). */
export function updateStoredToken(_newToken: string): void {
  // Token is now in HttpOnly cookie; no-op for localStorage.
  // The server already set the new cookie via Set-Cookie header.
}

export function isLoggedIn(): boolean {
  return Boolean(getStoredAuth());
}

async function postAuth(payload: Record<string, unknown>): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let result: AuthResponse;

  try {
    result = JSON.parse(raw) as AuthResponse;
  } catch {
    const preview = raw.trim().slice(0, 120);
    throw new Error(`Server returned non-JSON response (${response.status}). ${preview || 'Empty response.'}`);
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error ?? 'Authentication request failed');
  }

  return result;
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const result = await postAuth({ action: 'login', email, password });
  const token = result.data?.token;
  const user = result.data?.user;

  if (!token || !user) {
    throw new Error('Invalid login response');
  }

  setStoredAuth({ token, user });
  return user;
}

export interface GoogleNeedsRole {
  needsRole: true;
  email: string;
  name: string;
  pendingToken: string;
}

export async function loginWithGoogle(idToken: string): Promise<AuthUser | GoogleNeedsRole> {
  const result = await postAuth({ action: 'google_login', idToken });

  if (result.data?.needsRole) {
    return {
      needsRole: true,
      email: result.data.email ?? '',
      name: result.data.name ?? '',
      pendingToken: result.data.pendingToken ?? '',
    };
  }

  const token = result.data?.token;
  const user = result.data?.user;

  if (!token || !user) {
    throw new Error('Invalid Google login response');
  }

  setStoredAuth({ token, user });
  return user;
}

export async function completeGoogleRegister(pendingToken: string, role: string): Promise<AuthUser> {
  const result = await postAuth({ action: 'google_register', pendingToken, role });
  const token = result.data?.token;
  const user = result.data?.user;

  if (!token || !user) {
    throw new Error('Invalid Google registration response');
  }

  setStoredAuth({ token, user });
  return user;
}

export async function registerUser(params: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}): Promise<AuthUser> {
  const result = await postAuth({ action: 'register', ...params });
  const token = result.data?.token;
  const user = result.data?.user;

  if (!token || !user) {
    throw new Error('Invalid register response');
  }

  setStoredAuth({ token, user });
  return user;
}

function clearAuthLocal(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  emitAuthChanged();
}

export async function logoutUser(): Promise<void> {
  const token = getAuthToken();

  if (token) {
    try {
      await postAuth({ action: 'logout', token });
    } catch {
      // Ignore network errors on logout.
    }
  }

  clearAuthLocal();
}

/** Refresh the session token (token rotation). */
export async function refreshToken(): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  try {
    const result = await postAuth({ action: 'refresh', token });
    const newToken = result.data?.token;
    if (newToken) {
      updateStoredToken(newToken);
    }
  } catch {
    // If refresh fails, session may have expired
    clearAuthLocal();
  }
}

/** Logout from all devices. */
export async function logoutAll(): Promise<void> {
  const token = getAuthToken();
  if (token) {
    try {
      await postAuth({ action: 'logout_all', token });
    } catch {
      // best effort
    }
  }
  clearAuthLocal();
}

/** Request a password reset email. */
export async function forgotPassword(email: string): Promise<string> {
  const result = await postAuth({ action: 'forgot_password', email });
  return result.data?.message ?? 'If the email exists, a reset link has been sent.';
}

/** Reset password using a token. */
export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const result = await postAuth({ action: 'reset_password', token, newPassword });
  return result.data?.message ?? 'Password reset successfully.';
}

export function subscribeAuthChange(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === AUTH_STORAGE_KEY) {
      callback();
    }
  };

  const onAuthEvent = () => callback();

  window.addEventListener('storage', onStorage);
  window.addEventListener(AUTH_EVENT, onAuthEvent);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(AUTH_EVENT, onAuthEvent);
  };
}
