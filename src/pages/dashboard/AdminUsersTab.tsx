import { useState, useEffect } from 'react';
import { Users, Trash2, Plus, X, Shield, UserCheck, Store, ShoppingCart, ClipboardCheck, ShieldCheck, Clock, XCircle, AlertCircle, Eye, Check } from 'lucide-react';
import { getUsers, createUser, deleteUser, verifyUser, resolveAssetUrl, type AdminUser } from '../../lib/api';
import { ROLE_LABELS } from '../../lib/rbac';

const roleIcon: Record<string, typeof Shield> = {
  administrator: Shield,
  agent: UserCheck,
  seller: Store,
  buyer: ShoppingCart,
  clerk: ClipboardCheck,
};

const roleColor: Record<string, string> = {
  administrator: 'bg-purple-500/15 text-purple-400 ring-purple-500/20',
  agent: 'bg-blue-500/15 text-blue-400 ring-blue-500/20',
  seller: 'bg-green-500/15 text-green-400 ring-green-500/20',
  buyer: 'bg-sand/15 text-sand ring-sand/20',
  clerk: 'bg-cyan-500/15 text-cyan-400 ring-cyan-500/20',
};

export default function AdminUsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', userType: 'buyer' as string });
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  // Verification review
  const [reviewUser, setReviewUser] = useState<AdminUser | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try { setUsers((await getUsers()).items); } catch { /* */ }
      setLoading(false);
    };
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.firstName || !form.email || !form.password) {
      setFormError('First name, email, and password are required.');
      return;
    }
    setCreating(true);
    try {
      const newUser = await createUser(form);
      setUsers((prev) => [...prev, newUser]);
      setShowForm(false);
      setForm({ firstName: '', lastName: '', email: '', phone: '', password: '', userType: 'buyer' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed');
    }
    setCreating(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setVerificationError('Failed to delete user. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleVerify = async (action: 'verify' | 'reject') => {
    if (!reviewUser) return;
    setVerifying(true);
    setVerificationError('');
    try {
      await verifyUser(reviewUser.id, action, action === 'reject' ? rejectNotes : undefined);
      const refreshed = await getUsers();
      setUsers(refreshed.items);
      setReviewUser(null);
      setRejectNotes('');
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : 'Failed to update verification status');
    } finally {
      setVerifying(false);
    }
  };

  const pendingVerifications = users.filter((u) => u.verificationStatus === 'pending');
  const renderUserAvatar = (u: AdminUser, sizeClass = 'w-8 h-8') => {
    if (u.avatar) {
      return (
        <img
          src={resolveAssetUrl(u.avatar)}
          alt={`${u.firstName} ${u.lastName}`}
          className={`${sizeClass} rounded-lg object-cover ring-1 ring-white/10`}
        />
      );
    }

    return (
      <div className={`${sizeClass} rounded-lg bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-xs font-bold text-white`}>
        {u.firstName?.charAt(0)}{u.lastName?.charAt(0)}
      </div>
    );
  };

  if (loading) return <div className="space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="rounded-xl bg-white/5 h-16" />)}</div>;

  // Role breakdown
  const roleCounts = users.reduce<Record<string, number>>((acc, u) => { acc[u.userType] = (acc[u.userType] || 0) + 1; return acc; }, {});

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/[0.06] p-4">
          <p className="text-gray-blue text-xs font-medium uppercase tracking-wider">Total Users</p>
          <p className="text-2xl font-display font-bold text-white mt-1">{users.length}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-yellow-500/10 to-white/[0.02] border border-yellow-500/20 p-4">
          <p className="text-yellow-400 text-xs font-medium uppercase tracking-wider">Pending Verification</p>
          <p className="text-2xl font-display font-bold text-yellow-400 mt-1">{pendingVerifications.length}</p>
        </div>
        {Object.entries(ROLE_LABELS).map(([key, label]) => (
          <div key={key} className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/[0.06] p-4">
            <p className="text-gray-blue text-xs font-medium uppercase tracking-wider">{label}s</p>
            <p className="text-2xl font-display font-bold text-white mt-1">{roleCounts[key] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sand/15"><Users className="w-4 h-4 text-sand" /></div>
          User Management
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            showForm
              ? 'bg-white/5 text-gray-blue hover:text-white'
              : 'bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy hover:shadow-lg hover:shadow-[#D4A574]/20'
          }`}
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showForm ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl bg-gradient-to-r from-white/[0.05] to-white/[0.02] border border-white/[0.06] p-5 mb-5">
          <p className="text-white font-medium text-sm mb-4">Create New User</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input placeholder="First Name *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 placeholder:text-gray-blue/50 transition-all" />
            <input placeholder="Last Name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 placeholder:text-gray-blue/50 transition-all" />
            <input placeholder="Email *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 placeholder:text-gray-blue/50 transition-all" />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 placeholder:text-gray-blue/50 transition-all" />
            <input placeholder="Password *" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 placeholder:text-gray-blue/50 transition-all" />
            <select value={form.userType} onChange={(e) => setForm({ ...form, userType: e.target.value })} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all">
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k} className="bg-[#0c1f35]">{v}</option>)}
            </select>
          </div>
          {formError && <p className="text-red-400 text-sm mt-3">{formError}</p>}
          <button type="submit" disabled={creating} className="mt-4 px-5 py-2.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-[#D4A574]/20 disabled:opacity-50 transition-all">
            {creating ? 'Creating...' : 'Create User'}
          </button>
        </form>
      )}

      {/* Pending Verifications */}
      {pendingVerifications.length > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-yellow-500/10 to-white/[0.02] border border-yellow-500/20 p-5 mb-5">
          <h3 className="text-white font-semibold flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-yellow-400" /> Pending Verifications ({pendingVerifications.length})
          </h3>
          <div className="space-y-2">
            {pendingVerifications.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-3">
                  {renderUserAvatar(u, 'w-8 h-8')}
                  <div>
                    <p className="text-white text-sm font-medium">{u.firstName} {u.lastName}</p>
                    <p className="text-gray-blue text-xs">{u.email}</p>
                  </div>
                </div>
                <button onClick={() => { setReviewUser(u); setRejectNotes(''); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors">
                  <Eye className="w-3.5 h-3.5" /> Review
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl overflow-hidden border border-white/[0.06]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-blue text-xs uppercase tracking-wider bg-white/[0.03]">
                <th className="py-3 px-4 font-medium">User</th>
                <th className="py-3 px-4 font-medium">Email</th>
                <th className="py-3 px-4 font-medium">Role</th>
                <th className="py-3 px-4 font-medium">Verification</th>
                <th className="py-3 px-4 font-medium">Joined</th>
                <th className="py-3 px-4 font-medium w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {users.map((u) => {
                const RoleIcon = roleIcon[u.userType] ?? Users;
                const vBadge: Record<string, { cls: string; icon: typeof ShieldCheck; label: string }> = {
                  verified: { cls: 'bg-green-500/15 text-green-400 ring-green-500/20', icon: ShieldCheck, label: 'Verified' },
                  pending: { cls: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/20', icon: Clock, label: 'Pending' },
                  rejected: { cls: 'bg-red-500/15 text-red-400 ring-red-500/20', icon: XCircle, label: 'Rejected' },
                  unverified: { cls: 'bg-white/10 text-gray-blue ring-white/10', icon: AlertCircle, label: 'Unverified' },
                };
                const v = vBadge[u.verificationStatus] ?? vBadge.unverified;
                const VIcon = v.icon;
                return (
                  <tr key={u.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {renderUserAvatar(u, 'w-8 h-8')}
                        <span className="text-white font-medium">{u.firstName} {u.lastName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-blue">{u.email}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg ring-1 capitalize ${roleColor[u.userType] ?? 'bg-white/10 text-gray-blue ring-white/10'}`}>
                        <RoleIcon className="w-3 h-3" /> {u.userType}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <button
                          onClick={() => { if (u.verificationStatus === 'pending') { setReviewUser(u); setRejectNotes(''); } }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg ring-1 ${v.cls} ${u.verificationStatus === 'pending' ? 'cursor-pointer hover:brightness-125' : 'cursor-default'}`}
                        >
                          <VIcon className="w-3 h-3" /> {v.label}
                        </button>
                        {u.verifiedByName && (u.verificationStatus === 'verified' || u.verificationStatus === 'rejected') && (
                          <p className="text-gray-blue text-[10px] mt-1">by {u.verifiedByName}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-blue">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 px-4">
                      <button onClick={() => setDeleteTarget(u)} className="p-1.5 rounded-lg text-gray-blue hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verification Review Modal */}
      {reviewUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-[#0f2744] border border-white/10 p-6 shadow-2xl">
            <button onClick={() => setReviewUser(null)} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-blue hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-white font-semibold text-lg flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-sand" /> Verification Review
            </h3>

            {/* User info */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              {renderUserAvatar(reviewUser, 'w-10 h-10')}
              <div>
                <p className="text-white font-medium">{reviewUser.firstName} {reviewUser.lastName}</p>
                <p className="text-gray-blue text-xs">{reviewUser.email} &middot; {reviewUser.userType}</p>
              </div>
            </div>

            {verificationError && (
              <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {verificationError}
              </div>
            )}

            {/* Document preview */}
            {reviewUser.verificationDocument ? (
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-gray-blue text-xs font-medium uppercase tracking-wider">Submitted Document</p>
                  {reviewUser.idType && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20 capitalize">
                      {reviewUser.idType.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <img
                  src={resolveAssetUrl(reviewUser.verificationDocument)}
                  alt="Verification document"
                  className="w-full max-h-64 object-contain rounded-lg border border-white/10 bg-black/30"
                />
              </div>
            ) : (
              <p className="text-gray-blue text-sm mb-4">No document submitted.</p>
            )}

            {/* Rejection notes */}
            <div className="mb-4">
              <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">Notes (required for rejection)</label>
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 placeholder:text-gray-blue/50 transition-all resize-none"
                placeholder="Optional notes (required if rejecting)..."
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleVerify('verify')}
                disabled={verifying}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500/15 text-green-400 font-medium rounded-lg hover:bg-green-500/25 border border-green-500/20 disabled:opacity-50 transition-all text-sm"
              >
                <Check className="w-4 h-4" /> {verifying ? 'Processing...' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!rejectNotes.trim()) {
                    setVerificationError('Please provide rejection notes.');
                    return;
                  }
                  handleVerify('reject');
                }}
                disabled={verifying}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/15 text-red-400 font-medium rounded-lg hover:bg-red-500/25 border border-red-500/20 disabled:opacity-50 transition-all text-sm"
              >
                <XCircle className="w-4 h-4" /> {verifying ? 'Processing...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md mx-4 rounded-2xl bg-[#0f2744] border border-white/10 p-6 shadow-2xl">
            <button
              onClick={() => !deleting && setDeleteTarget(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-blue hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-white font-semibold text-lg mb-2">Delete User</h3>
            <p className="text-gray-blue text-sm mb-5">
              Delete {deleteTarget.firstName} {deleteTarget.lastName}? This action cannot be undone.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-white font-medium rounded-lg hover:bg-white/10 disabled:opacity-50 transition-all text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-500/15 text-red-400 font-medium rounded-lg hover:bg-red-500/25 border border-red-500/20 disabled:opacity-50 transition-all text-sm"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
