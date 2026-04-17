/* ================================================================
   API Client – All data from MySQL database via PHP endpoints.
   NO fallback / hardcoded data.
   ================================================================ */

import { getAuthToken } from './auth';
import type {
  Property,
  Agent,
  Neighborhood,
  Testimonial,
  MarketInsights,
  Inquiry,
  Favorite,
  Appointment,
  AuditLog,
  Payment,
  Reservation,
  Offer,
  Notification,
  Dispute,
  PaginationMeta,
  PaginatedResult,
} from '../data/philippineData';

const DEFAULT_API = 'http://localhost/Activities/real_estate/api';
const API = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API).replace(/\/$/, '');
const ASSET_BASE = API.replace(/\/api$/, '');

// ── Helpers ───────────────────────────────────────────────

interface ApiResult<T = unknown> {
  success?: boolean;
  ok: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  pagination?: PaginationMeta;
  error?: string | { code?: string; message?: string; details?: unknown };
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: unknown;
}

function isApiSuccess(result: ApiResult<unknown>): boolean {
  if (typeof result.success === 'boolean') return result.success;
  return !!result.ok;
}

function getApiErrorMessage(result: ApiResult<unknown>, status: number): string {
  if (typeof result.error === 'string' && result.error.trim()) {
    return result.error;
  }
  if (result.error && typeof result.error === 'object' && typeof result.error.message === 'string' && result.error.message.trim()) {
    return result.error.message;
  }
  if (typeof result.errorMessage === 'string' && result.errorMessage.trim()) {
    return result.errorMessage;
  }
  return `Request failed (${status})`;
}

async function parseApiResult<T>(response: Response): Promise<ApiResult<T>> {
  const raw = await response.text();

  try {
    return JSON.parse(raw) as ApiResult<T>;
  } catch {
    const preview = raw.trim().slice(0, 120);
    throw new Error(
      `Server returned non-JSON response (${response.status}). ${preview || 'Empty response.'}`,
    );
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API}/${path}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...options.headers,
    },
  });

  const json = await parseApiResult<T>(response);
  if (!response.ok || !isApiSuccess(json)) {
    throw new Error(getApiErrorMessage(json, response.status));
  }
  return json.data as T;
}

