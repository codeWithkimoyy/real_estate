import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { 
  Search, MapPin, Home, TrendingUp, ArrowRight, 
  Bed, Bath, Square, Heart, Star, CheckCircle, Mail, AlertCircle,
  Sparkles, Shield, Clock, ChevronRight,
} from 'lucide-react';
import { formatPrice, type Agent, type Property, type Neighborhood, type Testimonial } from '../data/philippineData';
import { getAgents, getProperties, getNeighborhoods, getTestimonials, addFavorite, removeFavorite, getFavorites } from '../lib/api';
import { isLoggedIn } from '../lib/auth';

gsap.registerPlugin(ScrollTrigger);

/* ── Floating particles background ──────────────────────── */
function Particles({ count = 30 }: { count?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-sand/20"
          style={{
            width: `${2 + Math.random() * 4}px`,
            height: `${2 + Math.random() * 4}px`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float-particle ${8 + Math.random() * 12}s linear infinite`,
            animationDelay: `${Math.random() * 10}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function HomePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('success');
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);
  const featuredRef = useRef<HTMLDivElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const neighborhoodsRef = useRef<HTMLDivElement>(null);
  const agentsRef = useRef<HTMLDivElement>(null);
  const testimonialsRef = useRef<HTMLDivElement>(null);
  const newsletterRef = useRef<HTMLDivElement>(null);

  // Track mouse for parallax effects on hero
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
    });
  }, []);

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const [propertiesData, agentsData, neighborhoodsData, testimonialsData] = await Promise.all([
          getProperties({ status: 'approved' }),
          getAgents(),
          getNeighborhoods(),
          getTestimonials(),
        ]);
        setProperties(propertiesData.items);
        setAgents(agentsData);
        setNeighborhoods(neighborhoodsData);
        setTestimonials(testimonialsData);

        if (isLoggedIn()) {
          try {
            const favs = await getFavorites();
            setFavoriteIds(favs.map(f => f.propertyId));
          } catch {
            // optional favorites load
          }
        }
      } catch {
        showStatus('Unable to load home page data right now. Please refresh in a moment.', 'error');
      }
    };
    void loadHomeData();
  }, []);

  const toggleFavorite = async (propertyId: number) => {
    if (!isLoggedIn()) {
      showStatus('Please sign in to save favorites.', 'info');
      return;
    }
    const isFavorite = favoriteIds.includes(propertyId);
    try {
      if (isFavorite) {
        await removeFavorite(propertyId);
        setFavoriteIds(prev => prev.filter(id => id !== propertyId));
      } else {
        await addFavorite(propertyId);
        setFavoriteIds(prev => [...prev, propertyId]);
      }
    } catch {
      showStatus('Failed to update favorites.', 'error');
    }
  };

  const showStatus = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setStatusMessage(message);
    setStatusType(type);
    setShowStatusModal(true);
    setTimeout(() => setShowStatusModal(false), 3000);
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      const animateIfExists = (
        selector: string,
        fromVars: gsap.TweenVars,
        toVars: gsap.TweenVars,
      ) => {
        if (gsap.utils.toArray(selector).length > 0) {
          gsap.fromTo(selector, fromVars, toVars);
        }
      };

      // Hero staggered entrance
      gsap.fromTo('.hero-badge', { opacity: 0, y: -20, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, delay: 0.2, ease: 'back.out(1.7)' });
      gsap.fromTo('.hero-title', { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 1, delay: 0.4, ease: 'power3.out' });
      gsap.fromTo('.hero-subtitle', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.7, ease: 'power2.out' });
      gsap.fromTo('.hero-search', { opacity: 0, y: 40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, delay: 0.9, ease: 'power2.out' });
      gsap.fromTo('.hero-stats > div', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, delay: 1.2, ease: 'power2.out' });

      // Section reveal animations with more variety
      animateIfExists('.featured-card', { opacity: 0, y: 40, rotateY: -5 }, {
        opacity: 1, y: 0, rotateY: 0, duration: 0.7, stagger: 0.12, ease: 'power3.out',
        scrollTrigger: { trigger: featuredRef.current, start: 'top 80%' },
      });

      gsap.fromTo('.step-card', { opacity: 0, y: 50, scale: 0.95 }, {
        opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.15, ease: 'back.out(1.5)',
        scrollTrigger: { trigger: howItWorksRef.current, start: 'top 80%' },
      });

      animateIfExists('.neighborhood-card', { opacity: 0, scale: 0.9, rotateX: 5 }, {
        opacity: 1, scale: 1, rotateX: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out',
        scrollTrigger: { trigger: neighborhoodsRef.current, start: 'top 80%' },
      });

      animateIfExists('.agent-card', { opacity: 0, y: 40, rotateY: 5 }, {
        opacity: 1, y: 0, rotateY: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out',
        scrollTrigger: { trigger: agentsRef.current, start: 'top 80%' },
      });

      animateIfExists('.testimonial-card', { opacity: 0, x: 50, scale: 0.95 }, {
        opacity: 1, x: 0, scale: 1, duration: 0.7, stagger: 0.15, ease: 'power3.out',
        scrollTrigger: { trigger: testimonialsRef.current, start: 'top 80%' },
      });

      gsap.fromTo('.newsletter-content', { opacity: 0, y: 50 }, {
        opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: newsletterRef.current, start: 'top 85%' },
      });

      // Section title animations
      gsap.utils.toArray<HTMLElement>('.section-title').forEach((el) => {
        gsap.fromTo(el, { opacity: 0, y: 30 }, {
          opacity: 1, y: 0, duration: 0.7, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 85%' },
        });
      });
    });
    return () => ctx.revert();
  }, [properties.length, agents.length]);

  return (
    <>
    <div className="relative">
      {/* ═══════════════════════════════════════════════════
          HERO SECTION — Immersive with parallax & particles
         ═══════════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative h-screen overflow-hidden" onMouseMove={handleMouseMove}>
        {/* Parallax background image */}
        <div
          className="absolute inset-0 scale-110"
          style={{ transform: `scale(1.1) translate(${mousePos.x * -8}px, ${mousePos.y * -8}px)` }}
        >
          <img
            src="/images/hero_night_coast.jpg"
            alt="Philippine luxury home"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Multi-layer gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-[rgba(10,37,64,0.5)] via-[rgba(10,37,64,0.25)] to-[rgba(10,37,64,0.85)]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[rgba(10,37,64,0.4)] via-transparent to-[rgba(10,37,64,0.4)]" />

        {/* Floating particles */}
        <Particles count={25} />

        {/* Animated gradient orbs */}
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[120px] pointer-events-none"
          style={{
            background: 'radial-gradient(circle, #D4A574, transparent)',
            left: `${45 + mousePos.x * 5}%`,
            top: `${30 + mousePos.y * 5}%`,
            transition: 'left 0.3s ease, top 0.3s ease',
          }}
        />

        {/* Hero Content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center px-6">
          <div className="text-center max-w-5xl mx-auto">
            {/* Animated badge */}
            <div className="hero-badge inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 mb-8">
              <Sparkles className="w-4 h-4 text-sand" />
              <span className="text-sm text-white/80 font-medium">Philippines&apos; Premier Property Platform</span>
            </div>

            <h1 className="hero-title headline-hero text-white mb-6">
              <span className="block">FIND</span>
              <span className="block text-gradient-animate">YOUR HOME</span>
            </h1>

            <div className="hero-subtitle">
              <div className="w-20 h-[2px] bg-gradient-to-r from-transparent via-sand to-transparent mx-auto mb-6" />
              <p className="text-gray-blue text-lg lg:text-xl mb-10 max-w-2xl mx-auto">
                Premium properties across the Philippines. From Makati condos to Cebu beach homes.
              </p>
            </div>

            {/* Enhanced Search Bar */}
            <div className="hero-search glass-card rounded-2xl p-5 max-w-3xl mx-auto animate-glow-pulse">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="flex items-center gap-2 bg-white/8 hover:bg-white/12 rounded-xl px-4 py-3.5 transition-colors group">
                  <MapPin className="w-5 h-5 text-sand group-hover:scale-110 transition-transform" />
                  <input
                    type="text"
                    placeholder="City (e.g., Makati)"
                    className="bg-transparent text-white placeholder:text-gray-400 text-sm w-full focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 bg-white/8 hover:bg-white/12 rounded-xl px-4 py-3.5 transition-colors group">
                  <Home className="w-5 h-5 text-sand group-hover:scale-110 transition-transform" />
                  <select className="bg-transparent text-white text-sm w-full focus:outline-none">
                    <option value="" className="text-navy">Property Type</option>
                    <option value="house" className="text-navy">House & Lot</option>
                    <option value="condo" className="text-navy">Condominium</option>
                    <option value="townhome" className="text-navy">Townhouse</option>
                    <option value="lot" className="text-navy">Lot Only</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 bg-white/8 hover:bg-white/12 rounded-xl px-4 py-3.5 transition-colors group">
                  <TrendingUp className="w-5 h-5 text-sand group-hover:scale-110 transition-transform" />
                  <select className="bg-transparent text-white text-sm w-full focus:outline-none">
                    <option value="" className="text-navy">Price Range</option>
                    <option value="0-5000000" className="text-navy">Under ₱5M</option>
                    <option value="5000000-10000000" className="text-navy">₱5M - ₱10M</option>
                    <option value="10000000-20000000" className="text-navy">₱10M - ₱20M</option>
                    <option value="20000000+" className="text-navy">₱20M+</option>
                  </select>
                </div>
                <Link
                  to="/listings"
                  className="btn-magnetic flex items-center justify-center gap-2 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl py-3.5 text-sm uppercase tracking-wider"
                >
                  <Search className="w-4 h-4" />
                  Search
                </Link>
              </div>
            </div>

            {/* Trust stats beneath search */}
            <div className="hero-stats flex flex-wrap items-center justify-center gap-6 lg:gap-10 mt-12">
              {[
                { value: '2,500+', label: 'Active Listings' },
                { value: '500+', label: 'Happy Clients' },
                { value: '50+', label: 'Licensed Agents' },
                { value: '15+', label: 'Cities Covered' },
              ].map((s) => (
                <div key={s.label} className="text-center px-4 py-3 rounded-xl bg-white/[0.04] backdrop-blur-sm border border-white/[0.06] badge-hover">
                  <p className="text-2xl lg:text-3xl font-display font-bold text-white">{s.value}</p>
                  <p className="text-gray-blue text-xs uppercase tracking-wider mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Animated scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center animate-float-slow">
          <div className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center pt-2 mb-2 mx-auto">
            <div className="w-1.5 h-3 bg-sand rounded-full animate-bounce" />
          </div>
          <span className="micro-label text-gray-blue/60">Scroll to explore</span>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          FEATURED PROPERTIES — 3D card effects
         ═══════════════════════════════════════════════════ */}
      <section ref={featuredRef} className="relative py-28 lg:py-36 px-6 lg:px-[4vw] bg-navy overflow-hidden">
        <Particles count={15} />
        {/* Decorative gradient blob */}
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-sand/[0.03] blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto relative">
          <div className="section-title flex items-end justify-between mb-16">
            <div>
              <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-sand/10 text-sand text-xs font-semibold uppercase tracking-wider mb-5 border border-sand/10">
                <Sparkles className="w-3.5 h-3.5" /> Featured
              </span>
              <h2 className="text-3xl lg:text-5xl font-display font-bold text-white animated-underline">
                Premium Listings
              </h2>
              <p className="text-gray-blue mt-3 max-w-md">Handpicked properties for discerning buyers across the Philippines.</p>
            </div>
            <Link
              to="/listings"
              className="hidden sm:flex items-center gap-2 text-sand hover:text-white transition-all group"
            >
              View All <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {properties.slice(0, 6).map((property) => (
              <Link
                key={property.id}
                to={`/property/${property.id}`}
                className="featured-card card-3d card-glow bg-white/[0.04] rounded-2xl overflow-hidden group border border-white/[0.06] hover:border-white/[0.12] transition-all duration-500"
              >
                <div className="relative aspect-[4/3] overflow-hidden img-reveal">
                  <img
                    src={property.image}
                    alt={property.title}
                    className="w-full h-full object-cover"
                  />
                  {/* Gradient overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                  <div className="absolute top-4 left-4">
                    {property.status === 'sold' ? (
                      <span className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500/90 text-white backdrop-blur-sm shadow-lg shadow-red-500/20">
                        SOLD
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-500/90 text-white backdrop-blur-sm shadow-lg shadow-green-500/20">
                        For Sale
                      </span>
                    )}
                  </div>
                  {property.status === 'sold' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-white text-2xl font-display font-bold tracking-wider opacity-80 -rotate-12 border-4 border-white/60 px-6 py-2 rounded-lg">SOLD</span>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(property.id); }}
                    className={`absolute top-4 right-4 p-2.5 rounded-xl backdrop-blur-md transition-all duration-300 ${
                      favoriteIds.includes(property.id) ? 'bg-red-500/80 scale-110' : 'bg-black/30 hover:bg-sand/80 hover:scale-110'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${favoriteIds.includes(property.id) ? 'text-white fill-white' : 'text-white'}`} />
                  </button>
                  <div className="absolute bottom-4 left-4 right-4">
                    <span className="text-2xl font-display font-bold text-white drop-shadow-lg">
                      {formatPrice(property.price)}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="text-white font-semibold mb-1.5 group-hover:text-sand transition-colors line-clamp-1">
                    {property.title}
                  </h3>
                  <p className="text-gray-blue text-sm mb-4 flex items-center gap-1.5 line-clamp-1">
                    <MapPin className="w-3.5 h-3.5 text-sand/60 shrink-0" />
                    {property.address}, {property.city}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-blue">
                    <span className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
                      <Bed className="w-3.5 h-3.5 text-sand/60" /> {property.beds}
                    </span>
                    <span className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
                      <Bath className="w-3.5 h-3.5 text-sand/60" /> {property.baths}
                    </span>
                    <span className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
                      <Square className="w-3.5 h-3.5 text-sand/60" /> {property.sqm} sqm
                    </span>
                  </div>
                  {/* View details indicator */}
                  <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                    <span className="text-gray-blue/60 text-xs uppercase tracking-wider capitalize">{property.propertyType}</span>
                    <span className="text-sand text-xs font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      View Details <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-10 text-center sm:hidden">
            <Link to="/listings" className="btn-primary inline-flex items-center gap-2 rounded-xl">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          HOW IT WORKS — Interactive step cards
         ═══════════════════════════════════════════════════ */}
      <section ref={howItWorksRef} className="relative py-28 lg:py-36 px-6 lg:px-[4vw] overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1f35] via-[#0A2540] to-[#081729]" />
        <div className="absolute top-0 left-0 right-0 section-divider" />

        <div className="max-w-7xl mx-auto relative">
          <div className="section-title text-center mb-20">
            <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-sand/10 text-sand text-xs font-semibold uppercase tracking-wider mb-5 border border-sand/10">
              <Clock className="w-3.5 h-3.5" /> Process
            </span>
            <h2 className="text-3xl lg:text-5xl font-display font-bold text-white mb-4">
              How It Works
            </h2>
            <p className="text-gray-blue max-w-lg mx-auto">Three simple steps to finding your dream property in the Philippines.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting line between steps */}
            <div className="hidden md:block absolute top-1/2 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-sand/30 via-sand/20 to-sand/30" style={{ transform: 'translateY(-50%)' }} />

            {[
              { step: '01', title: 'Search', description: 'Browse thousands of Philippine listings with advanced filters.', icon: Search, color: 'from-blue-500/20 to-blue-600/5' },
              { step: '02', title: 'Visit', description: 'Schedule viewings with PRC-accredited agents.', icon: MapPin, color: 'from-sand/20 to-sand/5' },
              { step: '03', title: 'Close', description: 'We handle paperwork, financing & title transfer.', icon: CheckCircle, color: 'from-green-500/20 to-green-600/5' },
            ].map((item) => (
              <div key={item.step} className="step-card group relative text-center">
                <div className="glass-card rounded-2xl p-8 lg:p-10 hover:bg-white/[0.06] transition-all duration-500 hover:-translate-y-3 hover:shadow-xl hover:shadow-black/10">
                  <div className={`w-20 h-20 mx-auto mb-6 bg-gradient-to-br ${item.color} rounded-2xl flex items-center justify-center border border-white/10 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-sand/10 transition-all duration-500`}>
                    <item.icon className="w-9 h-9 text-sand" />
                  </div>
                  <span className="inline-block px-3.5 py-1.5 text-sand text-xs font-bold tracking-wider bg-sand/10 rounded-full mb-4 border border-sand/10">
                    STEP {item.step}
                  </span>
                  <h3 className="text-xl font-display font-bold text-white mb-3 group-hover:text-sand transition-colors">{item.title}</h3>
                  <p className="text-gray-blue leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          NEIGHBORHOODS — Immersive image cards
         ═══════════════════════════════════════════════════ */}
      <section ref={neighborhoodsRef} className="relative py-28 lg:py-36 px-6 lg:px-[4vw] bg-navy overflow-hidden">
        <Particles count={12} />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-sand/[0.03] blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto relative">
          <div className="section-title flex items-end justify-between mb-16">
            <div>
              <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-sand/10 text-sand text-xs font-semibold uppercase tracking-wider mb-5 border border-sand/10">
                <MapPin className="w-3.5 h-3.5" /> Explore
              </span>
              <h2 className="text-3xl lg:text-5xl font-display font-bold text-white animated-underline">
                Popular Locations
              </h2>
              <p className="text-gray-blue mt-3 max-w-md">Discover trending neighborhoods with the highest appreciation rates.</p>
            </div>
            <Link to="/listings" className="hidden sm:flex items-center gap-2 text-sand hover:text-white transition-all group">
              View All <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {neighborhoods.map((neighborhood) => (
              <Link
                key={neighborhood.id}
                to="/listings"
                className="neighborhood-card group relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/[0.06]"
              >
                <img
                  src={neighborhood.image}
                  alt={neighborhood.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/40 to-transparent group-hover:from-navy/90 transition-all duration-500" />
                {/* Shimmer overlay on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6 transform group-hover:-translate-y-2 transition-transform duration-500">
                  <h3 className="text-xl font-display font-bold text-white mb-1">{neighborhood.name}</h3>
                  <p className="text-gray-blue text-sm mb-3">{neighborhood.city}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sand font-semibold">₱{neighborhood.avgPrice.toLocaleString()}/sqm</span>
                    <span className="text-green-400 text-sm font-medium bg-green-500/10 px-2 py-0.5 rounded-full">+{neighborhood.priceChange}%</span>
                  </div>
                  {/* Reveal on hover */}
                  <div className="mt-3 pt-3 border-t border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    <span className="text-sand text-sm font-medium flex items-center gap-1">
                      Explore properties <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          AGENTS — Enhanced profiles
         ═══════════════════════════════════════════════════ */}
      <section ref={agentsRef} className="relative py-28 lg:py-36 px-6 lg:px-[4vw] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1f35] via-[#0A2540] to-[#081729]" />
        <div className="absolute top-0 left-0 right-0 section-divider" />

        <div className="max-w-7xl mx-auto relative">
          <div className="section-title flex items-end justify-between mb-16">
            <div>
              <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-sand/10 text-sand text-xs font-semibold uppercase tracking-wider mb-5 border border-sand/10">
                <Shield className="w-3.5 h-3.5" /> Team
              </span>
              <h2 className="text-3xl lg:text-5xl font-display font-bold text-white animated-underline">
                PRC-Licensed Agents
              </h2>
              <p className="text-gray-blue mt-3 max-w-md">Work with accredited professionals who know the Philippine market inside out.</p>
            </div>
            <Link to="/agents" className="hidden sm:flex items-center gap-2 text-sand hover:text-white transition-all group">
              View All <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {agents.map((agent) => (
              <Link
                key={agent.id}
                to="/agents"
                className="agent-card card-3d group bg-white/[0.04] rounded-2xl overflow-hidden border border-white/[0.06]"
              >
                <div className="aspect-square overflow-hidden relative img-reveal">
                  {agent.avatar ? (
                    <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-sand/20 to-sand/5 flex items-center justify-center text-5xl font-display font-bold text-sand/40">
                      {agent.name.charAt(0)}
                    </div>
                  )}
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-navy/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end justify-center pb-4">
                    <span className="text-sand text-sm font-semibold flex items-center gap-1">View Profile <ArrowRight className="w-3.5 h-3.5" /></span>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="text-white font-semibold mb-1 group-hover:text-sand transition-colors">{agent.name}</h3>
                  <p className="text-sand/60 text-sm mb-3">{agent.bio ? agent.bio.slice(0, 55) + '…' : 'Real Estate Agent'}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-blue">
                    <span className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
                      <Home className="w-3.5 h-3.5 text-sand/60" /> {agent.listingsCount} listings
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          TESTIMONIALS — Glassmorphism cards
         ═══════════════════════════════════════════════════ */}
      <section ref={testimonialsRef} className="relative py-28 lg:py-36 px-6 lg:px-[4vw] bg-navy overflow-hidden">
        <Particles count={10} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-sand/[0.02] blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto relative">
          <div className="section-title text-center mb-16">
            <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-sand/10 text-sand text-xs font-semibold uppercase tracking-wider mb-5 border border-sand/10">
              <Star className="w-3.5 h-3.5" /> Reviews
            </span>
            <h2 className="text-3xl lg:text-5xl font-display font-bold text-white mb-4">
              What Our Clients Say
            </h2>
            <p className="text-gray-blue max-w-lg mx-auto">Real stories from real homeowners who trusted EstateFlow.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.id}
                className="testimonial-card glass-card rounded-2xl p-8 hover:bg-white/[0.06] transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-black/10 group border border-transparent hover:border-white/[0.06]"
              >
                {/* Large decorative quote */}
                <div className="text-6xl font-display text-sand/10 leading-none mb-4">&ldquo;</div>
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-sand fill-sand" />
                  ))}
                </div>
                <p className="text-gray-blue leading-relaxed mb-6 group-hover:text-white/70 transition-colors">
                  &ldquo;{testimonial.content}&rdquo;
                </p>
                <div className="flex items-center gap-4 pt-4 border-t border-white/[0.06]">
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    className="w-12 h-12 rounded-xl object-cover ring-2 ring-white/10"
                  />
                  <div>
                    <h4 className="text-white font-semibold text-sm">{testimonial.name}</h4>
                    <p className="text-gray-blue text-xs">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          NEWSLETTER CTA — Glass overlay with image BG
         ═══════════════════════════════════════════════════ */}
      <section ref={newsletterRef} className="relative py-28 lg:py-36 px-6 lg:px-[4vw] overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img src="/images/pool_house.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-navy/90 backdrop-blur-sm" />
        </div>

        <div className="max-w-3xl mx-auto text-center relative newsletter-content">
          <div className="glass-card rounded-3xl p-10 lg:p-16 border border-white/[0.08]">
            <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-sand/20 to-sand/5 rounded-2xl flex items-center justify-center border border-white/10 animate-float-slow">
              <Mail className="w-8 h-8 text-sand" />
            </div>
            <h2 className="text-3xl lg:text-4xl font-display font-bold text-white mb-4">
              Get Alerts for New Listings
            </h2>
            <p className="text-gray-blue mb-8 max-w-md mx-auto">
              Subscribe to receive notifications when new properties in your preferred locations become available.
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); showStatus('Thank you for subscribing!'); }}
              className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
            >
              <div className="flex-1 relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue/40 group-focus-within:text-sand transition-colors" />
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                />
              </div>
              <button
                type="submit"
                className="btn-magnetic px-8 py-3.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl text-sm uppercase tracking-wider"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          FOOTER — Enhanced with gradients
         ═══════════════════════════════════════════════════ */}
      <footer className="relative py-20 lg:py-24 px-6 lg:px-[4vw] bg-[#050d17] overflow-hidden">
        <div className="absolute top-0 left-0 right-0 section-divider" />
        <Particles count={8} />

        <div className="max-w-7xl mx-auto relative">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-14">
            <div className="md:col-span-1">
              <Link to="/" className="text-2xl font-display font-bold text-white mb-5 block text-gradient-animate">
                ESTATEFLOW
              </Link>
              <p className="text-gray-blue text-sm leading-relaxed mb-6">
                Find your dream home in the Philippines. Premium properties, PRC-licensed agents, trusted service.
              </p>
              <div className="flex gap-3">
                {['Facebook', 'Instagram', 'LinkedIn'].map((social) => (
                  <a
                    key={social}
                    href="#"
                    className="px-4 py-2.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-gray-blue hover:text-sand hover:bg-sand/10 hover:border-sand/20 transition-all duration-300 text-sm font-medium"
                  >
                    {social}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-6 text-sm uppercase tracking-wider">Quick Links</h4>
              <ul className="space-y-3.5">
                {['Listings', 'Agents', 'Sell Your Home', 'Dashboard'].map((link) => (
                  <li key={link}>
                    <Link
                      to={`/${link.toLowerCase().replace(/\s+/g, '-')}`}
                      className="text-gray-blue hover:text-sand transition-colors duration-300 text-sm flex items-center gap-2 group"
                    >
                      <ChevronRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-sand" />
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-6 text-sm uppercase tracking-wider">Contact</h4>
              <ul className="space-y-3.5 text-gray-blue text-sm">
                <li className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center"><Mail className="w-3.5 h-3.5 text-sand/60" /></div> hello@estateflow.ph</li>
                <li className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center"><Search className="w-3.5 h-3.5 text-sand/60" /></div> +63 917 014 2200</li>
                <li className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center"><MapPin className="w-3.5 h-3.5 text-sand/60" /></div> Makati City, Philippines</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-6 text-sm uppercase tracking-wider">Newsletter</h4>
              <p className="text-gray-blue text-sm mb-4">Get the latest listings delivered to your inbox.</p>
              <form onSubmit={(e) => { e.preventDefault(); showStatus('Thank you for subscribing!'); }} className="space-y-3">
                <input
                  type="email"
                  placeholder="Your email"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all text-sm"
                />
                <button type="submit" className="w-full px-4 py-3 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl text-sm uppercase tracking-wider hover:shadow-lg hover:shadow-sand/20 transition-all">
                  Subscribe
                </button>
              </form>
            </div>
          </div>
          <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-blue/50 text-sm">
              © 2026 EstateFlow Philippines. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-gray-blue/50">
              <a href="#" className="hover:text-sand transition-colors duration-300">Privacy Policy</a>
              <a href="#" className="hover:text-sand transition-colors duration-300">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>

    {/* Toast Notification — Minimal & non-intrusive */}
    {showStatusModal && statusMessage && (
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[999] toast-enter">
        <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl shadow-black/30 backdrop-blur-xl border border-white/[0.08] bg-[#0d1f35]/95 max-w-md">
          <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            statusType === 'success' ? 'bg-green-500/20' : statusType === 'error' ? 'bg-red-500/20' : 'bg-blue-500/20'
          }`}>
            {statusType === 'success' ? (
              <CheckCircle className="w-4 h-4 text-green-400" />
            ) : (
              <AlertCircle className={`w-4 h-4 ${statusType === 'error' ? 'text-red-400' : 'text-blue-400'}`} />
            )}
          </div>
          <p className="text-white text-sm font-medium flex-1">{statusMessage}</p>
          <button
            onClick={() => setShowStatusModal(false)}
            className="flex-shrink-0 text-gray-blue hover:text-white transition-colors p-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    )}
    </>
  );
}
