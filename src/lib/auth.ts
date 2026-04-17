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
  isGoogleUser?: boolean;
}

export interface ForgotPasswordResult {
  message: string;
}

interface AuthResponse {
  ok: boolean;
  success?: boolean;
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
  error?: unknown;
  errorCode?: string;
  errorMessage?: string;
  retryAfter?: number;
}

interface StoredAuth {
  token: string;
  user: AuthUser;
}

function emitAuthChanged(): void {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function setStoredAuth(auth: StoredAuth): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: auth.token, user: auth.user }));
  emitAuthChanged();
}

export function getStoredAuth(): StoredAuth | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { token?: string; user?: AuthUser };
    if (!parsed.user || !parsed.token) return null;
    return { token: parsed.token, user: parsed.user };
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function getAuthToken(): string | null {
  return getStoredAuth()?.token ?? null;
}

export function updateStoredUser(updates: Partial<AuthUser>): void {
  const stored = getStoredAuth();
  if (!stored) return;
  setStoredAuth({ ...stored, user: { ...stored.user, ...updates } });
}

/** Update stored token after rotation (refresh). */
export function updateStoredToken(newToken: string): void {
  const stored = getStoredAuth();
  if (!stored) return;
  setStoredAuth({ ...stored, token: newToken });
}

export function isLoggedIn(): boolean {
  return Boolean(getStoredAuth());
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readErrorMessage(value: unknown): string | null {
  const direct = readString(value);
  if (direct) return direct;

  const obj = readObject(value);
  if (!obj) return null;

  const nestedError = readErrorMessage(obj.error);
  if (nestedError) return nestedError;

  return (
    readString(obj.errorMessage) ??
    readString(obj.message) ??
    readString(obj.detail) ??
    null
  );
}

function formatRetryAfter(rawSeconds: unknown): string | null {
  if (typeof rawSeconds !== 'number' || !Number.isFinite(rawSeconds) || rawSeconds <= 0) {
    return null;
  }

  const seconds = Math.ceil(rawSeconds);
  if (seconds < 60) {
    return `Too many requests. Please try again in ${seconds} second${seconds === 1 ? '' : 's'}.`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `Too many requests. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

function getAuthErrorMessage(response: Response, result: AuthResponse): string {
  if (response.status === 429) {
    return (
      formatRetryAfter(result.retryAfter) ??
      readErrorMessage(result) ??
      'Too many requests. Please try again later.'
    );
  }

  const extracted = readErrorMessage(result);
  if (extracted) return extracted;

  return 'Authentication request failed';
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
    throw new Error(getAuthErrorMessage(response, result));
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
export async function forgotPassword(email: string): Promise<ForgotPasswordResult> {
  const result = await postAuth({ action: 'forgot_password', email });
  const data = (result.data ?? {}) as { message?: string };
  return {
    message: data.message ?? 'If the email exists, a reset code has been sent.',
  };
}

/** Reset password using email + verification code. */
export async function resetPassword(email: string, resetCode: string, newPassword: string): Promise<string> {
  const result = await postAuth({ action: 'reset_password', email, resetCode, newPassword });
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