/** Like request() but also returns pagination metadata. */
async function paginatedRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<PaginatedResult<T>> {
  const url = path.startsWith('http') ? path : `${API}/${path}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...options.headers,
    },
  });

  const json = await parseApiResult<T[]>(response);
  if (!response.ok || !isApiSuccess(json)) {
    throw new Error(getApiErrorMessage(json, response.status));
  }
  return {
    items: (json.data ?? []) as T[],
    pagination: json.pagination ?? { page: 1, perPage: 20, total: 0, totalPages: 0 },
  };
}

function authHeader(): Record<string, string> {
  // Token is managed via HttpOnly cookie (sent automatically with credentials: 'include').
  // Do NOT send the '__cookie__' sentinel as a Bearer token — it would fail server-side validation.
  const token = getAuthToken();
  return token && token !== '__cookie__' ? { Authorization: `Bearer ${token}` } : {};
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(
    (e): e is [string, string | number | boolean] => e[1] != null && e[1] !== '',
  );
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export function resolveAssetUrl(assetUrl: string): string {
  if (!assetUrl) return '';

  const normalizeUploadPath = (value: string): string => {
    if (value.includes('/public/images/uploads/')) {
      return value;
    }
    return value.replace('/images/uploads/', '/public/images/uploads/');
  };

  if (/^(https?:)?\/\//.test(assetUrl)) {
    try {
      const parsed = new URL(assetUrl, window.location.origin);
      parsed.pathname = normalizeUploadPath(parsed.pathname);
      return parsed.toString();
    } catch {
      return assetUrl;
    }
  }

  if (assetUrl.startsWith('data:') || assetUrl.startsWith('blob:')) {
    return assetUrl;
  }

  assetUrl = normalizeUploadPath(assetUrl);
  if (!assetUrl.startsWith('/')) {
    return assetUrl;
  }

  if (/^https?:\/\//.test(ASSET_BASE)) {
    return `${ASSET_BASE}${assetUrl}`;
  }

  const base = `${window.location.origin}${ASSET_BASE.startsWith('/') ? ASSET_BASE : `/${ASSET_BASE}`}`;
  return `${base}${assetUrl}`;
}

export interface PaginationParams {
  page?: number;
  perPage?: number;
}

// ── Properties ────────────────────────────────────────────

export async function getProperties(params?: {
  ownerId?: number;
  status?: string;
  search?: string;
  city?: string;
  type?: string;
  beds?: number;
  baths?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
} & PaginationParams): Promise<PaginatedResult<Property>> {
  return paginatedRequest<Property>(`properties.php${qs({
    owner_id: params?.ownerId,
    status: params?.status,
    search: params?.search,
    city: params?.city,
    type: params?.type,
    beds: params?.beds,
    baths: params?.baths,
    min_price: params?.minPrice,
    max_price: params?.maxPrice,
    sort: params?.sort,
    page: params?.page,
    per_page: params?.perPage,
  })}`);
}

export async function getPropertyById(id: number): Promise<Property> {
  return request<Property>(`properties.php?id=${id}`);
}

export async function createProperty(
  data: Omit<Property, 'id' | 'ownerName' | 'createdAt' | 'updatedAt' | 'status'> & {
    submitForApproval?: boolean;
  },
): Promise<Property> {
  return request<Property>('properties.php', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProperty(
  id: number,
  data: Partial<Property>,
): Promise<Property> {
  return request<Property>(`properties.php?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProperty(id: number): Promise<void> {
  await request<null>(`properties.php?id=${id}`, { method: 'DELETE' });
}

export async function approveProperty(id: number): Promise<Property> {
  return request<Property>(`properties.php?id=${id}&action=approve`, { method: 'PATCH' });
}

export async function rejectProperty(id: number): Promise<Property> {
  return request<Property>(`properties.php?id=${id}&action=reject`, { method: 'PATCH' });
}

// ── Agents ────────────────────────────────────────────────

export async function getAgents(): Promise<Agent[]> {
  return request<Agent[]>('agents.php');
}

// ── Neighborhoods ─────────────────────────────────────────

export async function getNeighborhoods(): Promise<Neighborhood[]> {
  return request<Neighborhood[]>('neighborhoods.php');
}

// ── Testimonials ──────────────────────────────────────────

export async function getTestimonials(): Promise<Testimonial[]> {
  return request<Testimonial[]>('testimonials.php');
}

// ── Market Insights ───────────────────────────────────────

export async function getMarketInsights(): Promise<MarketInsights> {
  return request<MarketInsights>('market-insights.php');
}

// ── Inquiries ─────────────────────────────────────────────

export async function getInquiries(params?: PaginationParams): Promise<PaginatedResult<Inquiry>> {
  return paginatedRequest<Inquiry>(`inquiries.php${qs({ page: params?.page, per_page: params?.perPage })}`);
}

export async function sendInquiry(propertyId: number, message: string): Promise<Inquiry> {
  return request<Inquiry>('inquiries.php', {
    method: 'POST',
    body: JSON.stringify({ propertyId, message }),
  });
}

export async function replyInquiry(id: number, reply: string): Promise<Inquiry> {
  return request<Inquiry>(`inquiries.php?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'reply', reply }),
  });
}

export async function sendInquiryMessage(id: number, message: string): Promise<Inquiry> {
  return request<Inquiry>(`inquiries.php?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'message', message }),
  });
}

