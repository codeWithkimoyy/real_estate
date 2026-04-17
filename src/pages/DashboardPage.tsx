import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Home, MessageSquare, Calendar, Heart, ShieldCheck, FileText,
  Plus, Trash2, CheckCircle, XCircle, AlertCircle, Clock, Eye, Send,
  ChevronRight, Building2, MapPin, BedDouble, Bath, Menu, X, CreditCard,
  Store, Hash, Search, Bookmark, Printer,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getStoredAuth } from '../lib/auth';
import { roleHasPermission } from '../lib/rbac';
import {
  getProperties, deleteProperty, approveProperty, rejectProperty,
  getInquiries, sendInquiryMessage, markInquiryRead,
  getFavorites, removeFavorite,
  getAppointments, updateAppointmentStatus, deleteAppointment,
  getPayments, updatePaymentStatus,
  getReservations, updateReservationStatus,
  resolveAssetUrl,
} from '../lib/api';
import { formatPrice, type Property, type Inquiry, type Favorite, type Appointment, type Payment, type Reservation } from '../data/philippineData';
import AdminUsersTab from './dashboard/AdminUsersTab';
import AdminAnalyticsTab from './dashboard/AdminAnalyticsTab';
import AdminSystemTab from './dashboard/AdminSystemTab';
import AdminAuditTab from './dashboard/AdminAuditTab';
import ProfileTab from './dashboard/ProfileTab';
import { buildTabsForRole, type TabKey } from './dashboard/shared/tabConfig';

