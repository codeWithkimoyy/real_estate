import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import gsap from 'gsap';
import {
  ArrowLeft, Bed, Bath, Square, MapPin, Calendar, Car,
  Waves, Sofa, Home, Send, Clock, CheckCircle, AlertCircle,
  Heart, CreditCard, Building2, Smartphone, FileText, ShieldCheck, Calculator, RotateCcw,
  MapPinIcon, Printer, Banknote, Store, Phone, Mail, Globe,
} from 'lucide-react';
import {
  formatFullPrice,
  type Property,
  type Reservation,
} from '../data/philippineData';
import { getPropertyById, sendInquiry, createAppointment, addFavorite, removeFavorite, getFavorites, createPayment, uploadFile, getReservations, createReservation, updateReservationStatus } from '../lib/api';
import { getStoredAuth, isLoggedIn } from '../lib/auth';

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [activeTab, setActiveTab] = useState<'details' | 'calculator' | 'how-to-pay'>('details');
  const [inquiryMsg, setInquiryMsg] = useState('');
  const [inquirySending, setInquirySending] = useState(false);
  const [inquiryStatus, setInquiryStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [apptSending, setApptSending] = useState(false);
  const [apptStatus, setApptStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  // Payment state
  const [payMethod, setPayMethod] = useState<string>('');
  const [payType, setPayType] = useState<string>('reservation');
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payProof, setPayProof] = useState('');
  const [payUploading, setPayUploading] = useState(false);
  const [paySending, setPaySending] = useState(false);
  const [payStatus, setPayStatus] = useState<{ ok: boolean; text: string } | null>(null);
  // Calculator state
  const [calcPrice, setCalcPrice] = useState('');
  const [calcDownPct, setCalcDownPct] = useState('');
  const [calcTerm, setCalcTerm] = useState('');
  const [calcResult, setCalcResult] = useState<{ loanAmount: number; monthly: number; totalPayment: number; totalInterest: number; interestRate: number } | null>(null);
  // Payment state - walk-in vs online
  const [payChannel, setPayChannel] = useState<'walk_in' | 'online'>('online');
  // Walk-in scheduling
  const [walkInDate, setWalkInDate] = useState('');
  const [walkInTime, setWalkInTime] = useState('');
  const [walkInSending, setWalkInSending] = useState(false);
  const [walkInStatus, setWalkInStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [walkInReceipt, setWalkInReceipt] = useState<{
    date: string; time: string; property: string; seller: string; buyer: string; submittedAt: string;
  } | null>(null);
  // Reservation state
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [reserveDays, setReserveDays] = useState('7');
  const [reserveNotes, setReserveNotes] = useState('');
  const [reserving, setReserving] = useState(false);
  const [reserveStatus, setReserveStatus] = useState<{ ok: boolean; text: string } | null>(null);
  // Receipt state
  const [payReceipt, setPayReceipt] = useState<{
    id: number; propertyTitle: string; amount: number; method: string; type: string;
    referenceNo: string | null; date: string; buyerName: string; sellerName: string;
  } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const walkInReceiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const data = await getPropertyById(Number(id));
        setProperty(data);
        // Check reservation info from property response (works for all users)
        if ((data as any).reservation) {
          const r = (data as any).reservation;
          setReservation({ id: r.id, userId: r.userId, expiresAt: r.expiresAt, status: r.status ?? 'active' } as Reservation);
        }
        // Check if this property is favorited
        if (isLoggedIn()) {
          try {
            const favs = await getFavorites();
            setIsFavorited(favs.some((f) => f.propertyId === Number(id)));
          } catch { /* not critical */ }
          // Load full active/pending reservation details (overrides the basic info above)
          try {
            const res = await getReservations({ propertyId: Number(id) });
            const current = res.items.find((r) => r.status === 'active' || r.status === 'pending');
            if (current) setReservation(current);
          } catch { /* not critical */ }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Property not found');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  const toggleFavorite = async () => {
    if (!property || !isLoggedIn()) return;
    setFavLoading(true);
    try {
      if (isFavorited) {
        await removeFavorite(property.id);
        setIsFavorited(false);
      } else {
        await addFavorite(property.id);
        setIsFavorited(true);
      }
    } catch { /* ignore */ }
    setFavLoading(false);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property) return;
    setPaySending(true);
    setPayStatus(null);
    setPayReceipt(null);
    try {
      const result = await createPayment({
        propertyId: property.id,
        amount: Number(payAmount),
        paymentMethod: payMethod,
        paymentType: payType,
        referenceNo: payRef || undefined,
        notes: payNotes || undefined,
        proofUrl: payProof || undefined,
      });
      setPayStatus({ ok: true, text: 'Payment submitted successfully! The seller will review and confirm.' });
      // Build receipt
      const auth = getStoredAuth();
      setPayReceipt({
        id: result.id,
        propertyTitle: property.title,
        amount: Number(payAmount),
        method: payMethod,
        type: payType,
        referenceNo: payRef || null,
        date: new Date().toLocaleString(),
        buyerName: auth ? `${auth.user.firstName} ${auth.user.lastName}` : 'N/A',
        sellerName: property.ownerName,
      });
      setPayAmount('');
      setPayRef('');
      setPayNotes('');
      setPayProof('');
    } catch (err) {
      setPayStatus({ ok: false, text: err instanceof Error ? err.message : 'Failed to submit payment' });
    } finally {
      setPaySending(false);
    }
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPayUploading(true);
    try {
      const result = await uploadFile(file);
      setPayProof(result.url);
    } catch {
      /* ignore */
    }
    setPayUploading(false);
  };

  const handleReserve = async () => {
    if (!property) return;
    setReserving(true);
    setReserveStatus(null);
    try {
      const res = await createReservation({
        propertyId: property.id,
        days: Number(reserveDays) || 7,
        notes: reserveNotes || undefined,
      });
      setReservation(res);
      setReserveStatus({ ok: true, text: `Reservation request submitted! The property owner will confirm it shortly.` });
    } catch (err) {
      setReserveStatus({ ok: false, text: err instanceof Error ? err.message : 'Failed to reserve' });
    } finally {
      setReserving(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!reservation) return;
    try {
      await updateReservationStatus(reservation.id, 'cancelled');
      setReservation(null);
      setReserveStatus({ ok: true, text: 'Reservation cancelled.' });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!property || !contentRef.current) return;
    const els = contentRef.current.querySelectorAll('.detail-fade');
    if (els.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.fromTo('.detail-fade', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out' });
    }, contentRef);
    return () => ctx.revert();
  }, [property]);

  const handleInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property) return;
    setInquirySending(true);
    setInquiryStatus(null);
    try {
      await sendInquiry(property.id, inquiryMsg);
      setInquiryStatus({ ok: true, text: 'Inquiry sent successfully!' });
      setInquiryMsg('');
    } catch (err) {
      setInquiryStatus({ ok: false, text: err instanceof Error ? err.message : 'Failed to send' });
    } finally {
      setInquirySending(false);
    }
  };

  const handleAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property) return;
    setApptSending(true);
    setApptStatus(null);
    try {
      await createAppointment({
        propertyId: property.id,
        appointmentDate: apptDate,
        appointmentTime: apptTime,
        notes: apptNotes || undefined,
      });
      setApptStatus({ ok: true, text: 'Appointment requested!' });
      setApptDate('');
      setApptTime('');
      setApptNotes('');
    } catch (err) {
      setApptStatus({ ok: false, text: err instanceof Error ? err.message : 'Failed to book' });
    } finally {
      setApptSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-sand/20 to-sand/5 rounded-2xl flex items-center justify-center border border-white/10 animate-float-slow">
            <Home className="w-8 h-8 text-sand" />
          </div>
          <p className="text-gray-blue">Loading property...</p>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-navy flex flex-col items-center justify-center gap-6">
        <div className="w-20 h-20 bg-gradient-to-br from-red-500/20 to-red-600/5 rounded-2xl flex items-center justify-center border border-red-500/20">
          <AlertCircle className="w-10 h-10 text-red-400" />
        </div>
        <p className="text-white text-lg font-display font-semibold">{error || 'Property not found'}</p>
        <Link to="/listings" className="text-sand hover:text-white transition-colors flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Listings
        </Link>
      </div>
    );
  }

  const images = property.images?.length ? property.images : [property.image];

  // Dynamic loan calculation - user inputs everything except interest rate (from seller)
  const calcMonthly = (loanAmt: number, annualRate: number, termYears: number) => {
    if (loanAmt <= 0 || annualRate <= 0 || termYears <= 0) return 0;
    const r = annualRate / 100 / 12;
    const n = termYears * 12;
    return Math.round((loanAmt * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  };

  const handleCalculate = () => {
    const price = Number(calcPrice);
    const downPct = Number(calcDownPct);
    const term = Number(calcTerm);
    const rate = property.interestRate || 6.5;
    if (price <= 0 || downPct < 0 || downPct >= 100 || term <= 0) return;
    const loanAmount = Math.round(price * (1 - downPct / 100));
    const monthly = calcMonthly(loanAmount, rate, term);
    const totalPayment = monthly * term * 12;
    const totalInterest = totalPayment - loanAmount;
    setCalcResult({ loanAmount, monthly, totalPayment, totalInterest, interestRate: rate });
  };

  const handleResetCalc = () => {
    setCalcPrice('');
    setCalcDownPct('');
    setCalcTerm('');
    setCalcResult(null);
  };

  const printReceipt = () => {
    if (!receiptRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Payment Receipt</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1a1a2e; }
        .receipt { max-width: 500px; margin: 0 auto; border: 2px solid #1a1a2e; border-radius: 12px; padding: 32px; }
        .header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 16px; margin-bottom: 16px; }
        .header h1 { font-size: 20px; margin: 0 0 4px; }
        .header p { color: #666; font-size: 12px; margin: 0; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
        .row .label { color: #666; }
        .row .value { font-weight: 600; }
        .total { font-size: 18px; margin-top: 12px; border-top: 2px solid #1a1a2e; padding-top: 12px; }
        .footer { text-align: center; margin-top: 20px; color: #999; font-size: 11px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      ${receiptRef.current.innerHTML}
      <script>window.print(); window.close();</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const loggedIn = isLoggedIn();
  const auth = getStoredAuth();
  const isBuyer = auth?.user.role === 'buyer';
  const isOwner = auth?.user.id === property.ownerId;
  const isReservedByOther = !!(reservation && (!auth || (reservation.userId !== auth.user.id && !isOwner)));

  return (
    <div className="min-h-screen bg-navy pt-20 relative overflow-hidden" ref={contentRef}>
      {/* Background elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-sand/10"
            style={{
              width: `${2 + Math.random() * 3}px`,
              height: `${2 + Math.random() * 3}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float-particle ${10 + Math.random() * 15}s linear infinite`,
              animationDelay: `${Math.random() * 10}s`,
            }}
          />
        ))}
      </div>
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-sand/[0.02] blur-[100px] pointer-events-none" />

      {/* Back */}
      <div className="px-6 lg:px-[4vw] py-4 relative">
        <Link to="/listings" className="inline-flex items-center gap-2 text-gray-blue hover:text-sand transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Listings
        </Link>
      </div>

      {/* Image Gallery */}
      <div className="detail-fade px-6 lg:px-[4vw] mb-8 relative">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-white/[0.06] group">
            <img src={images[selectedImage]} alt={property.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-2 gap-4">
              {images.slice(0, 4).map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all duration-300 group ${
                    selectedImage === i ? 'border-sand shadow-lg shadow-sand/20 scale-[1.02]' : 'border-white/[0.06] hover:border-white/20'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 lg:px-[4vw] pb-16 relative">
        {/* SOLD banner */}
        {property.status === 'sold' && (
          <div className="max-w-7xl mx-auto mb-6">
            <div className="bg-red-500/15 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
              <span className="text-red-400 text-2xl font-display font-bold">SOLD</span>
              <span className="text-red-300/80 text-sm">This property has been sold and is no longer available for purchase.</span>
            </div>
          </div>
        )}
        {/* RESERVED banner */}
        {isReservedByOther && property.status !== 'sold' && (
          <div className="max-w-7xl mx-auto mb-6">
            <div className="bg-yellow-500/15 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
              <span className="text-yellow-400 text-2xl font-display font-bold">RESERVED</span>
              <span className="text-yellow-300/80 text-sm">This property is currently reserved by another buyer. Payments, inquiries, appointments, and reservations are disabled until the reservation expires or is cancelled.</span>
            </div>
          </div>
        )}
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left – Details */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div className="detail-fade">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className={`px-3 py-1.5 text-xs font-semibold rounded-lg backdrop-blur-sm shadow-lg ${
                  property.status === 'approved' ? 'bg-green-500/90 text-white shadow-green-500/20'
                  : property.status === 'sold' ? 'bg-red-500/90 text-white shadow-red-500/20'
                  : property.status === 'pending' ? 'bg-yellow-500/90 text-white shadow-yellow-500/20'
                  : 'bg-red-500/90 text-white shadow-red-500/20'
                }`}>
                  {property.status === 'approved' ? 'For Sale' : property.status.charAt(0).toUpperCase() + property.status.slice(1)}
                </span>
                <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 text-white capitalize border border-white/[0.06]">
                  {property.propertyType}
                </span>
                {loggedIn && (
                  <button
                    onClick={toggleFavorite}
                    disabled={favLoading}
                    className={`ml-auto p-2.5 rounded-xl border transition-all ${
                      isFavorited
                        ? 'bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30'
                        : 'bg-white/5 border-white/10 text-gray-blue hover:text-red-400 hover:border-red-500/30'
                    }`}
                    title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart className={`w-5 h-5 transition-all ${isFavorited ? 'fill-red-400' : ''} ${favLoading ? 'animate-pulse' : ''}`} />
                  </button>
                )}
              </div>
              <h1 className="text-3xl lg:text-4xl font-display font-bold text-white mb-2">{property.title}</h1>
              <p className="flex items-center gap-2 text-gray-blue">
                <MapPin className="w-4 h-4 text-sand/60" />
                {property.address}, {property.city}, {property.province} {property.zipCode}
              </p>
              <p className="mt-4 text-3xl font-display font-bold text-gradient-animate">
                {formatFullPrice(property.price)}
              </p>
            </div>

            {/* Quick Stats */}
            <div className="detail-fade grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { icon: Bed, label: 'Bedrooms', value: property.beds },
                { icon: Bath, label: 'Bathrooms', value: property.baths },
                { icon: Square, label: 'Floor Area', value: `${property.sqm} sqm` },
                { icon: Home, label: 'Lot Size', value: property.lotSize ? `${property.lotSize} sqm` : 'N/A' },
              ].map((stat) => (
                <div key={stat.label} className="glass-card rounded-xl p-5 text-center group hover:bg-white/[0.06] transition-all hover:-translate-y-1">
                  <div className="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sand/20 to-sand/5 rounded-lg flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform">
                    <stat.icon className="w-5 h-5 text-sand" />
                  </div>
                  <p className="text-white font-semibold">{stat.value}</p>
                  <p className="text-gray-blue text-sm">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="detail-fade">
              <div className="flex gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] mb-6 w-fit">
                {(['details', 'calculator', 'how-to-pay'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      activeTab === tab ? 'bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy shadow-lg shadow-sand/20' : 'text-gray-blue hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab === 'details' ? 'Property Details' : tab === 'calculator' ? 'Loan Calculator' : 'How to Pay'}
                  </button>
                ))}
              </div>

              {activeTab === 'details' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Description</h3>
                    <p className="text-gray-blue leading-relaxed">{property.description}</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {property.yearBuilt && (
                      <div className="flex items-center gap-2.5 text-gray-blue bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.06]">
                        <Calendar className="w-4 h-4 text-sand/80" /> <span className="text-sm">Built {property.yearBuilt}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 text-gray-blue bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.06]">
                      <Car className="w-4 h-4 text-sand/80" /> <span className="text-sm">{property.garage} Garage</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-gray-blue bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.06]">
                      <Waves className="w-4 h-4 text-sand/80" /> <span className="text-sm">{property.pool ? 'Pool' : 'No Pool'}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-gray-blue bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.06]">
                      <Sofa className="w-4 h-4 text-sand/80" /> <span className="text-sm">{property.furnished ? 'Furnished' : 'Unfurnished'}</span>
                    </div>
                  </div>

                  {property.amenities.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3">Amenities</h3>
                      <div className="flex flex-wrap gap-2">
                        {property.amenities.map((a) => (
                          <span key={a} className="px-3 py-1.5 bg-white/5 rounded-lg text-sm text-gray-blue border border-white/[0.06] hover:bg-sand/10 hover:text-sand hover:border-sand/20 transition-all cursor-default">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sand/20 to-sand/5 flex items-center justify-center border border-white/5 flex-shrink-0">
                      <span className="text-sand font-semibold text-lg">{property.ownerName?.charAt(0)?.toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-blue">Listed by</p>
                      <p className="text-white font-medium">{property.ownerName}</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'calculator' && (
                <div className="space-y-6">
                  {/* Seller Interest Rate Info */}
                  <div className="glass-card rounded-xl p-4 flex items-center gap-3 border border-sand/20 bg-sand/5">
                    <div className="w-10 h-10 bg-sand/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-5 h-5 text-sand" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">Seller&apos;s Interest Rate</p>
                      <p className="text-sand text-lg font-bold">{property.interestRate ?? 6.5}% per annum</p>
                    </div>
                  </div>

                  {/* User Input Form */}
                  <div className="glass-card rounded-xl p-6">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-white font-semibold flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-sand" /> Loan Calculator
                      </h3>
                      <button
                        onClick={handleResetCalc}
                        className="flex items-center gap-1.5 text-xs text-gray-blue hover:text-sand transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset
                      </button>
                    </div>
                    <p className="text-gray-blue text-sm mb-5">Enter the property price, your desired down payment percentage, and loan term. The interest rate is set by the seller.</p>
                    <div className="space-y-4">
                      <div>
                        <label className="text-gray-blue text-sm mb-1.5 block font-medium">Property Price (₱)</label>
                        <input
                          type="number"
                          value={calcPrice}
                          onChange={(e) => setCalcPrice(e.target.value)}
                          placeholder={`e.g. ${property.price.toLocaleString()}`}
                          min="1"
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-gray-blue text-sm mb-1.5 block font-medium">Down Payment (%)</label>
                          <input
                            type="number"
                            value={calcDownPct}
                            onChange={(e) => setCalcDownPct(e.target.value)}
                            placeholder="e.g. 20"
                            min="0"
                            max="99"
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                          />
                        </div>
                        <div>
                          <label className="text-gray-blue text-sm mb-1.5 block font-medium">Loan Term (years)</label>
                          <input
                            type="number"
                            value={calcTerm}
                            onChange={(e) => setCalcTerm(e.target.value)}
                            placeholder="e.g. 20"
                            min="1"
                            max="30"
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-gray-blue text-sm mb-1.5 block font-medium">Interest Rate (set by seller)</label>
                        <div className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-sand font-semibold cursor-not-allowed">
                          {property.interestRate ?? 6.5}% per annum
                        </div>
                      </div>
                      <button
                        onClick={handleCalculate}
                        disabled={!calcPrice || !calcDownPct || !calcTerm}
                        className="w-full py-3.5 btn-magnetic bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl transition-all disabled:opacity-50 text-sm uppercase tracking-wider"
                      >
                        Calculate Monthly Payment
                      </button>
                    </div>
                  </div>

                  {/* Results */}
                  {calcResult && (
                    <div className="glass-card rounded-xl p-6 border border-sand/20">
                      <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-sand" /> Calculation Results
                      </h4>
                      <dl className="space-y-3 text-sm">
                        <div className="flex justify-between py-2 border-b border-white/[0.06]">
                          <dt className="text-gray-blue">Property Price</dt>
                          <dd className="text-white font-medium">{formatFullPrice(Number(calcPrice))}</dd>
                        </div>
                        <div className="flex justify-between py-2 border-b border-white/[0.06]">
                          <dt className="text-gray-blue">Down Payment ({calcDownPct}%)</dt>
                          <dd className="text-white font-medium">{formatFullPrice(Math.round(Number(calcPrice) * Number(calcDownPct) / 100))}</dd>
                        </div>
                        <div className="flex justify-between py-2 border-b border-white/[0.06]">
                          <dt className="text-gray-blue">Loan Amount</dt>
                          <dd className="text-white font-medium">{formatFullPrice(calcResult.loanAmount)}</dd>
                        </div>
                        <div className="flex justify-between py-2 border-b border-white/[0.06]">
                          <dt className="text-gray-blue">Interest Rate (Seller)</dt>
                          <dd className="text-sand font-medium">{calcResult.interestRate}%</dd>
                        </div>
                        <div className="flex justify-between py-2 border-b border-white/[0.06]">
                          <dt className="text-gray-blue">Loan Term</dt>
                          <dd className="text-white font-medium">{calcTerm} years ({Number(calcTerm) * 12} months)</dd>
                        </div>
                        <div className="flex justify-between bg-gradient-to-r from-sand/10 to-transparent rounded-lg p-3 -mx-2 mt-2">
                          <dt className="text-sand font-semibold text-base">Monthly Payment</dt>
                          <dd className="text-sand font-bold text-xl">{formatFullPrice(calcResult.monthly)}</dd>
                        </div>
                        <div className="flex justify-between py-2">
                          <dt className="text-gray-blue">Total Payment</dt>
                          <dd className="text-white">{formatFullPrice(calcResult.totalPayment)}</dd>
                        </div>
                        <div className="flex justify-between py-2">
                          <dt className="text-gray-blue">Total Interest</dt>
                          <dd className="text-red-400">{formatFullPrice(calcResult.totalInterest)}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'how-to-pay' && (
                <div className="space-y-6">
                  {/* Payment Channel Toggle */}
                  <div className="glass-card rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Choose Payment Channel</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => { setPayChannel('walk_in'); setPayMethod(''); }}
                        className={`p-5 rounded-xl border-2 transition-all text-left group ${
                          payChannel === 'walk_in'
                            ? 'border-sand bg-sand/10 shadow-lg shadow-sand/10'
                            : 'border-white/[0.06] hover:border-white/20 hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className={`w-12 h-12 mb-3 rounded-lg flex items-center justify-center border ${
                          payChannel === 'walk_in' ? 'bg-sand/20 border-sand/30' : 'bg-white/5 border-white/10'
                        } group-hover:scale-110 transition-transform`}>
                          <Store className={`w-6 h-6 ${payChannel === 'walk_in' ? 'text-sand' : 'text-gray-blue'}`} />
                        </div>
                        <p className={`font-semibold ${payChannel === 'walk_in' ? 'text-white' : 'text-gray-blue'}`}>Walk-In Payment</p>
                        <p className="text-gray-blue text-xs mt-1">Visit the office or meet the seller in person</p>
                      </button>
                      <button
                        onClick={() => { setPayChannel('online'); setPayMethod(''); }}
                        className={`p-5 rounded-xl border-2 transition-all text-left group ${
                          payChannel === 'online'
                            ? 'border-sand bg-sand/10 shadow-lg shadow-sand/10'
                            : 'border-white/[0.06] hover:border-white/20 hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className={`w-12 h-12 mb-3 rounded-lg flex items-center justify-center border ${
                          payChannel === 'online' ? 'bg-sand/20 border-sand/30' : 'bg-white/5 border-white/10'
                        } group-hover:scale-110 transition-transform`}>
                          <Smartphone className={`w-6 h-6 ${payChannel === 'online' ? 'text-sand' : 'text-gray-blue'}`} />
                        </div>
                        <p className={`font-semibold ${payChannel === 'online' ? 'text-white' : 'text-gray-blue'}`}>Online Payment</p>
                        <p className="text-gray-blue text-xs mt-1">Pay via bank transfer, GCash, or credit card</p>
                      </button>
                    </div>
                  </div>

                  {/* Walk-In Instructions */}
                  {payChannel === 'walk_in' && (
                    <>
                      {/* Walk-In Receipt / Appointment Card */}
                      <div className="glass-card rounded-xl overflow-hidden border border-sand/20">
                        {/* Receipt Header */}
                        <div className="bg-gradient-to-r from-[#D4A574] to-[#c99660] px-6 py-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-navy font-bold text-lg">EstateFlow Realty</h3>
                              <p className="text-navy/70 text-xs">Walk-In Payment Appointment</p>
                            </div>
                            <div className="w-10 h-10 bg-navy/10 rounded-lg flex items-center justify-center">
                              <Store className="w-5 h-5 text-navy" />
                            </div>
                          </div>
                        </div>

                        <div className="p-6 space-y-5">
                          {/* Company Info */}
                          <div>
                            <h4 className="text-white font-semibold text-sm mb-3 uppercase tracking-wider">Office Details</h4>
                            <div className="space-y-3">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-sand/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-sand/20">
                                  <MapPinIcon className="w-4 h-4 text-sand" />
                                </div>
                                <div>
                                  <p className="text-white text-sm font-medium">Main Office</p>
                                  <p className="text-gray-blue text-xs">Unit 1201, One Ayala Tower,</p>
                                  <p className="text-gray-blue text-xs">1 Ayala Avenue, Makati City 1226</p>
                                  <p className="text-gray-blue text-xs">Metro Manila, Philippines</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-sand/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-sand/20">
                                  <Phone className="w-4 h-4 text-sand" />
                                </div>
                                <div>
                                  <p className="text-white text-sm font-medium">Contact</p>
                                  <p className="text-gray-blue text-xs">(02) 8888-1234 / +63 917 123 4567</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-sand/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-sand/20">
                                  <Mail className="w-4 h-4 text-sand" />
                                </div>
                                <div>
                                  <p className="text-white text-sm font-medium">Email</p>
                                  <p className="text-gray-blue text-xs">payments@estateflow.ph</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-sand/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-sand/20">
                                  <Globe className="w-4 h-4 text-sand" />
                                </div>
                                <div>
                                  <p className="text-white text-sm font-medium">Website</p>
                                  <p className="text-gray-blue text-xs">www.estateflow.ph</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Divider */}
                          <div className="border-t border-dashed border-white/10" />

                          {/* Business Hours */}
                          <div>
                            <h4 className="text-white font-semibold text-sm mb-3 uppercase tracking-wider flex items-center gap-2">
                              <Clock className="w-4 h-4 text-sand" /> Business Hours
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {[
                                { day: 'Monday – Friday', hours: '9:00 AM – 6:00 PM' },
                                { day: 'Saturday', hours: '9:00 AM – 3:00 PM' },
                                { day: 'Sunday', hours: 'Closed' },
                                { day: 'Holiday', hours: 'By appointment only' },
                              ].map((item) => (
                                <div key={item.day} className="flex justify-between bg-white/[0.03] rounded-lg px-3 py-2 col-span-2">
                                  <span className="text-gray-blue">{item.day}</span>
                                  <span className={`font-medium ${item.hours === 'Closed' ? 'text-red-400' : 'text-white'}`}>{item.hours}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Divider */}
                          <div className="border-t border-dashed border-white/10" />

                          {/* Preferred Schedule Picker */}
                          <div>
                            <h4 className="text-white font-semibold text-sm mb-3 uppercase tracking-wider flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-sand" /> Preferred Visit Schedule
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="text-gray-blue text-xs mb-1 block">Preferred Date</label>
                                <input
                                  type="date"
                                  value={walkInDate}
                                  onChange={(e) => setWalkInDate(e.target.value)}
                                  min={new Date().toISOString().split('T')[0]}
                                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                                />
                              </div>
                              <div>
                                <label className="text-gray-blue text-xs mb-1 block">Preferred Time</label>
                                <select
                                  value={walkInTime}
                                  onChange={(e) => setWalkInTime(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                                >
                                  <option value="" className="bg-navy">Select time</option>
                                  <option value="9:00 AM" className="bg-navy">9:00 AM</option>
                                  <option value="10:00 AM" className="bg-navy">10:00 AM</option>
                                  <option value="11:00 AM" className="bg-navy">11:00 AM</option>
                                  <option value="1:00 PM" className="bg-navy">1:00 PM</option>
                                  <option value="2:00 PM" className="bg-navy">2:00 PM</option>
                                  <option value="3:00 PM" className="bg-navy">3:00 PM</option>
                                  <option value="4:00 PM" className="bg-navy">4:00 PM</option>
                                  <option value="5:00 PM" className="bg-navy">5:00 PM</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Divider */}
                          <div className="border-t border-dashed border-white/10" />

                          {/* Property & Payment Details */}
                          <div>
                            <h4 className="text-white font-semibold text-sm mb-3 uppercase tracking-wider">Payment Details</h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between py-1.5">
                                <span className="text-gray-blue">Property</span>
                                <span className="text-white font-medium text-right max-w-[60%] truncate">{property.title}</span>
                              </div>
                              <div className="flex justify-between py-1.5">
                                <span className="text-gray-blue">Listed Price</span>
                                <span className="text-white font-medium">{formatFullPrice(property.price)}</span>
                              </div>
                              <div className="flex justify-between py-1.5">
                                <span className="text-gray-blue">Seller</span>
                                <span className="text-white font-medium">{property.ownerName}</span>
                              </div>
                              <div className="flex justify-between py-1.5">
                                <span className="text-gray-blue">Payment Method</span>
                                <span className="text-sand font-medium flex items-center gap-1.5">
                                  <Banknote className="w-3.5 h-3.5" /> Cash (Walk-In)
                                </span>
                              </div>
                              {walkInDate && (
                                <div className="flex justify-between py-1.5">
                                  <span className="text-gray-blue">Preferred Date</span>
                                  <span className="text-white font-medium">{new Date(walkInDate + 'T00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                </div>
                              )}
                              {walkInTime && (
                                <div className="flex justify-between py-1.5">
                                  <span className="text-gray-blue">Preferred Time</span>
                                  <span className="text-white font-medium">{walkInTime}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Footer Note */}
                          <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                            <p className="text-gray-blue text-xs leading-relaxed">
                              <span className="text-sand font-medium">Important:</span> Please bring a valid government ID and the exact payment amount. After payment at the office, you will receive an official receipt from the cashier.
                            </p>
                          </div>

                          {/* Submit Walk-In Button */}
                          {loggedIn && !isOwner && property.status === 'approved' && !walkInReceipt && !isReservedByOther && (
                            <>
                              <button
                                onClick={async () => {
                                  if (!property || !walkInDate || !walkInTime) return;
                                  setWalkInSending(true);
                                  setWalkInStatus(null);
                                  try {
                                    const formattedDate = new Date(walkInDate + 'T00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                                    await createAppointment({
                                      propertyId: property.id,
                                      appointmentDate: walkInDate,
                                      appointmentTime: walkInTime,
                                      notes: `Walk-in payment – Cash at EstateFlow office`,
                                      appointmentType: 'walk_in_payment',
                                    });
                                    const auth = getStoredAuth();
                                    setWalkInReceipt({
                                      date: formattedDate,
                                      time: walkInTime,
                                      property: property.title,
                                      seller: property.ownerName,
                                      buyer: auth ? `${auth.user.firstName} ${auth.user.lastName}` : 'N/A',
                                      submittedAt: new Date().toLocaleString(),
                                    });
                                    setWalkInStatus({ ok: true, text: 'Walk-in appointment submitted! The seller has been notified.' });
                                  } catch (err) {
                                    setWalkInStatus({ ok: false, text: err instanceof Error ? err.message : 'Failed to submit' });
                                  } finally {
                                    setWalkInSending(false);
                                  }
                                }}
                                disabled={walkInSending || !walkInDate || !walkInTime}
                                className="w-full py-3.5 btn-magnetic bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl transition-all disabled:opacity-50 text-sm uppercase tracking-wider"
                              >
                                {walkInSending ? 'Submitting...' : 'Submit Walk-In Appointment'}
                              </button>
                              {walkInStatus && (
                                <p className={`text-sm flex items-center gap-1 ${walkInStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
                                  {walkInStatus.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                  {walkInStatus.text}
                                </p>
                              )}
                            </>
                          )}
                          {!loggedIn && (
                            <p className="text-gray-blue text-sm text-center">
                              <Link to="/login" className="text-sand hover:underline">Sign in</Link> to schedule a walk-in payment.
                            </p>
                          )}
                          {loggedIn && isReservedByOther && (
                            <p className="text-yellow-400 text-sm text-center">This property is reserved by another buyer. Walk-in scheduling is disabled.</p>
                          )}
                        </div>
                      </div>

                      {/* Walk-In Receipt (after submission) */}
                      {walkInReceipt && (
                        <div className="glass-card rounded-xl p-6 border border-green-500/20 bg-green-500/5">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                              <FileText className="w-5 h-5 text-green-400" /> Walk-In Appointment Receipt
                            </h3>
                            <button
                              onClick={() => {
                                if (!walkInReceiptRef.current) return;
                                const printWindow = window.open('', '_blank');
                                if (!printWindow) return;
                                printWindow.document.write(`
                                  <html><head><title>Walk-In Appointment Receipt</title>
                                  <style>
                                    body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1a1a2e; }
                                    .receipt { max-width: 500px; margin: 0 auto; border: 2px solid #1a1a2e; border-radius: 12px; padding: 32px; }
                                    .header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 16px; margin-bottom: 16px; }
                                    .header h1 { font-size: 20px; margin: 0 0 4px; }
                                    .header p { color: #666; font-size: 12px; margin: 0; }
                                    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
                                    .row .label { color: #666; }
                                    .row .value { font-weight: 600; text-align: right; }
                                    .footer { text-align: center; margin-top: 20px; color: #999; font-size: 11px; }
                                    .highlight { background: #f0f7ff; border-radius: 8px; padding: 12px; margin-top: 12px; text-align: center; }
                                    .highlight .big { font-size: 16px; font-weight: 700; color: #1a1a2e; }
                                    @media print { body { padding: 20px; } }
                                  </style></head><body>
                                  ${walkInReceiptRef.current.innerHTML}
                                  <script>window.print(); window.close();</script>
                                  </body></html>
                                `);
                                printWindow.document.close();
                              }}
                              className="flex items-center gap-1.5 text-sm text-sand hover:text-white transition-colors px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10"
                            >
                              <Printer className="w-4 h-4" /> Print
                            </button>
                          </div>
                          <div ref={walkInReceiptRef}>
                            <div className="receipt">
                              <div className="header" style={{ textAlign: 'center', borderBottom: '2px dashed rgba(255,255,255,0.1)', paddingBottom: '16px', marginBottom: '16px' }}>
                                <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>EstateFlow Realty</h1>
                                <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>Walk-In Payment Appointment Confirmation</p>
                              </div>
                              <div style={{ marginTop: '16px' }}>
                                {[
                                  { label: 'Submitted On', value: walkInReceipt.submittedAt },
                                  { label: 'Property', value: walkInReceipt.property },
                                  { label: 'Buyer', value: walkInReceipt.buyer },
                                  { label: 'Seller / Agent', value: walkInReceipt.seller },
                                  { label: 'Payment Method', value: 'Cash (Walk-In)' },
                                ].map((row) => (
                                  <div key={row.label} className="flex justify-between py-2 border-b border-white/[0.06] text-sm">
                                    <span className="text-gray-blue">{row.label}</span>
                                    <span className="text-white font-medium text-right max-w-[60%]">{row.value}</span>
                                  </div>
                                ))}
                                <div className="mt-3 bg-sand/10 rounded-lg p-4 border border-sand/20">
                                  <p className="text-gray-blue text-xs text-center mb-1">Scheduled Visit</p>
                                  <p className="text-sand font-bold text-lg text-center">{walkInReceipt.date}</p>
                                  <p className="text-sand font-semibold text-center">{walkInReceipt.time}</p>
                                </div>
                                <div className="mt-3 bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                                  <p className="text-xs text-gray-blue text-center mb-1 font-medium">Office Location</p>
                                  <p className="text-white text-xs text-center">Unit 1201, One Ayala Tower, 1 Ayala Avenue</p>
                                  <p className="text-white text-xs text-center">Makati City 1226, Metro Manila</p>
                                  <p className="text-gray-blue text-xs text-center mt-1">(02) 8888-1234 / +63 917 123 4567</p>
                                </div>
                              </div>
                              <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                                <p className="text-green-400 text-xs font-medium">Seller has been notified of your walk-in appointment</p>
                                <p className="text-gray-blue/40 text-[10px] mt-1">Please bring a valid government ID and exact payment amount. Present this receipt at the office.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Steps */}
                      <div className="glass-card rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-sand" /> Steps to Complete Walk-In Payment
                        </h3>
                        <div className="space-y-4">
                          {[
                            { step: 1, title: 'Select Your Preferred Schedule', desc: 'Pick a date and time above during business hours.' },
                            { step: 2, title: 'Submit Appointment', desc: 'Click submit to notify the seller/agent of your walk-in visit.' },
                            { step: 3, title: 'Visit the Office', desc: 'Go to the EstateFlow Realty office at your scheduled time.' },
                            { step: 4, title: 'Bring Valid ID & Payment', desc: 'Present a valid government ID and pay the amount in cash.' },
                            { step: 5, title: 'Get Your Official Receipt', desc: 'The cashier will issue an official receipt confirming your payment.' },
                          ].map((s) => (
                            <div key={s.step} className="flex gap-4">
                              <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-br from-[#D4A574] to-[#c99660] flex items-center justify-center text-navy text-sm font-bold">
                                {s.step}
                              </div>
                              <div>
                                <p className="text-white font-medium">{s.title}</p>
                                <p className="text-gray-blue text-sm">{s.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Online Instructions */}
                  {payChannel === 'online' && (
                    <div className="glass-card rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Smartphone className="w-5 h-5 text-sand" /> Online Payment Guide
                      </h3>
                      <div className="space-y-4 mb-6">
                        {[
                          { step: 1, title: 'Choose Payment Method', desc: 'Select from bank transfer, GCash, Pag-IBIG, or credit card.' },
                          { step: 2, title: 'Complete the Transfer', desc: 'Send the payment using your chosen method and note the reference number.' },
                          { step: 3, title: 'Upload Proof of Payment', desc: 'Screenshot or photo of the transaction confirmation.' },
                          { step: 4, title: 'Wait for Confirmation', desc: 'The seller will verify your payment and update the status.' },
                        ].map((s) => (
                          <div key={s.step} className="flex gap-4">
                            <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-br from-[#D4A574] to-[#c99660] flex items-center justify-center text-navy text-sm font-bold">
                              {s.step}
                            </div>
                            <div>
                              <p className="text-white font-medium">{s.title}</p>
                              <p className="text-gray-blue text-sm">{s.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <h4 className="text-white font-medium mb-3 text-sm">Available Online Methods</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { icon: Building2, label: 'Bank Transfer', desc: 'BDO, BPI, Metrobank, UnionBank', color: 'blue' },
                          { icon: Smartphone, label: 'GCash', desc: 'Send via GCash mobile wallet', color: 'green' },
                          { icon: ShieldCheck, label: 'Pag-IBIG Fund', desc: 'Government housing loan', color: 'emerald' },
                          { icon: CreditCard, label: 'Credit Card', desc: 'Visa, Mastercard accepted', color: 'purple' },
                        ].map((m) => (
                          <div key={m.label} className="glass-card rounded-xl p-4 group hover:bg-white/[0.06] transition-all">
                            <div className={`w-10 h-10 mb-3 bg-${m.color}-500/10 border-${m.color}-500/20 rounded-lg flex items-center justify-center border group-hover:scale-110 transition-transform`}>
                              <m.icon className={`w-5 h-5 text-${m.color}-400`} />
                            </div>
                            <p className="text-white font-medium text-sm">{m.label}</p>
                            <p className="text-gray-blue text-xs mt-0.5">{m.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment Form - Online only */}
                  {payChannel === 'online' && (
                  <div className="glass-card rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-sand" />
                      Submit Payment
                    </h3>
                    {!loggedIn ? (
                      <p className="text-gray-blue text-sm">
                        <Link to="/login" className="text-sand hover:underline">Sign in</Link> to make a payment.
                      </p>
                    ) : isOwner ? (
                      <p className="text-gray-blue text-sm">You cannot pay for your own property.</p>
                    ) : property.status !== 'approved' ? (
                      <p className="text-gray-blue text-sm">This property is not currently available for payment.</p>
                    ) : isReservedByOther ? (
                      <p className="text-yellow-400 text-sm">This property is reserved by another buyer. Online payments are disabled.</p>
                    ) : (
                      <form onSubmit={handlePayment} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-gray-blue text-sm mb-1.5 block font-medium">Payment Type</label>
                            <select
                              value={payType}
                              onChange={(e) => setPayType(e.target.value)}
                              required
                              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                            >
                              <option value="reservation" className="bg-navy">Reservation Fee</option>
                              <option value="down_payment" className="bg-navy">Down Payment</option>
                              <option value="full_payment" className="bg-navy">Full Payment</option>
                              <option value="monthly" className="bg-navy">Monthly Installment</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-gray-blue text-sm mb-1.5 block font-medium">Payment Method</label>
                            <select
                              value={payMethod}
                              onChange={(e) => setPayMethod(e.target.value)}
                              required
                              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                            >
                              <option value="" disabled className="bg-navy">Select method</option>
                              <option value="bank_transfer" className="bg-navy">Bank Transfer</option>
                              <option value="gcash" className="bg-navy">GCash</option>
                              <option value="pagibig" className="bg-navy">Pag-IBIG Fund</option>
                              <option value="credit_card" className="bg-navy">Credit Card</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-gray-blue text-sm mb-1.5 block font-medium">Amount (₱)</label>
                            <input
                              type="number"
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                              required
                              min="1"
                              placeholder="Enter amount"
                              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                            />
                          </div>
                          <div>
                            <label className="text-gray-blue text-sm mb-1.5 block font-medium">Reference No. (transaction ref.)</label>
                            <input
                              type="text"
                              value={payRef}
                              onChange={(e) => setPayRef(e.target.value)}
                              placeholder="Transaction reference"
                              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-gray-blue text-sm mb-1.5 block font-medium">Notes (optional)</label>
                          <textarea
                            value={payNotes}
                            onChange={(e) => setPayNotes(e.target.value)}
                            rows={2}
                            placeholder="Additional notes..."
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 resize-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="text-gray-blue text-sm mb-1.5 block font-medium">
                            Proof of Payment (screenshot) <span className="text-sand">*</span>
                          </label>
                          {payProof ? (
                            <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/10">
                              <img src={payProof} alt="Proof" className="w-16 h-16 rounded-lg object-cover" />
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm truncate">Proof uploaded</p>
                                <button type="button" onClick={() => setPayProof('')} className="text-red-400 text-xs hover:underline">Remove</button>
                              </div>
                            </div>
                          ) : (
                            <label className="flex items-center justify-center gap-2 w-full py-3 bg-white/5 border border-dashed border-white/20 rounded-xl text-gray-blue text-sm cursor-pointer hover:border-sand/40 hover:text-sand transition-all">
                              <FileText className="w-4 h-4" />
                              {payUploading ? 'Uploading...' : 'Upload screenshot of transaction'}
                              <input type="file" accept="image/*" onChange={handleProofUpload} className="hidden" disabled={payUploading} />
                            </label>
                          )}
                        </div>
                        <button
                          type="submit"
                          disabled={paySending || !payAmount || !payMethod || !payProof}
                          className="w-full py-3.5 btn-magnetic bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl transition-all disabled:opacity-50 text-sm uppercase tracking-wider"
                        >
                          {paySending ? 'Processing...' : 'Submit Payment'}
                        </button>
                        {payStatus && (
                          <p className={`text-sm flex items-center gap-1 ${payStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
                            {payStatus.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {payStatus.text}
                          </p>
                        )}
                      </form>
                    )}
                  </div>
                  )}

                  {/* Payment Receipt - Online */}
                  {payChannel === 'online' && payReceipt && (
                    <div className="glass-card rounded-xl p-6 border border-green-500/20 bg-green-500/5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <FileText className="w-5 h-5 text-green-400" /> Payment Receipt
                        </h3>
                        <button
                          onClick={printReceipt}
                          className="flex items-center gap-1.5 text-sm text-sand hover:text-white transition-colors px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10"
                        >
                          <Printer className="w-4 h-4" /> Print Receipt
                        </button>
                      </div>
                      <div ref={receiptRef}>
                        <div className="receipt">
                          <div className="header">
                            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }}>EstateFlow</h1>
                            <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>Payment Receipt</p>
                          </div>
                          <div style={{ marginTop: '16px' }}>
                            {[
                              { label: 'Receipt #', value: `PAY-${String(payReceipt.id).padStart(6, '0')}` },
                              { label: 'Date', value: payReceipt.date },
                              { label: 'Property', value: payReceipt.propertyTitle },
                              { label: 'Buyer', value: payReceipt.buyerName },
                              { label: 'Seller', value: payReceipt.sellerName },
                              { label: 'Payment Type', value: payReceipt.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) },
                              { label: 'Payment Method', value: payReceipt.method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) },
                              ...(payReceipt.referenceNo ? [{ label: 'Reference No', value: payReceipt.referenceNo }] : []),
                            ].map((row) => (
                              <div key={row.label} className="flex justify-between py-2 border-b border-white/[0.06] text-sm">
                                <span className="text-gray-blue">{row.label}</span>
                                <span className="text-white font-medium">{row.value}</span>
                              </div>
                            ))}
                            <div className="flex justify-between py-3 border-t-2 border-sand/30 mt-2">
                              <span className="text-sand font-semibold text-base">Amount Paid</span>
                              <span className="text-sand font-bold text-xl">{formatFullPrice(payReceipt.amount)}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                            <p className="text-gray-blue/60 text-xs">Status: Pending Seller Verification</p>
                            <p className="text-gray-blue/40 text-[10px] mt-1">This receipt is generated upon submission. Final confirmation is subject to seller verification.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right – Contact & Appointment */}
          <div className="space-y-6">
            {/* Reserve Property */}
            {property.status === 'approved' && !isOwner && (
              <div className="detail-fade glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center border border-green-500/20">
                    <Calendar className="w-4 h-4 text-green-400" />
                  </div>
                  Reserve This Property
                </h3>
                {reservation ? (
                  <div>
                    <div className={`rounded-lg p-4 mb-3 ${reservation.status === 'pending' ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-green-500/10 border border-green-500/20'}`}>
                      <p className={`text-sm font-medium flex items-center gap-1.5 ${reservation.status === 'pending' ? 'text-orange-400' : 'text-green-400'}`}>
                        {reservation.status === 'pending' ? <Clock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        {reservation.userId === auth?.user.id
                          ? reservation.status === 'pending'
                            ? 'Your reservation is pending confirmation by the property owner'
                            : 'Your reservation is confirmed and active'
                          : reservation.status === 'pending'
                            ? 'A buyer has requested to reserve this property'
                            : 'This property is reserved'}
                      </p>
                      <p className="text-gray-blue text-xs mt-1">
                        Expires: <span className="text-white">{new Date(reservation.expiresAt).toLocaleDateString()} at {new Date(reservation.expiresAt).toLocaleTimeString()}</span>
                      </p>
                      {reservation.userName && reservation.userId !== auth?.user.id && (
                        <p className="text-gray-blue text-xs mt-0.5">Reserved by: <span className="text-white">{reservation.userName}</span></p>
                      )}
                    </div>
                    {reservation.userId === auth?.user.id && (
                      <button onClick={handleCancelReservation} className="w-full py-2.5 text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg border border-red-500/20 transition-colors">
                        Cancel Reservation
                      </button>
                    )}
                  </div>
                ) : !loggedIn ? (
                  <p className="text-gray-blue text-sm"><Link to="/login" className="text-sand hover:underline">Sign in</Link> to reserve this property.</p>
                ) : isReservedByOther ? (
                  <p className="text-yellow-400 text-sm">This property is reserved by another buyer.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-gray-blue text-sm">Reserve this property to secure it while you arrange financing or viewing. No one else can reserve it during this period.</p>
                    <div>
                      <label className="text-gray-blue text-sm mb-1.5 block font-medium">Reservation Period</label>
                      <select
                        value={reserveDays}
                        onChange={(e) => setReserveDays(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                      >
                        <option value="3" className="bg-navy">3 Days</option>
                        <option value="7" className="bg-navy">7 Days</option>
                        <option value="14" className="bg-navy">14 Days</option>
                        <option value="30" className="bg-navy">30 Days</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-blue text-sm mb-1.5 block font-medium">Notes (optional)</label>
                      <textarea
                        value={reserveNotes}
                        onChange={(e) => setReserveNotes(e.target.value)}
                        rows={2}
                        placeholder="Any notes about your reservation..."
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 resize-none transition-all"
                      />
                    </div>
                    <button
                      onClick={handleReserve}
                      disabled={reserving}
                      className="w-full py-3.5 bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 text-sm uppercase tracking-wider hover:shadow-lg hover:shadow-green-500/20"
                    >
                      {reserving ? 'Reserving...' : 'Reserve Property'}
                    </button>
                    {reserveStatus && (
                      <p className={`text-sm flex items-center gap-1 ${reserveStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {reserveStatus.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {reserveStatus.text}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Inquiry Form */}
            <div className="detail-fade glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-sand/10 rounded-lg flex items-center justify-center border border-sand/20">
                  <Send className="w-4 h-4 text-sand" />
                </div>
                Send Inquiry
              </h3>
              {!loggedIn ? (
                <p className="text-gray-blue text-sm">
                  <Link to="/login" className="text-sand hover:underline">Sign in</Link> to send an inquiry.
                </p>
              ) : property.status === 'sold' ? (
                <p className="text-gray-blue text-sm">This property has been sold.</p>
              ) : isOwner ? (
                <p className="text-gray-blue text-sm">This is your listing.</p>
              ) : isReservedByOther ? (
                <p className="text-yellow-400 text-sm">This property is reserved by another buyer. Inquiries are disabled.</p>
              ) : !isBuyer && auth?.user.role !== 'administrator' ? (
                <p className="text-gray-blue text-sm">Only buyers can send inquiries.</p>
              ) : (
                <form onSubmit={handleInquiry} className="space-y-4">
                  <textarea
                    value={inquiryMsg}
                    onChange={(e) => setInquiryMsg(e.target.value)}
                    placeholder="I'm interested in this property..."
                    required
                    rows={4}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 resize-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={inquirySending || !inquiryMsg.trim()}
                    className="w-full py-3.5 btn-magnetic bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl transition-all disabled:opacity-50 text-sm uppercase tracking-wider"
                  >
                    {inquirySending ? 'Sending...' : 'Send Inquiry'}
                  </button>
                  {inquiryStatus && (
                    <p className={`text-sm flex items-center gap-1 ${inquiryStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {inquiryStatus.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      {inquiryStatus.text}
                    </p>
                  )}
                </form>
              )}
            </div>

            {/* Appointment Form */}
            <div className="detail-fade glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-500/20">
                  <Clock className="w-4 h-4 text-blue-400" />
                </div>
                Schedule Viewing
              </h3>
              {!loggedIn ? (
                <p className="text-gray-blue text-sm">
                  <Link to="/login" className="text-sand hover:underline">Sign in</Link> to schedule a viewing.
                </p>
              ) : isReservedByOther ? (
                <p className="text-yellow-400 text-sm">This property is reserved by another buyer. Viewing scheduling is disabled.</p>
              ) : (
                <form onSubmit={handleAppointment} className="space-y-4">
                  <div>
                    <label className="text-gray-blue text-sm mb-1.5 block font-medium">Date</label>
                    <input
                      type="date"
                      value={apptDate}
                      onChange={(e) => setApptDate(e.target.value)}
                      required
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-gray-blue text-sm mb-1.5 block font-medium">Time</label>
                    <input
                      type="time"
                      value={apptTime}
                      onChange={(e) => setApptTime(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-gray-blue text-sm mb-1.5 block font-medium">Notes (optional)</label>
                    <textarea
                      value={apptNotes}
                      onChange={(e) => setApptNotes(e.target.value)}
                      rows={2}
                      placeholder="Any special requests..."
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 resize-none transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={apptSending}
                    className="w-full py-3.5 glass-card rounded-xl text-white font-medium hover:bg-white/[0.06] transition-all disabled:opacity-50"
                  >
                    {apptSending ? 'Booking...' : 'Request Viewing'}
                  </button>
                  {apptStatus && (
                    <p className={`text-sm flex items-center gap-1 ${apptStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {apptStatus.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      {apptStatus.text}
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