export async function markInquiryRead(id: number): Promise<Inquiry> {
  return request<Inquiry>(`inquiries.php?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'read' }),
  });
}

export async function deleteInquiry(id: number): Promise<void> {
  await request<null>(`inquiries.php?id=${id}`, { method: 'DELETE' });
}

// ── Favorites ─────────────────────────────────────────────

export async function getFavorites(): Promise<Favorite[]> {
  return request<Favorite[]>('favorites.php');
}

export async function addFavorite(propertyId: number): Promise<void> {
  await request<null>('favorites.php', {
    method: 'POST',
    body: JSON.stringify({ propertyId }),
  });
}

export async function removeFavorite(propertyId: number): Promise<void> {
  await request<null>(`favorites.php?propertyId=${propertyId}`, { method: 'DELETE' });
}

// ── Appointments ──────────────────────────────────────────

export async function getAppointments(params?: PaginationParams): Promise<PaginatedResult<Appointment>> {
  return paginatedRequest<Appointment>(`appointments.php${qs({ page: params?.page, per_page: params?.perPage })}`);
}

export async function createAppointment(data: {
  propertyId: number;
  appointmentDate: string;
  appointmentTime: string;
  notes?: string;
  appointmentType?: 'viewing' | 'walk_in_payment';
}): Promise<Appointment> {
  return request<Appointment>('appointments.php', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAppointmentStatus(
  id: number,
  status: 'confirmed' | 'cancelled' | 'completed',
): Promise<Appointment> {
  return request<Appointment>(`appointments.php?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteAppointment(id: number): Promise<void> {
  await request<null>(`appointments.php?id=${id}`, { method: 'DELETE' });
}

// ── Audit Logs (admin) ───────────────────────────────────

export async function getAuditLogs(params?: {
  action?: string;
  userId?: number;
  resourceType?: string;
} & PaginationParams): Promise<PaginatedResult<AuditLog>> {
  return paginatedRequest<AuditLog>(`audit-logs.php${qs({
    action: params?.action,
    user_id: params?.userId,
    resource_type: params?.resourceType,
    page: params?.page,
    per_page: params?.perPage,
  })}`);
}

// ── Payments ──────────────────────────────────────────────

export async function getPayments(params?: {
  propertyId?: number;
  reservationId?: number;
} & PaginationParams): Promise<PaginatedResult<Payment>> {
  return paginatedRequest<Payment>(`payments.php${qs({
    propertyId: params?.propertyId,
    reservationId: params?.reservationId,
    page: params?.page,
    per_page: params?.perPage,
  })}`);
}

export async function createPayment(data: {
  propertyId: number;
  reservationId: number;
  amount: number;
  paymentChannel: 'walk_in' | 'online';
  paymentMethod: string;
  paymentType: string;
  referenceNo?: string;
  notes?: string;
  proofUrl?: string;
}): Promise<Payment> {
  return request<Payment>('payments.php', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePaymentStatus(
  id: number,
  status: 'pending' | 'paid' | 'failed' | 'refunded',
): Promise<Payment> {
  return request<Payment>(`payments.php?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function refundPayment(
  id: number,
  amount: number,
  reason: string,
): Promise<Payment> {
  return request<Payment>(`payments.php?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'refund', amount, reason }),
  });
}

// ── Users (admin) ─────────────────────────────────────────

export interface AdminUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  userType: string;
  avatar: string | null;
  bio: string | null;
  emailVerifiedAt: string | null;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  verificationDocument: string | null;
  verificationDocumentType: string | null;
  verificationExpiresAt: string | null;
  idType: string | null;
  verificationNotes: string | null;
  verifiedAt: string | null;
  verifiedBy: number | null;
  verifiedByName: string | null;
  createdAt: string;
}

export async function getUsers(params?: {
  search?: string;
  role?: string;
  verificationStatus?: string;
} & PaginationParams): Promise<PaginatedResult<AdminUser>> {
  return paginatedRequest<AdminUser>(`users.php${qs({
    search: params?.search,
    role: params?.role,
    verification_status: params?.verificationStatus,
    page: params?.page,
    per_page: params?.perPage,
  })}`);
}

export async function createUser(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  userType: string;
}): Promise<AdminUser> {
  return request<AdminUser>('users.php', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  id: number,
  data: Partial<{ firstName: string; lastName: string; email: string; phone: string; userType: string }>,
): Promise<AdminUser> {
  return request<AdminUser>(`users.php?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: number): Promise<void> {
  await request<null>(`users.php?id=${id}`, { method: 'DELETE' });
}

// ── Profile (self-service) ────────────────────────────────

export interface ProfileData {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  avatar: string | null;
  bio: string | null;
  isGoogleUser: boolean;
  emailVerifiedAt: string | null;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  verificationDocument: string | null;
  verificationDocumentType: string | null;
  verificationNotes: string | null;
  verifiedAt: string | null;
}

export async function getProfile(): Promise<ProfileData> {
  return request<ProfileData>('profile.php');
}

export async function updateProfile(data: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  bio?: string;
  avatar?: string;
}): Promise<ProfileData> {
  return request<ProfileData>('profile.php', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request<{ message: string }>('profile.php', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function submitVerificationDocument(
  documentUrl: string,
  idType?: string,
  documentType?: string,
): Promise<ProfileData> {
  return request<ProfileData>('profile.php', {
    method: 'POST',
    body: JSON.stringify({ action: 'submit_verification', document: documentUrl, idType, documentType }),
  });
}

export async function verifyUser(
  userId: number,
  action: 'verify' | 'reject',
  notes?: string,
): Promise<AdminUser> {
  return request<AdminUser>(`users.php?id=${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ verificationAction: action, verificationNotes: notes }),
  });
}

// ── Reservations ──────────────────────────────────────────

export async function getReservations(params?: {
  propertyId?: number;
} & PaginationParams): Promise<PaginatedResult<Reservation>> {
  return paginatedRequest<Reservation>(`reservations.php${qs({
    property_id: params?.propertyId,
    page: params?.page,
    per_page: params?.perPage,
  })}`);
}