/* ── Stat counter cards shown at the top of main panels ──── */
function QuickStats({ items }: { items: { label: string; value: string | number; icon: typeof Home; color: string }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {items.map((s) => (
        <div key={s.label} className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/[0.06] p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-blue text-xs font-medium uppercase tracking-wider">{s.label}</p>
              <p className="text-2xl font-display font-bold text-white mt-1">{s.value}</p>
            </div>
            <div className={`p-2 rounded-lg ${s.color}`}>
              <s.icon className="w-4 h-4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Loading skeleton ─────────────────────────────────────── */
function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl bg-white/5 h-24" />
      ))}
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────── */
function EmptyState({ icon: Icon, title, description }: { icon: typeof Home; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-gray-blue/50" />
      </div>
      <p className="text-white font-semibold">{title}</p>
      {description && <p className="text-gray-blue text-sm mt-1 max-w-sm">{description}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [auth, setAuth] = useState(getStoredAuth);
  const [failedSidebarAvatarSrc, setFailedSidebarAvatarSrc] = useState<string | null>(null);

  useEffect(() => {
    const onAuthChange = () => setAuth(getStoredAuth());
    window.addEventListener('estateflow-auth-changed', onAuthChange);
    return () => window.removeEventListener('estateflow-auth-changed', onAuthChange);
  }, []);

  const role = auth?.user.role;
  const userId = auth?.user.id;
  const isAdmin = role === 'administrator';
  const isClerk = role === 'clerk';

  const tabs = buildTabsForRole(role);

  // Group tabs
  const groups = [...new Set(tabs.map((t) => t.group ?? ''))];

  const [activeTab, setActiveTab] = useState<TabKey>(tabs[0]?.key ?? 'my-listings');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifDots, setNotifDots] = useState<Partial<Record<TabKey, number>>>({});

  const clearDot = useCallback((tab: TabKey) => {
    setNotifDots((prev) => {
      if (!prev[tab]) return prev;
      const next = { ...prev };
      delete next[tab];
      return next;
    });
  }, []);

  const decrementDot = useCallback((tab: TabKey) => {
    setNotifDots((prev) => {
      const cur = prev[tab];
      if (!cur) return prev;
      const next = { ...prev };
      if (cur <= 1) delete next[tab];
      else next[tab] = cur - 1;
      return next;
    });
  }, []);

  // Fetch notification counts for sidebar dots
  useEffect(() => {
    const loadCounts = async () => {
      try {
        const dots: Partial<Record<TabKey, number>> = {};
        const [inquiriesRes, appointmentsRes, paymentsRes, reservationsRes] = await Promise.all([
          getInquiries().catch(() => ({ items: [] as Inquiry[], pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } })),
          getAppointments().catch(() => ({ items: [] as Appointment[], pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } })),
          getPayments().catch(() => ({ items: [] as Payment[], pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } })),
          getReservations().catch(() => ({ items: [] as Reservation[], pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } })),
        ]);
        const unreadInquiries = inquiriesRes.items.filter((i) => i.status === 'unread').length;
        if (unreadInquiries > 0) dots.inquiries = unreadInquiries;
        const pendingAppts = appointmentsRes.items.filter((a) => a.status === 'pending').length;
        if (pendingAppts > 0) dots.appointments = pendingAppts;
        const pendingPayments = paymentsRes.items.filter((p) => p.status === 'pending').length;
        if (pendingPayments > 0) dots.payments = pendingPayments;
        const activeReservations = reservationsRes.items.filter((r) => r.status === 'active').length;
        if (activeReservations > 0) dots.reservations = activeReservations;
        if (isAdmin || isClerk) {
          const { getProperties: gp, getUsers: gu } = await import('../lib/api');
          if (isAdmin) {
            const pendingRes = await gp({ status: 'pending_approval' }).catch(() => ({ items: [] as Property[], pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } }));
            if (pendingRes.items.length > 0) dots.approvals = pendingRes.items.length;
          }
          const usersRes = await gu().catch(() => ({ items: [] as { verificationStatus: string }[], pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } }));
          const pendingUsers = usersRes.items.filter((u) => u.verificationStatus === 'pending').length;
          if (pendingUsers > 0) dots.users = pendingUsers;
        }
        setNotifDots(dots);
      } catch { /* */ }
    };
    void loadCounts();
  }, [isAdmin, isClerk]);

  // For clerk, default to walk-in payment filter
  useEffect(() => {
    if (isClerk && activeTab === 'appointments') {
      // Clerk sees walk-in payments by default (handled in AppointmentsPanel)
    }
  }, [isClerk, activeTab]);

  const roleLabel: Record<string, string> = {
    administrator: 'Admin',
    agent: 'Agent',
    seller: 'Seller',
    buyer: 'Buyer',
    clerk: 'Clerk',
  };

  return (
    <div className="min-h-screen bg-[#060e1a] pt-20">
      <div className="flex h-[calc(100vh-5rem)]">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Sidebar ────────────────────────────────────── */}
        <aside
          className={`fixed top-20 left-0 z-50 h-[calc(100vh-5rem)] w-72 bg-gradient-to-b from-[#0c1f35] to-[#081729] border-r border-white/[0.06] flex flex-col transition-transform duration-300 ease-in-out lg:sticky lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* User card */}
          <div className="p-5 m-4 mb-0 rounded-xl bg-gradient-to-br from-white/[0.06] to-transparent border border-white/[0.06]">
            <div className="flex items-center gap-3">
              {auth?.user.avatar && failedSidebarAvatarSrc !== auth.user.avatar ? (
                <img
                  src={resolveAssetUrl(auth.user.avatar)}
                  alt=""
                  className="w-11 h-11 rounded-xl object-cover ring-2 ring-white/10 shadow-lg"
                  onError={() => setFailedSidebarAvatarSrc(auth.user.avatar)}
                />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#D4A574] to-[#b8895c] flex items-center justify-center text-navy font-bold text-sm shadow-lg shadow-[#D4A574]/20">
                  {auth?.user.firstName?.charAt(0)}{auth?.user.lastName?.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate">
                  {auth?.user.firstName} {auth?.user.lastName}
                </p>
                <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-sand/15 text-sand">
                  {roleLabel[role ?? ''] ?? role}
                </span>
              </div>
            </div>
          </div>

          {/* Close button (mobile) */}
          <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-blue hover:text-white hover:bg-white/10 lg:hidden">
            <X className="w-4 h-4" />
          </button>

          {/* Navigation groups */}
          <nav className="flex-1 overflow-y-auto py-4 px-4 space-y-5">
            {groups.map((group) => (
              <div key={group}>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-blue/60 mb-2 px-3">{group}</p>
                <div className="space-y-0.5">
                  {tabs.filter((t) => (t.group ?? '') === group).map((t) => {
                    const isActive = activeTab === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => { setActiveTab(t.key); setSidebarOpen(false); clearDot(t.key); }}
                        className={`group w-full flex items-center gap-3 px-3 py-2.5 text-[13px] rounded-lg transition-all duration-200 ${
                          isActive
                            ? 'bg-sand/12 text-sand shadow-sm shadow-sand/5'
                            : 'text-gray-blue hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className={`p-1.5 rounded-md transition-colors ${isActive ? 'bg-sand/15' : 'bg-white/[0.04] group-hover:bg-white/[0.06]'}`}>
                          <t.icon className="w-3.5 h-3.5 flex-shrink-0" />
                        </div>
                        <span className="flex-1 text-left">{t.label}</span>
                        {notifDots[t.key] ? (
                          <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30">
                            {notifDots[t.key]}
                          </span>
                        ) : isActive ? (
                          <ChevronRight className="w-3 h-3 opacity-50" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="p-4 border-t border-white/[0.06]">
            {roleHasPermission(role, 'create_listing') && (
              <Link
                to="/sell"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-lg hover:shadow-lg hover:shadow-[#D4A574]/20 transition-all duration-200 text-sm"
              >
                <Plus className="w-4 h-4" /> New Listing
              </Link>
            )}
          </div>
        </aside>

        {/* ── Main Content ───────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {/* Top bar */}
          <div className="sticky top-0 z-30 bg-[#060e1a]/80 backdrop-blur-xl border-b border-white/[0.04]">
            <div className="flex items-center justify-between px-6 lg:px-8 h-16">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 rounded-lg bg-white/5 text-gray-blue hover:text-white hover:bg-white/10 transition-colors lg:hidden"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-lg font-display font-bold text-white">
                    {tabs.find((t) => t.key === activeTab)?.label ?? 'Dashboard'}
                  </h1>
                  <p className="text-gray-blue text-xs hidden sm:block">
                    {isAdmin ? 'Administrator Dashboard' : `${roleLabel[role ?? ''] ?? ''} Dashboard`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/listings" className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-blue hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
                  <Search className="w-3.5 h-3.5" />
                  Browse Listings
                </Link>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div className="px-6 lg:px-8 py-6">
            {activeTab === 'my-listings' && <MyListingsPanel ownerId={isAdmin ? undefined : userId} />}
            {activeTab === 'approvals' && isAdmin && <ApprovalsPanel onAction={() => decrementDot('approvals')} />}
            {activeTab === 'inquiries' && <InquiriesPanel onAction={() => decrementDot('inquiries')} />}
            {activeTab === 'appointments' && <AppointmentsPanel clerkMode={isClerk} onAction={() => decrementDot('appointments')} />}
            {activeTab === 'favorites' && <FavoritesPanel />}
            {activeTab === 'payments' && <PaymentsPanel onAction={() => decrementDot('payments')} />}
            {activeTab === 'reservations' && <ReservationsPanel onAction={() => decrementDot('reservations')} />}
            {activeTab === 'users' && (isAdmin || isClerk) && <AdminUsersTab />}
            {activeTab === 'analytics' && isAdmin && <AdminAnalyticsTab />}
            {activeTab === 'audit' && isAdmin && <AdminAuditTab />}
            {activeTab === 'system' && isAdmin && <AdminSystemTab />}
            {activeTab === 'profile' && <ProfileTab />}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ================================================================
   Sub-panels for built-in tabs
   ================================================================ */

function MyListingsPanel({ ownerId }: { ownerId?: number }) {
  const [listings, setListings] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getProperties(ownerId ? { ownerId } : undefined);
        setListings(data.items);
      } catch { /* */ }
      setLoading(false);
    };
    void load();
  }, [ownerId]);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this listing?')) return;
    try {
      await deleteProperty(id);
      setListings((prev) => prev.filter((p) => p.id !== id));
    } catch { /* */ }
  };

  if (loading) return <PanelSkeleton rows={4} />;
  if (!listings.length) return <EmptyState icon={Home} title="No listings yet" description={ownerId ? "Your property listings will appear here." : "Property listings will appear here once sellers add them."} />;

  const drafts = listings.filter((p) => p.status === 'draft').length;
  const pendingApproval = listings.filter((p) => p.status === 'pending_approval').length;
  const available = listings.filter((p) => p.status === 'available').length;
  const reserved = listings.filter((p) => p.status === 'reserved' || p.status === 'under_offer').length;

  return (
    <div>
      <QuickStats items={[
        { label: 'Total', value: listings.length, icon: Building2, color: 'bg-sand/15 text-sand' },
        { label: 'Available', value: available, icon: CheckCircle, color: 'bg-green-500/15 text-green-400' },
        { label: 'Pending Approval', value: pendingApproval, icon: Clock, color: 'bg-yellow-500/15 text-yellow-400' },
        { label: 'Drafts', value: drafts, icon: FileText, color: 'bg-slate-500/15 text-slate-300' },
        { label: 'Reserved / Offer', value: reserved, icon: Bookmark, color: 'bg-orange-500/15 text-orange-400' },
      ]} />
      <div className="space-y-3">
        {listings.map((p) => (
          <div key={p.id} className="group flex items-center gap-4 rounded-xl bg-gradient-to-r from-white/[0.05] to-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] p-4 transition-all duration-200">
            <Link to={`/property/${p.id}`} className="flex-shrink-0">
              <img src={p.image} alt="" className="w-24 h-18 object-cover rounded-lg ring-1 ring-white/10" />
            </Link>
            <div className="flex-1 min-w-0">
              <Link to={`/property/${p.id}`} className="text-white font-semibold hover:text-sand truncate block transition-colors">
                {p.title}
              </Link>
              <div className="flex items-center gap-3 mt-1 text-gray-blue text-sm">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {p.city}</span>
                {p.beds > 0 && <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" /> {p.beds}</span>}
                {p.baths > 0 && <span className="flex items-center gap-1"><Bath className="w-3 h-3" /> {p.baths}</span>}
              </div>
              <p className="text-sand font-semibold text-sm mt-1">{formatPrice(p.price)}</p>
            </div>
            <StatusBadge status={p.status} />
            <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg text-gray-blue hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovalsPanel({ onAction }: { onAction?: () => void }) {
  const [pending, setPending] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getProperties({ status: 'pending_approval' });
        setPending(data.items);
      } catch { /* */ }
      setLoading(false);
    };
    void load();
  }, []);

  const handle = async (id: number, action: 'approve' | 'reject') => {
    try {
      if (action === 'approve') await approveProperty(id);
      else await rejectProperty(id);
      setPending((prev) => prev.filter((p) => p.id !== id));
      onAction?.();
    } catch { /* */ }
  };

  if (loading) return <PanelSkeleton />;
  if (!pending.length) return <EmptyState icon={ShieldCheck} title="All caught up!" description="No pending listings require review." />;

  return (
    <div>
      <QuickStats items={[
        { label: 'Pending Review', value: pending.length, icon: ShieldCheck, color: 'bg-yellow-500/15 text-yellow-400' },
      ]} />
      <div className="space-y-3">
        {pending.map((p) => (
          <div key={p.id} className="rounded-xl bg-gradient-to-r from-white/[0.05] to-white/[0.02] border border-white/[0.06] p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <Link to={`/property/${p.id}`} className="flex-shrink-0">
                <img src={p.image} alt="" className="w-full sm:w-28 h-40 sm:h-20 object-cover rounded-lg ring-1 ring-white/10" />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/property/${p.id}`} className="text-white font-semibold hover:text-sand block truncate transition-colors">
                  {p.title}
                </Link>
                <p className="text-gray-blue text-sm mt-0.5">
                  Listed by <span className="text-white">{p.ownerName}</span>
                </p>
                <div className="flex items-center gap-3 mt-1 text-gray-blue text-xs">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {p.city}</span>
                  <span className="text-sand font-semibold">{formatPrice(p.price)}</span>
                </div>
                {p.proofDocument && (
                  <div className="mt-2">
                    <a href={p.proofDocument} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-blue-500/15 text-blue-400 rounded-lg hover:bg-blue-500/25 font-medium transition-colors ring-1 ring-blue-500/20">
                      <FileText className="w-3.5 h-3.5" /> View Proof Document
                    </a>
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0 relative z-10">
                <button onClick={() => handle(p.id, 'approve')} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-500/15 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/25 active:scale-95 transition-all cursor-pointer">
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
                <button onClick={() => handle(p.id, 'reject')} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-500/15 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/25 active:scale-95 transition-all cursor-pointer">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InquiriesPanel({ onAction }: { onAction?: () => void }) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const auth = getStoredAuth();
  const userId = auth?.user.id;
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try { setInquiries((await getInquiries()).items); } catch { /* */ }
      setLoading(false);
    };
    void load();
  }, []);

  const selected = inquiries.find((i) => i.id === selectedId);

  // Auto-scroll to bottom of chat when selected changes or messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedId, selected?.messages?.length, selected?.reply]);

  const handleSendMessage = async (id: number) => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const updated = await sendInquiryMessage(id, replyText);
      setInquiries((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setReplyText('');
    } catch { /* */ }
    setSending(false);
  };

  const handleMarkRead = async (id: number) => {
    try {
      const updated = await markInquiryRead(id);
      setInquiries((prev) => prev.map((i) => (i.id === id ? updated : i)));
      onAction?.();
    } catch { /* */ }
  };

  if (loading) return <PanelSkeleton />;
  if (!inquiries.length) return <EmptyState icon={MessageSquare} title="No inquiries" description="Inquiries about properties will appear here." />;

  const unreadCount = inquiries.filter((i) => i.status === 'unread').length;

  // Build full message list for selected conversation
  const buildChatMessages = (inq: Inquiry): { senderId: number; senderName: string; text: string; time: string }[] => {
    const msgs: { senderId: number; senderName: string; text: string; time: string }[] = [];
    // Original inquiry message
    msgs.push({ senderId: inq.senderId, senderName: inq.senderName, text: inq.message, time: inq.createdAt });
    // Legacy single reply
    if (inq.reply) {
      msgs.push({ senderId: inq.receiverId, senderName: inq.receiverName, text: inq.reply, time: inq.updatedAt });
    }
    // Multi-message thread
    if (inq.messages?.length) {
      for (const m of inq.messages) {
        msgs.push({ senderId: m.senderId, senderName: m.senderName, text: m.message, time: m.createdAt });
      }
    }
    return msgs;
  };

  // Preview text for conversation list
  const getPreview = (inq: Inquiry) => {
    if (inq.messages?.length) return inq.messages[inq.messages.length - 1].message;
    if (inq.reply) return inq.reply;
    return inq.message;
  };

  return (
    <div>
      <QuickStats items={[
        { label: 'Total', value: inquiries.length, icon: MessageSquare, color: 'bg-sand/15 text-sand' },
        { label: 'Unread', value: unreadCount, icon: AlertCircle, color: 'bg-yellow-500/15 text-yellow-400' },
        { label: 'Replied', value: inquiries.filter((i) => i.status === 'replied').length, icon: CheckCircle, color: 'bg-green-500/15 text-green-400' },
      ]} />

      <div className="flex gap-4 h-[500px]">
        {/* Conversation list (left) */}
        <div className="w-80 flex-shrink-0 border border-white/[0.06] rounded-xl overflow-hidden flex flex-col bg-white/[0.02]">
          <div className="p-3 border-b border-white/[0.06]">
            <p className="text-white text-sm font-semibold">Conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {inquiries.map((inq) => {
              const isMe = inq.senderId === userId;
              const otherName = isMe ? inq.receiverName : inq.senderName;
              const initial = otherName.charAt(0).toUpperCase();
              return (
                <button
                  key={inq.id}
                  onClick={() => {
                    setSelectedId(inq.id);
                    setReplyText('');
                    if (inq.status === 'unread' && !isMe) handleMarkRead(inq.id);
                  }}
                  className={`w-full p-3 text-left flex items-start gap-3 border-b border-white/[0.04] transition-colors ${
                    selectedId === inq.id ? 'bg-sand/10' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sand/30 to-sand/10 flex items-center justify-center flex-shrink-0 border border-white/10">
                    <span className="text-sand text-sm font-semibold">{initial}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-white text-sm font-medium truncate">{otherName}</p>
                      {inq.status === 'unread' && !isMe && (
                        <span className="w-2 h-2 rounded-full bg-sand flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-gray-blue text-xs truncate">{inq.propertyTitle}</p>
                    <p className="text-gray-blue text-[11px] truncate mt-0.5">{getPreview(inq)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area (right) */}
        <div className="flex-1 border border-white/[0.06] rounded-xl overflow-hidden flex flex-col bg-white/[0.02]">
          {selected ? (
            <>
              {/* Chat header */}
              <div className="p-4 border-b border-white/[0.06] flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sand/30 to-sand/10 flex items-center justify-center border border-white/10">
                  <span className="text-sand text-xs font-semibold">
                    {(selected.senderId === userId ? selected.receiverName : selected.senderName).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {selected.senderId === userId ? selected.receiverName : selected.senderName}
                  </p>
                  <Link to={`/property/${selected.propertyId}`} className="text-gray-blue text-xs hover:text-sand truncate block transition-colors">
                    Re: {selected.propertyTitle}
                  </Link>
                </div>
                <InquiryBadge status={selected.status} />
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {buildChatMessages(selected).map((msg, idx) => {
                  const isMyMsg = msg.senderId === userId;
                  return (
                    <div key={idx} className={`flex ${isMyMsg ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        isMyMsg ? 'bg-sand/20 rounded-br-md' : 'bg-white/[0.06] rounded-bl-md'
                      }`}>
                        <p className={`text-[11px] font-medium mb-1 ${isMyMsg ? 'text-sand' : 'text-gray-blue'}`}>
                          {msg.senderName}
                        </p>
                        <p className="text-white text-sm leading-relaxed">{msg.text}</p>
                        <p className="text-gray-blue/60 text-[10px] mt-1 text-right">{new Date(msg.time).toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Message input — always visible for both parties */}
              <div className="p-3 border-t border-white/[0.06]">
                <div className="flex gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(selected.id); } }}
                  />
                  <button
                    disabled={sending || !replyText.trim()}
                    onClick={() => handleSendMessage(selected.id)}
                    className="px-4 py-2.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy rounded-xl text-sm font-medium disabled:opacity-50 transition-all hover:shadow-lg hover:shadow-sand/20"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-10 h-10 text-gray-blue/30 mx-auto mb-3" />
                <p className="text-gray-blue text-sm">Select a conversation to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AppointmentsPanel({ clerkMode = false, onAction }: { clerkMode?: boolean; onAction?: () => void }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'viewing' | 'walk_in_payment'>(clerkMode ? 'walk_in_payment' : 'all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      try { setAppointments((await getAppointments()).items); } catch { /* */ }
      setLoading(false);
    };
    void load();
  }, []);

  const handleStatus = async (id: number, status: 'confirmed' | 'cancelled' | 'completed') => {
    try {
      const updated = await updateAppointmentStatus(id, status);
      setAppointments((prev) => prev.map((a) => (a.id === id ? updated : a)));
      if (status !== 'completed') onAction?.();
    } catch { /* */ }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this appointment?')) return;
    try {
      await deleteAppointment(id);
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } catch { /* */ }
  };

  if (loading) return <PanelSkeleton />;
  if (!appointments.length) return <EmptyState icon={Calendar} title={clerkMode ? 'No walk-in payments' : 'No appointments'} description={clerkMode ? 'Walk-in payment appointments will appear here.' : 'Scheduled property viewings will appear here.'} />;

  const pendingCount = appointments.filter((a) => a.status === 'pending').length;
  const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length;
  const viewingCount = appointments.filter((a) => (a.appointmentType ?? 'viewing') === 'viewing').length;
  const walkInCount = appointments.filter((a) => a.appointmentType === 'walk_in_payment').length;

  const formatApptId = (id: number) => `APT-${String(id).padStart(6, '0')}`;

  // Apply type filter
  let filtered = typeFilter === 'all'
    ? appointments
    : appointments.filter((a) => (a.appointmentType ?? 'viewing') === typeFilter);

  // Apply search (by ID, property title, or user name)
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter((a) =>
      formatApptId(a.id).toLowerCase().includes(q) ||
      String(a.id).includes(q) ||
      a.propertyTitle.toLowerCase().includes(q) ||
      a.userName.toLowerCase().includes(q) ||
      (a.agentName ?? '').toLowerCase().includes(q)
    );
  }

  return (
    <div>
      <QuickStats items={[
        { label: 'Total', value: appointments.length, icon: Calendar, color: 'bg-sand/15 text-sand' },
        { label: 'Pending', value: pendingCount, icon: Clock, color: 'bg-yellow-500/15 text-yellow-400' },
        { label: 'Confirmed', value: confirmedCount, icon: CheckCircle, color: 'bg-green-500/15 text-green-400' },
        { label: 'Walk-In Pay', value: walkInCount, icon: Store, color: 'bg-purple-500/15 text-purple-400' },
      ]} />

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by APT ID, property, buyer, or agent name..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-gray-blue/50 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
          />
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        {([
          { key: 'all' as const, label: 'All', count: appointments.length },
          { key: 'viewing' as const, label: 'Viewing', count: viewingCount },
          { key: 'walk_in_payment' as const, label: 'Walk-In Payment', count: walkInCount },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              typeFilter === tab.key
                ? 'bg-sand/15 text-sand ring-1 ring-sand/20'
                : 'bg-white/5 text-gray-blue hover:text-white hover:bg-white/10'
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] ${
              typeFilter === tab.key ? 'bg-sand/20 text-sand' : 'bg-white/10 text-gray-blue'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((appt) => {
          const isWalkIn = appt.appointmentType === 'walk_in_payment';
          return (
            <div key={appt.id} className="group rounded-xl bg-gradient-to-r from-white/[0.05] to-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] p-5 transition-all duration-200">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Appointment ID + type badge */}
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded-md text-[11px] font-mono text-gray-blue">
                      <Hash className="w-3 h-3" /> {formatApptId(appt.id)}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md ${
                      isWalkIn
                        ? 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20'
                        : 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20'
                    }`}>
                      {isWalkIn ? <><Store className="w-3 h-3" /> Walk-In Payment</> : <><Eye className="w-3 h-3" /> Viewing</>}
                    </span>
                    <ApptBadge status={appt.status} />
                  </div>
                  <p className="text-white font-semibold">{appt.propertyTitle}</p>
                  <p className="text-gray-blue text-sm mt-1">
                    {appt.userName} {appt.agentName ? <span>· Agent: <span className="text-white">{appt.agentName}</span></span> : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-lg text-sm">
                      <Calendar className="w-3.5 h-3.5 text-sand" />
                      <span className="text-white font-medium">{appt.appointmentDate}</span>
                      <span className="text-gray-blue">at</span>
                      <span className="text-white font-medium">{appt.appointmentTime}</span>
                    </div>
                  </div>
                  {appt.notes && (
                    <p className="text-gray-blue text-xs mt-2 bg-white/[0.03] rounded-lg p-2">
                      <span className="text-sand text-[10px] uppercase tracking-wider font-semibold">Notes: </span>{appt.notes}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t border-white/[0.04]">
                {appt.status === 'pending' && (
                  <>
                    <button onClick={() => handleStatus(appt.id, 'confirmed')} className="flex items-center gap-1.5 text-xs px-4 py-2 bg-green-500/15 text-green-400 rounded-lg hover:bg-green-500/25 font-medium transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" /> Confirm Appointment
                    </button>
                    <button onClick={() => handleStatus(appt.id, 'cancelled')} className="flex items-center gap-1.5 text-xs px-3 py-2 bg-red-500/15 text-red-400 rounded-lg hover:bg-red-500/25 font-medium transition-colors">
                      <XCircle className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </>
                )}
                {appt.status === 'confirmed' && (
                  <button onClick={() => handleStatus(appt.id, 'completed')} className="flex items-center gap-1.5 text-xs px-4 py-2 bg-blue-500/15 text-blue-400 rounded-lg hover:bg-blue-500/25 font-medium transition-colors">
                    <CheckCircle className="w-3.5 h-3.5" /> Mark Complete
                  </button>
                )}
                {!clerkMode && (
                  <button onClick={() => handleDelete(appt.id)} className="text-xs px-2 py-1.5 text-gray-blue hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ml-auto">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!filtered.length && (
          <div className="text-center py-8 text-gray-blue text-sm">
            {searchQuery ? 'No appointments match your search.' : `No ${typeFilter === 'viewing' ? 'viewing' : 'walk-in payment'} appointments found.`}
          </div>
        )}
      </div>
    </div>
  );
}

function FavoritesPanel() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { setFavorites(await getFavorites()); } catch { /* */ }
      setLoading(false);
    };
    void load();
  }, []);

  const handleRemove = async (propertyId: number) => {
    try {
      await removeFavorite(propertyId);
      setFavorites((prev) => prev.filter((f) => f.propertyId !== propertyId));
    } catch { /* */ }
  };

  if (loading) return <PanelSkeleton />;
  if (!favorites.length) return <EmptyState icon={Heart} title="No favorites yet" description="Browse listings and save your favorites here." />;

  return (
    <div>
      <QuickStats items={[
        { label: 'Saved Properties', value: favorites.length, icon: Heart, color: 'bg-red-500/15 text-red-400' },
      ]} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {favorites.map((fav) => (
          <div key={fav.id} className="group rounded-xl overflow-hidden bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200">
            <Link to={`/property/${fav.propertyId}`} className="block relative">
              <img src={fav.property.image} alt="" className="w-full aspect-[16/10] object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            <div className="p-4">
              <Link to={`/property/${fav.propertyId}`} className="text-white font-semibold hover:text-sand block truncate transition-colors">
                {fav.property.title}
              </Link>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-blue text-sm flex items-center gap-1"><MapPin className="w-3 h-3" /> {fav.property.city}</span>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
                <p className="text-sand font-bold">{formatPrice(fav.property.price)}</p>
                <button onClick={() => handleRemove(fav.propertyId)} className="text-xs text-gray-blue hover:text-red-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors">
                  <Heart className="w-3 h-3 fill-current" /> Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Small UI components ──────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    draft: 'bg-slate-500/15 text-slate-300 ring-slate-500/20',
    pending_approval: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/20',
    available: 'bg-green-500/15 text-green-400 ring-green-500/20',
    reserved: 'bg-orange-500/15 text-orange-400 ring-orange-500/20',
    under_offer: 'bg-blue-500/15 text-blue-400 ring-blue-500/20',
    sold: 'bg-red-500/15 text-red-400 ring-red-500/20',
  };
  return (
    <span className={`px-2.5 py-1 text-xs font-medium rounded-lg ring-1 capitalize ${cls[status] ?? 'bg-white/10 text-gray-blue ring-white/10'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function InquiryBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: typeof AlertCircle }> = {
    unread: { cls: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/20', icon: AlertCircle },
    read: { cls: 'bg-blue-500/15 text-blue-400 ring-blue-500/20', icon: Eye },
    replied: { cls: 'bg-green-500/15 text-green-400 ring-green-500/20', icon: CheckCircle },
  };
  const info = map[status] ?? map.unread;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md ring-1 capitalize ${info.cls}`}>
      <info.icon className="w-3 h-3" /> {status}
    </span>
  );
}

function ApptBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/20',
    confirmed: 'bg-green-500/15 text-green-400 ring-green-500/20',
    cancelled: 'bg-red-500/15 text-red-400 ring-red-500/20',
    completed: 'bg-blue-500/15 text-blue-400 ring-blue-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md ring-1 capitalize ${cls[status] ?? ''}`}>
      <Clock className="w-3 h-3" /> {status}
    </span>
  );
}

/* ================================================================
   Payments Panel
   ================================================================ */

function PaymentsPanel({ onAction }: { onAction?: () => void }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const auth = getStoredAuth();
  const isAdmin = auth?.user.role === 'administrator';
  const isClerk = auth?.user.role === 'clerk';

  useEffect(() => {
    const load = async () => {
      try { setPayments((await getPayments()).items); } catch { /* */ }
      setLoading(false);
    };
    void load();
  }, []);

  const handleStatus = async (id: number, status: 'paid' | 'failed') => {
    try {
      const updated = await updatePaymentStatus(id, status);
      setPayments((prev) => prev.map((p) => (p.id === id ? updated : p)));
      onAction?.();
    } catch { /* */ }
  };

  if (loading) return <PanelSkeleton />;
  if (!payments.length) return <EmptyState icon={CreditCard} title="No payments yet" description="Payment records will appear here once transactions are initiated." />;

  const totalAmount = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const pending = payments.filter((p) => p.status === 'pending').length;

  const methodLabels: Record<string, string> = {
    bank_transfer: 'Bank Transfer', gcash: 'GCash', pagibig: 'Pag-IBIG', cash: 'Cash', credit_card: 'Credit Card',
  };
  const typeLabels: Record<string, string> = {
    reservation: 'Reservation Fee', down_payment: 'Down Payment', full_payment: 'Full Payment', monthly: 'Monthly Installment',
  };
  const methodIcons: Record<string, string> = {
    bank_transfer: '🏦', gcash: '📱', pagibig: '🏛️', cash: '💵', credit_card: '💳',
  };

  return (
    <div>
      <QuickStats items={[
        { label: 'Total Payments', value: payments.length, icon: CreditCard, color: 'bg-purple-500/15 text-purple-400' },
        { label: 'Paid', value: 'PHP ' + totalAmount.toLocaleString(), icon: CheckCircle, color: 'bg-green-500/15 text-green-400' },
        { label: 'Pending', value: pending, icon: Clock, color: 'bg-yellow-500/15 text-yellow-400' },
      ]} />
      <div className="space-y-3">
        {payments.map((pay) => {
          const isExpanded = expandedId === pay.id;
          return (
            <div key={pay.id} className="rounded-xl bg-gradient-to-r from-white/[0.04] to-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200 overflow-hidden">
              {/* Summary row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : pay.id)}
                className="w-full p-4 text-left flex items-center gap-4"
              >
                {pay.propertyImage && (
                  <img src={pay.propertyImage} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-white font-semibold truncate">{pay.propertyTitle}</span>
                    <PaymentBadge status={pay.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-blue">
                    <span className="text-white font-medium">₱{pay.amount.toLocaleString()}</span>
                    <span>{methodLabels[pay.paymentMethod] ?? pay.paymentMethod}</span>
                    <span>{new Date(pay.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 text-gray-blue transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>

              {/* Expanded detail view */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-white/[0.06] pt-4 animate-slide-up-fade">
                  {/* Detail grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                      <p className="text-[11px] text-gray-blue uppercase tracking-wider mb-1">Payment Type</p>
                      <p className="text-white text-sm font-medium">{typeLabels[pay.paymentType] ?? pay.paymentType}</p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                      <p className="text-[11px] text-gray-blue uppercase tracking-wider mb-1">Method</p>
                      <p className="text-white text-sm font-medium flex items-center gap-1.5">
                        <span>{methodIcons[pay.paymentMethod] ?? '💳'}</span>
                        {methodLabels[pay.paymentMethod] ?? pay.paymentMethod}
                      </p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                      <p className="text-[11px] text-gray-blue uppercase tracking-wider mb-1">Amount</p>
                      <p className="text-sand text-sm font-bold">₱{pay.amount.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                      <p className="text-[11px] text-gray-blue uppercase tracking-wider mb-1">Buyer</p>
                      <p className="text-white text-sm font-medium">{pay.buyerName}</p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                      <p className="text-[11px] text-gray-blue uppercase tracking-wider mb-1">Seller</p>
                      <p className="text-white text-sm font-medium">{pay.sellerName}</p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                      <p className="text-[11px] text-gray-blue uppercase tracking-wider mb-1">Date</p>
                      <p className="text-white text-sm font-medium">{new Date(pay.createdAt).toLocaleString()}</p>
                    </div>
                    {pay.referenceNo && (
                      <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                        <p className="text-[11px] text-gray-blue uppercase tracking-wider mb-1">Reference No.</p>
                        <p className="text-white text-sm font-mono">{pay.referenceNo}</p>
                      </div>
                    )}
                    {pay.updatedAt !== pay.createdAt && (
                      <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                        <p className="text-[11px] text-gray-blue uppercase tracking-wider mb-1">Last Updated</p>
                        <p className="text-white text-sm font-medium">{new Date(pay.updatedAt).toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {pay.notes && (
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                      <p className="text-[11px] text-gray-blue uppercase tracking-wider mb-1">Notes</p>
                      <p className="text-gray-blue text-sm leading-relaxed">{pay.notes}</p>
                    </div>
                  )}

                  {/* Proof of payment */}
                  {pay.proofUrl && (
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                      <p className="text-[11px] text-gray-blue uppercase tracking-wider mb-2">Proof of Payment</p>
                      <a href={pay.proofUrl} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={pay.proofUrl} alt="Payment proof" className="max-h-48 rounded-lg border border-white/10 hover:border-sand/30 transition-colors" />
                      </a>
                    </div>
                  )}

                  {/* Property link */}
                  {pay.propertyTitle && pay.propertyTitle !== '[Deleted Property]' ? (
                    <Link to={`/property/${pay.propertyId}`} className="inline-flex items-center gap-1.5 text-sand text-sm hover:underline">
                      <Eye className="w-3.5 h-3.5" /> View Property
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-gray-blue text-sm cursor-not-allowed">
                      <Eye className="w-3.5 h-3.5" /> Property no longer available
                    </span>
                  )}

                  {/* Actions */}
                  {(isAdmin || isClerk) && pay.status === 'pending' && (
                    <div className="flex gap-2 pt-3 border-t border-white/[0.06]">
                      <button onClick={() => handleStatus(pay.id, 'paid')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs hover:bg-green-500/20 transition-colors">
                        <CheckCircle className="w-3 h-3" /> Mark Paid
                      </button>
                      <button onClick={() => handleStatus(pay.id, 'failed')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs hover:bg-red-500/20 transition-colors">
                        <XCircle className="w-3 h-3" /> Mark Failed
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/20',
    paid: 'bg-green-500/15 text-green-400 ring-green-500/20',
    failed: 'bg-red-500/15 text-red-400 ring-red-500/20',
    refunded: 'bg-purple-500/15 text-purple-400 ring-purple-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md ring-1 capitalize ${cls[status] ?? ''}`}>
      <CreditCard className="w-3 h-3" /> {status}
    </span>
  );
}

/* ================================================================
   Reservations Panel
   ================================================================ */

function ReservationsPanel({ onAction }: { onAction?: () => void }) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [slipReservation, setSlipReservation] = useState<Reservation | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const slipRef = useRef<HTMLDivElement>(null);
  const auth = getStoredAuth();
  const isAdmin = auth?.user.role === 'administrator';
  const isClerk = auth?.user.role === 'clerk';
  const currentUserId = auth?.user.id;

  useEffect(() => {
    const load = async () => {
      try { setReservations((await getReservations()).items); } catch { /* */ }
      setLoading(false);
    };
    void load();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  const handleCancel = async (id: number) => {
    try {
      const updated = await updateReservationStatus(id, 'cancelled');
      setReservations((prev) => prev.map((r) => (r.id === id ? updated : r)));
      onAction?.();
    } catch { /* */ }
  };

  const handleComplete = async (id: number) => {
    try {
      const updated = await updateReservationStatus(id, 'completed');
      setReservations((prev) => prev.map((r) => (r.id === id ? updated : r)));
      onAction?.();
    } catch { /* */ }
  };

  const handleConfirm = async (id: number) => {
    try {
      const updated = await updateReservationStatus(id, 'active');
      setReservations((prev) => prev.map((r) => (r.id === id ? updated : r)));
      onAction?.();
    } catch { /* */ }
  };

  const printSlip = () => {
    if (!slipRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Reservation Confirmation Slip</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1a1a2e; }
        .slip { max-width: 520px; margin: 0 auto; border: 2px solid #1a1a2e; border-radius: 12px; padding: 32px; }
        .header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 16px; margin-bottom: 16px; }
        .header h1 { font-size: 20px; margin: 0 0 4px; }
        .header p { color: #666; font-size: 12px; margin: 0; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
        .row .label { color: #666; }
        .row .value { font-weight: 600; text-align: right; max-width: 60%; }
        .footer { text-align: center; margin-top: 20px; color: #999; font-size: 11px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      ${slipRef.current.innerHTML}
      <script>window.print(); window.close();</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  if (loading) return <PanelSkeleton />;
  if (!reservations.length) return <EmptyState icon={Bookmark} title="No reservations" description="Your property reservations will appear here." />;

  const active = reservations.filter((r) => r.status === 'active').length;
  const pending = reservations.filter((r) => r.status === 'pending').length;
  const expired = reservations.filter((r) => r.status === 'expired').length;
  const completed = reservations.filter((r) => r.status === 'completed').length;

  const statusCls: Record<string, string> = {
    pending: 'bg-orange-500/15 text-orange-400 ring-orange-500/20',
    active: 'bg-green-500/15 text-green-400 ring-green-500/20',
    expired: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/20',
    cancelled: 'bg-red-500/15 text-red-400 ring-red-500/20',
    completed: 'bg-blue-500/15 text-blue-400 ring-blue-500/20',
  };

  return (
    <div>
      <QuickStats items={[
        { label: 'Total', value: reservations.length, icon: Bookmark, color: 'bg-sand/15 text-sand' },
        { label: 'Pending', value: pending, icon: Clock, color: 'bg-orange-500/15 text-orange-400' },
        { label: 'Active', value: active, icon: CheckCircle, color: 'bg-green-500/15 text-green-400' },
        { label: 'Expired', value: expired, icon: Clock, color: 'bg-yellow-500/15 text-yellow-400' },
        { label: 'Completed', value: completed, icon: Building2, color: 'bg-blue-500/15 text-blue-400' },
      ]} />
      <div className="space-y-3">
        {reservations.map((res) => {
          const expiresDate = new Date(res.expiresAt);
          const isExpired = res.status === 'active' && expiresDate.getTime() < currentTime;
          const daysLeft = res.status === 'active'
            ? Math.max(0, Math.ceil((expiresDate.getTime() - currentTime) / (1000 * 60 * 60 * 24)))
            : 0;

          return (
            <div key={res.id} className="group rounded-xl bg-gradient-to-r from-white/[0.05] to-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] p-5 transition-all duration-200">
              <div className="flex items-start gap-4">
                {res.propertyImage && (
                  <Link to={`/property/${res.propertyId}`} className="flex-shrink-0">
                    <img src={res.propertyImage} alt="" className="w-20 h-16 object-cover rounded-lg ring-1 ring-white/10" />
                  </Link>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link to={`/property/${res.propertyId}`} className="text-white font-semibold hover:text-sand truncate transition-colors">
                      {res.propertyTitle}
                    </Link>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md ring-1 capitalize ${statusCls[isExpired ? 'expired' : res.status] ?? ''}`}>
                      {isExpired ? 'expired' : res.status}
                    </span>
                  </div>
                  {isAdmin && <p className="text-gray-blue text-sm">Reserved by: <span className="text-white">{res.userName}</span></p>}
                  {!isAdmin && res.userId !== currentUserId && <p className="text-gray-blue text-sm">Reserved by: <span className="text-white">{res.userName}</span></p>}
                  {res.userId === currentUserId && <p className="text-gray-blue text-sm">Owner: <span className="text-white">{res.ownerName}</span></p>}
                  <div className="flex items-center gap-3 mt-2 text-sm">
                    <span className="text-gray-blue">
                      Expires: <span className="text-white">{expiresDate.toLocaleDateString()}</span>
                    </span>
                    {res.status === 'active' && !isExpired && (
                      <span className={`text-xs font-medium ${daysLeft <= 2 ? 'text-red-400' : 'text-green-400'}`}>
                        {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                      </span>
                    )}
                  </div>
                  {res.notes && <p className="text-gray-blue text-xs mt-1">{res.notes}</p>}
                </div>
              </div>
              {(res.status === 'active' || res.status === 'pending') && !isExpired && (
                <div className="flex gap-2 mt-4 pt-3 border-t border-white/[0.04]">
                  {res.status === 'pending' && (isAdmin || isClerk) && (
                    <button onClick={() => handleConfirm(res.id)} className="flex items-center gap-1.5 text-xs px-4 py-2 bg-green-500/15 text-green-400 rounded-lg hover:bg-green-500/25 font-medium transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" /> Confirm Reservation
                    </button>
                  )}
                  {res.status === 'active' && res.userId === currentUserId && (
                    <button onClick={() => setSlipReservation(res)} className="flex items-center gap-1.5 text-xs px-4 py-2 bg-sand/15 text-sand rounded-lg hover:bg-sand/25 font-medium transition-colors">
                      <Printer className="w-3.5 h-3.5" /> View Confirmation Slip
                    </button>
                  )}
                  {res.status === 'active' && (isAdmin || isClerk) && (
                    <button onClick={() => handleComplete(res.id)} className="flex items-center gap-1.5 text-xs px-4 py-2 bg-blue-500/15 text-blue-400 rounded-lg hover:bg-blue-500/25 font-medium transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
                    </button>
                  )}
                  <button onClick={() => handleCancel(res.id)} className="flex items-center gap-1.5 text-xs px-3 py-2 bg-red-500/15 text-red-400 rounded-lg hover:bg-red-500/25 font-medium transition-colors">
                    <XCircle className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Confirmation Slip Modal ── */}
      {slipReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-navy-light border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full p-6 relative">
            <button onClick={() => setSlipReservation(null)} className="absolute top-4 right-4 text-gray-blue hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-white font-display text-lg font-bold mb-4 text-center">Reservation Confirmed</h3>

            {/* Hidden printable content */}
            <div className="hidden">
              <div ref={slipRef}>
                <div className="slip">
                  <div className="header">
                    <h1>Brader Real Estate</h1>
                    <p>Reservation Confirmation Slip</p>
                  </div>
                  <div className="row"><span className="label">Reservation ID</span><span className="value">#{slipReservation.id}</span></div>
                  <div className="row"><span className="label">Property</span><span className="value">{slipReservation.propertyTitle}</span></div>
                  <div className="row"><span className="label">Location</span><span className="value">{[slipReservation.propertyAddress, slipReservation.propertyCity, slipReservation.propertyProvince].filter(Boolean).join(', ')}</span></div>
                  <div className="row"><span className="label">Buyer</span><span className="value">{slipReservation.userName}</span></div>
                  <div className="row"><span className="label">Agent / Owner</span><span className="value">{slipReservation.ownerName}</span></div>
                  <div className="row"><span className="label">Confirmed On</span><span className="value">{new Date(slipReservation.updatedAt).toLocaleString()}</span></div>
                  <div className="row"><span className="label">Expires</span><span className="value">{new Date(slipReservation.expiresAt).toLocaleDateString()}</span></div>
                  <div className="footer">This slip serves as proof of reservation confirmation.</div>
                </div>
              </div>
            </div>

            {/* On-screen summary */}
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-gray-blue">Reservation ID</span><span className="text-white font-semibold">#{slipReservation.id}</span></div>
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-gray-blue">Property</span><span className="text-white font-semibold">{slipReservation.propertyTitle}</span></div>
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-gray-blue">Location</span><span className="text-white font-semibold text-right max-w-[60%]">{[slipReservation.propertyAddress, slipReservation.propertyCity, slipReservation.propertyProvince].filter(Boolean).join(', ')}</span></div>
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-gray-blue">Buyer</span><span className="text-white font-semibold">{slipReservation.userName}</span></div>
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-gray-blue">Agent / Owner</span><span className="text-white font-semibold">{slipReservation.ownerName}</span></div>
              <div className="flex justify-between py-2 border-b border-white/[0.06]"><span className="text-gray-blue">Confirmed On</span><span className="text-white font-semibold">{new Date(slipReservation.updatedAt).toLocaleString()}</span></div>
              <div className="flex justify-between py-2"><span className="text-gray-blue">Expires</span><span className="text-white font-semibold">{new Date(slipReservation.expiresAt).toLocaleDateString()}</span></div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={printSlip} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sand/15 text-sand rounded-lg hover:bg-sand/25 font-medium text-sm transition-colors">
                <Printer className="w-4 h-4" /> Print Slip
              </button>
              <button onClick={() => setSlipReservation(null)} className="flex-1 py-2.5 bg-white/[0.06] text-gray-blue rounded-lg hover:bg-white/[0.1] font-medium text-sm transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


