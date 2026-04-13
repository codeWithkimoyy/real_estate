import { Upload, Image as ImageIcon, Loader2, CheckCircle, AlertCircle, ShieldCheck, ArrowLeft, LogIn, LayoutDashboard, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createProperty, uploadFile, getProfile } from '../lib/api';
import { isLoggedIn, getStoredAuth } from '../lib/auth';

const PROPERTY_TYPES = ['house', 'condo', 'townhome', 'apartment', 'lot'] as const;

/* ── Inline upload helpers for this page ─────────────────── */

function MainImageUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handle = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only image files allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Max 5 MB'); return; }
    setError('');
    setUploading(true);
    try { const r = await uploadFile(file); onChange(r.url); } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    setUploading(false);
  };

  return (
    <div>
      {value ? (
        <div className="relative inline-block group">
          <img src={value} alt="Main" className="h-40 rounded-lg object-cover ring-2 ring-white/10" />
          <button type="button" onClick={() => onChange('')} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center h-40 border-2 border-dashed border-white/15 rounded-lg cursor-pointer hover:border-white/30 hover:bg-white/[0.03] transition-all ${uploading ? 'pointer-events-none' : ''}`}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handle(f); }}>
          {uploading ? <Loader2 className="w-8 h-8 text-sand animate-spin" /> : <Upload className="w-8 h-8 text-gray-blue/40 mb-2" />}
          <span className="text-sm text-gray-blue/60">{uploading ? 'Uploading...' : 'Click or drag image here'}</span>
          <span className="text-[11px] text-gray-blue/40 mt-1">JPG, PNG, GIF, WEBP (max 5 MB)</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ''; }} />
        </label>
      )}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

function MultiImageUpload({ values, onChange }: { values: string[]; onChange: (urls: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handle = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only image files allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Max 5 MB'); return; }
    setError('');
    setUploading(true);
    try { const r = await uploadFile(file); onChange([...values, r.url]); } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    setUploading(false);
  };

  const remove = (idx: number) => onChange(values.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3">
        {values.map((url, i) => (
          <div key={i} className="relative group">
            <img src={url} alt={`Extra ${i + 1}`} className="w-24 h-24 rounded-lg object-cover ring-1 ring-white/10" />
            <button type="button" onClick={() => remove(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
        <label className={`w-24 h-24 border-2 border-dashed border-white/15 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-white/30 hover:bg-white/[0.03] transition-all ${uploading ? 'pointer-events-none' : ''}`}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handle(f); }}>
          {uploading ? <Loader2 className="w-5 h-5 text-sand animate-spin" /> : (
            <>
              <ImageIcon className="w-5 h-5 text-gray-blue/40" />
              <span className="text-[10px] text-gray-blue/40 mt-1">Add</span>
            </>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ''; }} />
        </label>
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

const INITIAL = {
  title: '',
  address: '',
  city: '',
  province: '',
  zipCode: '',
  price: '',
  beds: '',
  baths: '',
  sqft: '',
  sqm: '',
  propertyType: 'house' as (typeof PROPERTY_TYPES)[number],
  image: '',
  additionalImages: [] as string[],
  description: '',
  amenities: '',
  yearBuilt: '',
  lotSize: '',
  garage: '0',
  pool: false,
  furnished: false,
  latitude: '',
  longitude: '',
  interestRate: '6.5',
  proofDocument: '',
};

export default function SellPage() {
  const navigate = useNavigate();
  const cachedVerification = sessionStorage.getItem('estateflow-sell-verification-status');
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(cachedVerification);
  const [checkingVerification, setCheckingVerification] = useState(!cachedVerification);

  const loggedIn = isLoggedIn();
  const role = getStoredAuth()?.user.role;
  const canCreate = loggedIn && (role === 'seller' || role === 'agent' || role === 'administrator');

  // Check verification status
  useEffect(() => {
    if (!canCreate) { setCheckingVerification(false); return; }
    if (role === 'administrator') { setVerificationStatus('verified'); setCheckingVerification(false); return; }
    const check = async () => {
      try {
        const profile = await getProfile();
        setVerificationStatus(profile.verificationStatus);
        sessionStorage.setItem('estateflow-sell-verification-status', profile.verificationStatus);
      } catch { setVerificationStatus('unverified'); }
      setCheckingVerification(false);
    };
    void check();
  }, [canCreate, role]);

  const set = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.address.trim()) e.address = 'Address is required';
    if (!form.city.trim()) e.city = 'City is required';
    if (!form.province.trim()) e.province = 'Province is required';
    if (!form.price || Number(form.price) <= 0) e.price = 'Valid price is required';
    if (!form.beds) e.beds = 'Required';
    if (!form.baths) e.baths = 'Required';
    if (!form.sqm) e.sqm = 'Required';
    if (!form.image.trim()) e.image = 'Main image is required';
    if (!form.description.trim()) e.description = 'Description is required';
    if (!form.proofDocument.trim()) e.proofDocument = 'Proof of property is required (title deed, tax declaration, etc.)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const payload = {
        title: form.title,
        address: form.address,
        city: form.city,
        province: form.province,
        zipCode: form.zipCode,
        price: Number(form.price),
        beds: Number(form.beds),
        baths: Number(form.baths),
        sqft: Number(form.sqft) || Math.round(Number(form.sqm) * 10.764),
        sqm: Number(form.sqm),
        propertyType: form.propertyType,
        image: form.image,
        images: form.additionalImages.length > 0 ? form.additionalImages : [],
        description: form.description,
        amenities: form.amenities ? form.amenities.split(',').map((s) => s.trim()).filter(Boolean) : [],
        yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : null,
        lotSize: form.lotSize ? Number(form.lotSize) : null,
        garage: Number(form.garage),
        pool: form.pool,
        furnished: form.furnished,
        interestRate: Number(form.interestRate) || 6.5,
        proofDocument: form.proofDocument,
        ownerId: 0, // server sets this from auth
        ownerName: '',
        reservationFee: null,
        coordinates: form.latitude && form.longitude
          ? { lat: Number(form.latitude), lng: Number(form.longitude) }
          : null,
      };
      await createProperty(payload);
      setSubmitResult({ ok: true, text: 'Property listed! It will appear after admin approval.' });
      setForm(INITIAL);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err) {
      setSubmitResult({ ok: false, text: err instanceof Error ? err.message : 'Failed to create listing' });
    } finally {
      setSubmitting(false);
    }
  };

  // Not authorized view
  if (!canCreate) {
    return (
      <div className="min-h-screen bg-navy pt-24 flex flex-col items-center justify-center px-6 text-center">
        <Upload className="w-16 h-16 text-gray-blue mb-4" />
        <h1 className="text-2xl font-display font-bold text-white mb-2">List Your Property</h1>
        <p className="text-gray-blue mb-6 max-w-md">
          {!loggedIn
            ? 'Sign in as a seller or agent to list a property.'
            : 'Only sellers and agents can create property listings.'}
        </p>
        {!loggedIn && (
          <Link to="/login" className="btn-solid px-6 py-3 rounded-lg inline-flex items-center gap-2">
            <LogIn className="w-4 h-4" />
            Sign In
          </Link>
        )}
      </div>
    );
  }

  // Checking verification
  if (checkingVerification) {
    return (
      <div className="min-h-screen bg-navy pt-24 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sand animate-spin" />
      </div>
    );
  }

  // Not verified view
  if (verificationStatus !== 'verified') {
    return (
      <div className="min-h-screen bg-navy pt-24 flex flex-col items-center justify-center px-6 text-center">
        <ShieldCheck className="w-16 h-16 text-yellow-400 mb-4" />
        <h1 className="text-2xl font-display font-bold text-white mb-2">Verification Required</h1>
        <p className="text-gray-blue mb-2 max-w-md">
          You need to verify your identity before creating property listings.
        </p>
        {verificationStatus === 'pending' ? (
          <p className="text-yellow-400 text-sm mb-6">Your verification is currently under review. Please wait for approval.</p>
        ) : verificationStatus === 'rejected' ? (
          <p className="text-red-400 text-sm mb-6">Your verification was rejected. Please re-submit your documents from your profile.</p>
        ) : (
          <p className="text-gray-blue text-sm mb-6">Submit your verification documents from your profile page.</p>
        )}
        <Link to="/dashboard" className="btn-solid px-6 py-3 rounded-lg inline-flex items-center gap-2">
          <LayoutDashboard className="w-4 h-4" />
          Go to Dashboard
        </Link>
      </div>
    );
  }

  const inputCls =
    'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-sand';
  const labelCls = 'text-gray-blue text-sm mb-1 block';
  const errCls = 'text-red-400 text-xs mt-1';

  return (
    <div className="min-h-screen bg-navy pt-24 pb-16 px-6 lg:px-[4vw]">
      <div className="max-w-3xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-blue hover:text-sand mb-6">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>

        <h1 className="text-3xl font-display font-bold text-white mb-2">Create New Listing</h1>
        <p className="text-gray-blue mb-8">Fill in the property details. Your listing will be reviewed by an admin before going live.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className={labelCls}>Property Title *</label>
            <input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Modern 3BR House in Makati" />
            {errors.title && <p className={errCls}>{errors.title}</p>}
          </div>

          {/* Location Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Address *</label>
              <input className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="123 Main Street" />
              {errors.address && <p className={errCls}>{errors.address}</p>}
            </div>
            <div>
              <label className={labelCls}>City *</label>
              <input className={inputCls} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Makati" />
              {errors.city && <p className={errCls}>{errors.city}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Province *</label>
              <input className={inputCls} value={form.province} onChange={(e) => set('province', e.target.value)} placeholder="Metro Manila" />
              {errors.province && <p className={errCls}>{errors.province}</p>}
            </div>
            <div>
              <label className={labelCls}>Zip Code</label>
              <input className={inputCls} value={form.zipCode} onChange={(e) => set('zipCode', e.target.value)} placeholder="1200" />
            </div>
          </div>

          {/* Type & Price */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Property Type *</label>
              <select className={inputCls} value={form.propertyType} onChange={(e) => set('propertyType', e.target.value)}>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-navy capitalize">{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Price (₱) *</label>
              <input type="number" className={inputCls} value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="15000000" />
              {errors.price && <p className={errCls}>{errors.price}</p>}
            </div>
          </div>

          {/* Specs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Beds *</label>
              <input type="number" className={inputCls} value={form.beds} onChange={(e) => set('beds', e.target.value)} min="0" />
              {errors.beds && <p className={errCls}>{errors.beds}</p>}
            </div>
            <div>
              <label className={labelCls}>Baths *</label>
              <input type="number" className={inputCls} value={form.baths} onChange={(e) => set('baths', e.target.value)} min="0" />
              {errors.baths && <p className={errCls}>{errors.baths}</p>}
            </div>
            <div>
              <label className={labelCls}>Area (sqm) *</label>
              <input type="number" className={inputCls} value={form.sqm} onChange={(e) => set('sqm', e.target.value)} min="0" />
              {errors.sqm && <p className={errCls}>{errors.sqm}</p>}
            </div>
            <div>
              <label className={labelCls}>Garage</label>
              <input type="number" className={inputCls} value={form.garage} onChange={(e) => set('garage', e.target.value)} min="0" />
            </div>
          </div>

          {/* Extra */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Year Built</label>
              <input type="number" className={inputCls} value={form.yearBuilt} onChange={(e) => set('yearBuilt', e.target.value)} placeholder="2020" />
            </div>
            <div>
              <label className={labelCls}>Lot Size (sqm)</label>
              <input type="number" className={inputCls} value={form.lotSize} onChange={(e) => set('lotSize', e.target.value)} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="pool" checked={form.pool} onChange={(e) => set('pool', e.target.checked)} className="accent-sand w-4 h-4" />
              <label htmlFor="pool" className="text-gray-blue text-sm">Pool</label>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="furnished" checked={form.furnished} onChange={(e) => set('furnished', e.target.checked)} className="accent-sand w-4 h-4" />
              <label htmlFor="furnished" className="text-gray-blue text-sm">Furnished</label>
            </div>
          </div>

          {/* Images */}
          <div>
            <label className={labelCls}>Main Image *</label>
            <MainImageUpload
              value={form.image}
              onChange={(url) => set('image', url)}
            />
            {errors.image && <p className={errCls}>{errors.image}</p>}
          </div>
          <div>
            <label className={labelCls}>Additional Images</label>
            <MultiImageUpload
              values={form.additionalImages}
              onChange={(urls) => setForm((prev) => ({ ...prev, additionalImages: urls }))}
            />
          </div>

          {/* Proof of Property */}
          <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-4">
            <label className={labelCls}>
              <span className="text-yellow-400">Proof of Property *</span>
              <span className="text-gray-blue text-xs block mt-0.5">Upload title deed, tax declaration, or official certificate to prove the property exists. This will be reviewed by admin before listing is approved.</span>
            </label>
            <MainImageUpload
              value={form.proofDocument}
              onChange={(url) => set('proofDocument', url)}
            />
            {errors.proofDocument && <p className={errCls}>{errors.proofDocument}</p>}
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description *</label>
            <textarea className={inputCls + ' resize-none'} rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Describe the property..." />
            {errors.description && <p className={errCls}>{errors.description}</p>}
          </div>

          {/* Amenities */}
          <div>
            <label className={labelCls}>Amenities (comma-separated)</label>
            <input className={inputCls} value={form.amenities} onChange={(e) => set('amenities', e.target.value)} placeholder="Swimming Pool, Gym, Guard, Parking" />
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Latitude</label>
              <input type="number" step="any" className={inputCls} value={form.latitude} onChange={(e) => set('latitude', e.target.value)} placeholder="14.5547" />
            </div>
            <div>
              <label className={labelCls}>Longitude</label>
              <input type="number" step="any" className={inputCls} value={form.longitude} onChange={(e) => set('longitude', e.target.value)} placeholder="121.0244" />
            </div>
            <div>
              <label className={labelCls}>Interest Rate (%)</label>
              <input type="number" step="0.25" min="0" max="30" className={inputCls} value={form.interestRate} onChange={(e) => set('interestRate', e.target.value)} placeholder="6.5" />
              <p className="text-gray-blue/60 text-xs mt-1">Annual interest rate for buyer loan calculations</p>
            </div>
          </div>

          {/* Submit */}
          {submitResult && (
            <div className={`flex items-center gap-2 p-4 rounded-lg ${submitResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {submitResult.ok ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              {submitResult.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-sand text-navy font-semibold rounded-lg hover:bg-[#c99660] transition-colors disabled:opacity-50 text-lg"
          >
            {submitting ? 'Creating Listing...' : 'Submit Listing for Review'}
          </button>
        </form>
      </div>
    </div>
  );
}