export async function createReservation(data: {
  propertyId: number;
  days?: number;
  notes?: string;
  paymentIntent: 'walk_in' | 'online';
  calculatorSnapshot: {
    price: number;
    downPaymentPercentage: number;
    loanTermYears: number;
    interestRate: number;
    downPaymentAmount: number;
    loanAmount: number;
    monthlyPayment: number;
  };
}): Promise<Reservation> {
  return request<Reservation>('reservations.php', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateReservationStatus(
  id: number,
  status: 'active' | 'cancelled' | 'completed',
): Promise<Reservation> {
  return request<Reservation>(`reservations.php?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function getOffers(params?: {
  propertyId?: number;
  reservationId?: number;
  status?: string;
} & PaginationParams): Promise<PaginatedResult<Offer>> {
  return paginatedRequest<Offer>(`offers.php${qs({
    propertyId: params?.propertyId,
    reservationId: params?.reservationId,
    status: params?.status,
    page: params?.page,
    per_page: params?.perPage,
  })}`);
}

export async function createOffer(data: {
  propertyId: number;
  reservationId: number;
  amount: number;
  message?: string;
}): Promise<Offer> {
  return request<Offer>('offers.php', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function respondToOffer(
  id: number,
  data: {
    action: 'accept' | 'reject' | 'counter' | 'cancel';
    counterAmount?: number;
    counterMessage?: string;
  },
): Promise<Offer> {
  return request<Offer>(`offers.php?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ── Notifications ─────────────────────────────────────────

export async function getNotifications(params?: {
  unread?: boolean;
} & PaginationParams): Promise<PaginatedResult<Notification> & { unreadCount: number }> {
  const url = `${API}/notifications.php${qs({
    unread: params?.unread ? 1 : undefined,
    page: params?.page,
    per_page: params?.perPage,
  })}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
  });
  const json = (await response.json()) as ApiResult<Notification[]> & { unreadCount?: number };
  if (!response.ok || !isApiSuccess(json)) {
    throw new Error(getApiErrorMessage(json, response.status));
  }
  return {
    items: (json.data ?? []) as Notification[],
    pagination: json.pagination ?? { page: 1, perPage: 20, total: 0, totalPages: 0 },
    unreadCount: json.unreadCount ?? 0,
  };
}

export async function markNotificationRead(id: number): Promise<void> {
  await request<null>(`notifications.php?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'mark_read' }),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await request<null>('notifications.php', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'read_all' }),
  });
}

export async function deleteNotification(id: number): Promise<void> {
  await request<null>(`notifications.php?id=${id}`, { method: 'DELETE' });
}

export interface NotificationStreamPayload {
  unreadCount: number;
  latest: {
    id: number;
    type: string;
    title: string;
    message: string;
    createdAt: string;
  } | null;
}

export function subscribeNotificationStream(
  onData: (payload: NotificationStreamPayload) => void,
  onError?: (error: Event) => void,
): EventSource {
  const streamUrl = `${API}/notifications-stream.php`;
  const source = new EventSource(streamUrl, { withCredentials: true });

  source.addEventListener('notifications', (event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data) as ApiResult<NotificationStreamPayload>;
      if (isApiSuccess(parsed) && parsed.data) {
        onData(parsed.data);
      }
    } catch {
      // Ignore malformed stream chunks and continue.
    }
  });

  if (onError) {
    source.addEventListener('error', onError);
  }

  return source;
}

// ── Disputes ──────────────────────────────────────────────

export async function getDisputes(params?: {
  status?: string;
} & PaginationParams): Promise<PaginatedResult<Dispute>> {
  return paginatedRequest<Dispute>(`disputes.php${qs({
    status: params?.status,
    page: params?.page,
    per_page: params?.perPage,
  })}`);
}

export async function createDispute(data: {
  resourceType: string;
  resourceId: number;
  reason: string;
  description?: string;
}): Promise<Dispute> {
  return request<Dispute>('disputes.php', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function resolveDispute(
  id: number,
  status: 'investigating' | 'resolved' | 'dismissed',
  adminNotes?: string,
): Promise<Dispute> {
  return request<Dispute>(`disputes.php?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, adminNotes }),
  });
}

// ── File Upload ───────────────────────────────────────────

export interface UploadResult {
  url: string;
  filename: string;
  size: number;
  mime: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const url = `${API}/upload.php`;
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { ...authHeader() },
    body: formData,
  });

  const json = (await response.json()) as ApiResult<UploadResult>;
  if (!response.ok || !isApiSuccess(json)) {
    throw new Error(getApiErrorMessage(json, response.status));
  }
  const result = json.data as UploadResult;
  return {
    ...result,
    url: resolveAssetUrl(result.url),
  };
}
