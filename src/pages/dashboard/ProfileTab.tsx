import { useState, useEffect } from 'react';
import { User, Mail, Phone, Lock, Save, FileText, CheckCircle, AlertCircle, Upload, ShieldCheck, Clock, XCircle } from 'lucide-react';
import { getProfile, updateProfile, changePassword, submitVerificationDocument, resolveAssetUrl, type ProfileData } from '../../lib/api';
import { updateStoredUser } from '../../lib/auth';
import ImageUpload from '../../components/ImageUpload';

function Toast({ message, type, onDone }: { message: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className={`fixed top-24 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slideIn_0.3s_ease] ${
      type === 'success' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'
    }`}>
      {type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {message}
    </div>
  );
}

export default function ProfileTab() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [failedAvatarSrc, setFailedAvatarSrc] = useState('');

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  // Verification
  const [verificationDoc, setVerificationDoc] = useState('');
  const [idType, setIdType] = useState('');
  const [submittingDoc, setSubmittingDoc] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getProfile();
        setProfile(data);
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setEmail(data.email);
        setPhone(data.phone ?? '');
        setBio(data.bio ?? '');
        setAvatar(data.avatar ?? '');
      } catch {
        setToast({ message: 'Failed to load profile', type: 'error' });
      }
      setLoading(false);
    };
    void load();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setToast({ message: 'First and last name are required', type: 'error' });
      return;
    }
    if (!email.trim()) {
      setToast({ message: 'Email is required', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim(), bio: bio.trim(), avatar: avatar.trim() });
      setProfile(updated);
      // Sync localStorage so the nav & sidebar immediately reflect changes
      updateStoredUser({
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phone: updated.phone ?? '',
        avatar: updated.avatar,
      });
      setToast({ message: 'Profile updated successfully', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to update profile', type: 'error' });
    }
    setSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw || !newPw) {
      setToast({ message: 'All password fields are required', type: 'error' });
      return;
    }
    if (newPw.length < 8) {
      setToast({ message: 'New password must be at least 8 characters', type: 'error' });
      return;
    }
    if (newPw !== confirmPw) {
      setToast({ message: 'New passwords do not match', type: 'error' });
      return;
    }

    setChangingPw(true);
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setToast({ message: 'Password changed successfully', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to change password', type: 'error' });
    }
    setChangingPw(false);
  };

  const handleSubmitVerification = async (documentUrl = verificationDoc, selectedIdType = idType) => {
    const trimmedDocumentUrl = documentUrl.trim();
    if (!trimmedDocumentUrl) {
      setToast({ message: 'Please upload a document first', type: 'error' });
      return;
    }
    if (!selectedIdType) {
      setToast({ message: 'Please select an ID type', type: 'error' });
      return;
    }
    setSubmittingDoc(true);
    try {
      const updated = await submitVerificationDocument(trimmedDocumentUrl, selectedIdType);
      setProfile(updated);
      setToast({ message: 'Verification document submitted for review', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to submit document', type: 'error' });
    }
    setSubmittingDoc(false);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="rounded-xl bg-white/5 h-48" />
        <div className="rounded-xl bg-white/5 h-64" />
      </div>
    );
  }

  const initials = (firstName?.charAt(0) ?? '') + (lastName?.charAt(0) ?? '');
  const roleLabel: Record<string, string> = { administrator: 'Admin', agent: 'Agent', seller: 'Seller', buyer: 'Buyer', clerk: 'Clerk' };

  const inputCls = 'w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 placeholder:text-gray-blue/50 transition-all';
  const handleVerificationDocumentChange = (value: string) => {
    setVerificationDoc(value);
  };

  const handleIdTypeChange = (value: string) => {
    setIdType(value);
  };

  return (
    <div className="max-w-3xl">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <div className="p-1.5 rounded-lg bg-sand/15"><User className="w-4 h-4 text-sand" /></div>
        <h2 className="text-white font-semibold">Edit Profile</h2>
      </div>

      {/* Avatar & name card */}
      <div className="rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.06] p-6 mb-6">
        <div className="flex items-center gap-5">
          <div className="relative group">
            {avatar && failedAvatarSrc !== avatar ? (
              <img
                src={resolveAssetUrl(avatar)}
                alt="Avatar"
                className="w-20 h-20 rounded-2xl object-cover ring-2 ring-white/10"
                onError={() => setFailedAvatarSrc(avatar)}
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#D4A574] to-[#b8895c] flex items-center justify-center text-navy font-bold text-xl shadow-lg shadow-[#D4A574]/20">
                {initials}
              </div>
            )}
          </div>
          <div>
            <p className="text-white font-bold text-lg">{firstName} {lastName}</p>
            <p className="text-gray-blue text-sm">{email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="inline-block px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-sand/15 text-sand">
                {roleLabel[profile?.role ?? ''] ?? profile?.role}
              </span>
              {profile?.isGoogleUser && (
                <span className="inline-block px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-blue-500/15 text-blue-300">
                  Google Account
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile form */}
      <form onSubmit={handleSaveProfile} className="rounded-xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.06] p-6 mb-6">
        <h3 className="text-white font-semibold flex items-center gap-2 mb-5">
          <User className="w-4 h-4 text-sand" /> Personal Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">First Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue/40" />
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={`${inputCls} pl-10`} placeholder="First name" />
            </div>
          </div>
          <div>
            <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">Last Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue/40" />
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={`${inputCls} pl-10`} placeholder="Last name" />
            </div>
          </div>
          <div>
            <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">Email Address *</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue/40" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} pl-10`} placeholder="your@email.com" />
            </div>
          </div>
          <div>
            <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue/40" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputCls} pl-10`} placeholder="+63 9XX XXX XXXX" />
            </div>
          </div>
          <div className="md:col-span-2">
            <ImageUpload
              label="Avatar"
              value={avatar}
              onChange={(value) => {
                setFailedAvatarSrc('');
                setAvatar(value);
              }}
              shape="round"
              previewSize="w-16 h-16"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">Bio</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 w-4 h-4 text-gray-blue/40" />
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={`${inputCls} pl-10 resize-none`} placeholder="Tell us about yourself..." />
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-lg hover:shadow-lg hover:shadow-[#D4A574]/20 disabled:opacity-50 transition-all text-sm">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Verification section */}
      <div className="rounded-xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.06] p-6 mb-6">
        <h3 className="text-white font-semibold flex items-center gap-2 mb-5">
          <ShieldCheck className="w-4 h-4 text-sand" /> Identity Verification
        </h3>

        {/* Status badge */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-gray-blue text-sm">Status:</span>
          {profile?.verificationStatus === 'verified' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-green-500/15 text-green-400 ring-1 ring-green-500/20">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified
            </span>
          )}
          {profile?.verificationStatus === 'pending' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/20">
              <Clock className="w-3.5 h-3.5" /> Pending Review
            </span>
          )}
          {profile?.verificationStatus === 'rejected' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-red-500/15 text-red-400 ring-1 ring-red-500/20">
              <XCircle className="w-3.5 h-3.5" /> Rejected
            </span>
          )}
          {(!profile?.verificationStatus || profile.verificationStatus === 'unverified') && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-white/10 text-gray-blue ring-1 ring-white/10">
              <AlertCircle className="w-3.5 h-3.5" /> Not Verified
            </span>
          )}
        </div>

        {/* Rejection notes */}
        {profile?.verificationStatus === 'rejected' && profile.verificationNotes && (
          <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-sm"><strong>Reason:</strong> {profile.verificationNotes}</p>
          </div>
        )}

        {/* Already verified */}
        {profile?.verificationStatus === 'verified' && (
          <p className="text-green-400/80 text-sm">Your identity has been verified. No further action is needed.</p>
        )}

        {/* Pending */}
        {profile?.verificationStatus === 'pending' && (
          <div>
            <p className="text-yellow-400/80 text-sm mb-3">Your document is under review. You&apos;ll be notified once it&apos;s processed.</p>
            {profile.verificationDocument && (
              <div className="mt-2">
                <p className="text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">Submitted Document</p>
                <img src={resolveAssetUrl(profile.verificationDocument)} alt="Verification document" className="max-w-xs rounded-lg border border-white/10" />
              </div>
            )}
          </div>
        )}

        {/* Upload form — show for unverified or rejected */}
        {(!profile?.verificationStatus || profile.verificationStatus === 'unverified' || profile.verificationStatus === 'rejected') && (
          <div>
            <p className="text-gray-blue text-sm mb-4">Upload a valid government-issued ID to verify your identity.</p>
            <div className="mb-4">
              <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">Type of ID *</label>
              <select
                value={idType}
                onChange={(e) => handleIdTypeChange(e.target.value)}
                className="w-full max-w-xs px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
              >
                <option value="" className="bg-[#0c1f35]">Select ID type...</option>
                <option value="passport" className="bg-[#0c1f35]">Passport</option>
                <option value="drivers_license" className="bg-[#0c1f35]">Driver&apos;s License</option>
                <option value="national_id" className="bg-[#0c1f35]">National ID (PhilID)</option>
                <option value="sss_id" className="bg-[#0c1f35]">SSS ID</option>
                <option value="philhealth_id" className="bg-[#0c1f35]">PhilHealth ID</option>
                <option value="voters_id" className="bg-[#0c1f35]">Voter&apos;s ID</option>
                <option value="prc_id" className="bg-[#0c1f35]">PRC ID</option>
                <option value="umid" className="bg-[#0c1f35]">UMID</option>
                <option value="postal_id" className="bg-[#0c1f35]">Postal ID</option>
                <option value="tin_id" className="bg-[#0c1f35]">TIN ID</option>
              </select>
            </div>
            <ImageUpload
              label="Verification Document"
              value={verificationDoc}
              onChange={handleVerificationDocumentChange}
              shape="square"
              previewSize="w-40 h-28"
            />
            <button
              type="button"
              onClick={() => { void handleSubmitVerification(); }}
              disabled={submittingDoc || !verificationDoc.trim() || !idType}
              className="mt-4 flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-lg hover:shadow-lg hover:shadow-[#D4A574]/20 disabled:opacity-50 transition-all text-sm"
            >
              <Upload className="w-4 h-4" /> {submittingDoc ? 'Submitting...' : 'Submit for Verification'}
            </button>
          </div>
        )}
      </div>

      {/* Password form — not available for Google sign-in users */}
      {!profile?.isGoogleUser && (
      <form onSubmit={handleChangePassword} className="rounded-xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.06] p-6">
        <h3 className="text-white font-semibold flex items-center gap-2 mb-5">
          <Lock className="w-4 h-4 text-sand" /> Change Password
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">Current Password *</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue/40" />
              <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={`${inputCls} pl-10`} placeholder="••••••••" />
            </div>
          </div>
          <div>
            <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">New Password *</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue/40" />
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={`${inputCls} pl-10`} placeholder="Min 8 characters" />
            </div>
          </div>
          <div>
            <label className="block text-gray-blue text-xs font-medium uppercase tracking-wider mb-1.5">Confirm New Password *</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue/40" />
              <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={`${inputCls} pl-10`} placeholder="Re-enter password" />
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button type="submit" disabled={changingPw} className="flex items-center gap-2 px-6 py-2.5 bg-white/5 border border-white/10 text-white font-medium rounded-lg hover:bg-white/10 disabled:opacity-50 transition-all text-sm">
            <Lock className="w-4 h-4" /> {changingPw ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>
      )}
    </div>
  );
}
