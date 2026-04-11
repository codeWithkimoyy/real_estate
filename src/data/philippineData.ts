/* ================================================================
   Types & utilities – NO hardcoded data.
   All actual data comes exclusively from the MySQL database via API.
   ================================================================ */

// ── Property ──────────────────────────────────────────────

export interface Property {
  id: number;
  title: string;
  address: string;
  city: string;
  province: string;
  zipCode: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  sqm: number;
  propertyType: 'house' | 'condo' | 'townhome' | 'apartment' | 'lot';
  status: 'pending' | 'approved' | 'rejected' | 'sold';
  image: string;
  images: string[];
  description: string;
  amenities: string[];
  yearBuilt: number | null;
  lotSize: number | null;
  garage: number;
  pool: boolean;
  furnished: boolean;
  ownerId: number;
  ownerName: string;
  interestRate: number;
  proofDocument: string | null;
  reservationFee: number | null;
  coordinates: { lat: number; lng: number } | null;
  createdAt: string;
  updatedAt: string;
}

// ── Agent (simplified – derived from users table) ─────────

export interface Agent {
  id: number;
  name: string;
  email: string;
  phone: string;
  avatar: string | null;
  bio: string | null;
  listingsCount: number;
}

// ── Neighborhood ──────────────────────────────────────────

export interface Neighborhood {
  id: number;
  name: string;
  city: string;
  province: string;
  image: string;
  avgPrice: number;
  priceChange: number;
  description: string;
  walkScore: number;
  transitScore: number;
}

// ── Testimonial ───────────────────────────────────────────

export interface Testimonial {
  id: number;
  name: string;
  role: string;
  image: string;
  content: string;
  rating: number;
}

// ── Market Insights ───────────────────────────────────────

export interface MarketInsights {
  avgDaysOnMarket: number;
  priceTrend: number;
  newListingsThisWeek: number;
  totalActiveListings: number;
  avgPricePerSqm: number;
}

// ── Inquiry ───────────────────────────────────────────────

export interface InquiryMessage {
  id: number;
  inquiryId: number;
  senderId: number;
  senderName: string;
  message: string;
  createdAt: string;
}

export interface Inquiry {
  id: number;
  propertyId: number;
  propertyTitle: string;
  senderId: number;
  senderName: string;
  receiverId: number;
  receiverName: string;
  message: string;
  reply: string | null;
  status: 'unread' | 'read' | 'replied';
  createdAt: string;
  updatedAt: string;
  messages?: InquiryMessage[];
}

// ── Favorite ──────────────────────────────────────────────

export interface Favorite {
  id: number;
  propertyId: number;
  property: Property;
  createdAt: string;
}

// ── Appointment ───────────────────────────────────────────

export interface Appointment {
  id: number;
  propertyId: number;
  propertyTitle: string;
  userId: number;
  userName: string;
  agentId: number | null;
  agentName: string | null;
  appointmentDate: string;
  appointmentTime: string;
  notes: string | null;
  appointmentType: 'viewing' | 'walk_in_payment';
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: string;
}

// ── Audit Log ─────────────────────────────────────────────

export interface AuditLog {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  resourceType: string;
  resourceId: number | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// ── Payment ───────────────────────────────────────────────

export interface Payment {
  id: number;
  propertyId: number;
  propertyTitle: string;
  propertyImage: string;
  buyerId: number;
  buyerName: string;
  sellerId: number;
  sellerName: string;
  amount: number;
  paymentMethod: 'bank_transfer' | 'gcash' | 'pagibig' | 'cash' | 'credit_card';
  paymentType: 'reservation' | 'down_payment' | 'full_payment' | 'monthly';
  referenceNo: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  notes: string | null;
  proofUrl: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  refundAmount: number | null;
  refundReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Reservation ───────────────────────────────────────────

export interface Reservation {
  id: number;
  propertyId: number;
  propertyTitle: string;
  propertyImage: string;
  propertyAddress: string;
  propertyCity: string;
  propertyProvince: string;
  userId: number;
  userName: string;
  ownerName: string;
  status: 'pending' | 'active' | 'expired' | 'cancelled' | 'completed';
  expiresAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Notification ──────────────────────────────────────────

export interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: number | null;
  readAt: string | null;
  createdAt: string;
}

// ── Dispute ───────────────────────────────────────────────

export interface Dispute {
  id: number;
  reporterId: number;
  reporterName: string;
  reporterEmail: string;
  resourceType: string;
  resourceId: number;
  reason: string;
  description: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  adminNotes: string | null;
  resolvedBy: number | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Paginated Response ────────────────────────────────────

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ── Utility functions ─────────────────────────────────────

export function formatPrice(price: number): string {
  if (price >= 1_000_000) {
    const millions = price / 1_000_000;
    return `₱${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (price >= 1_000) {
    return `₱${(price / 1_000).toFixed(0)}K`;
  }
  return `₱${price.toLocaleString()}`;
}

export function formatFullPrice(price: number): string {
  return `₱${price.toLocaleString()}`;
}

export function calculatePagIBIGLoan(propertyPrice: number): {
  monthlyPayment: number;
  totalPayment: number;
  loanAmount: number;
  interestRate: number;
  term: number;
} {
  const maxLoan = 6_000_000;
  const loanAmount = Math.min(propertyPrice * 0.8, maxLoan);
  const interestRate = loanAmount <= 750_000 ? 0.0575 : 0.065;
  const term = 30;
  const monthlyRate = interestRate / 12;
  const months = term * 12;
  const monthlyPayment =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);

  return {
    monthlyPayment: Math.round(monthlyPayment),
    totalPayment: Math.round(monthlyPayment * months),
    loanAmount,
    interestRate,
    term,
  };
}

export function calculateBankLoan(propertyPrice: number): {
  monthlyPayment: number;
  totalPayment: number;
  loanAmount: number;
  interestRate: number;
  term: number;
} {
  const loanAmount = propertyPrice * 0.8;
  const interestRate = 0.07;
  const term = 20;
  const monthlyRate = interestRate / 12;
  const months = term * 12;
  const monthlyPayment =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);

  return {
    monthlyPayment: Math.round(monthlyPayment),
    totalPayment: Math.round(monthlyPayment * months),
    loanAmount,
    interestRate,
    term,
  };
}
