import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { 
  Search, Grid, Map, Heart, Bed, Bath, Square, 
  ChevronDown, X, SlidersHorizontal, MapPin, ChevronRight
} from 'lucide-react';
import { formatPrice, type Property } from '../data/philippineData';
import { getProperties, addFavorite, removeFavorite, getFavorites } from '../lib/api';
import { isLoggedIn } from '../lib/auth';

gsap.registerPlugin(ScrollTrigger);

export default function ListingsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [favorites, setFavorites] = useState<number[]>([]);
  
  // Filter states
  const [filters, setFilters] = useState({
    location: '',
    propertyType: 'all',
    minPrice: '',
    maxPrice: '',
    beds: 'any',
    baths: 'any',
  });

  const listingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadProperties = async () => {
      const data = await getProperties({ status: 'approved' });
      setProperties(data.items);
      setFilteredProperties(data.items);
      setIsLoading(false);

      if (isLoggedIn()) {
        try {
          const favs = await getFavorites();
          setFavorites(favs.map((f) => f.propertyId));
        } catch { /* */ }
      }
    };

    void loadProperties();
  }, []);

  useEffect(() => {
    if (isLoading || filteredProperties.length === 0 || !listingsRef.current) return;
    const cards = listingsRef.current.querySelectorAll('.listing-card');
    if (cards.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.fromTo('.listing-card',
        { opacity: 0.88, y: 14, rotateY: -1 },
        {
          opacity: 1,
          y: 0,
          rotateY: 0,
          duration: 0.42,
          stagger: 0.06,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: listingsRef.current,
            start: 'top 85%',
          }
        }
      );
    }, listingsRef);

    return () => ctx.revert();
  }, [filteredProperties, isLoading]);

  // Apply filters
  useEffect(() => {
    let result = [...properties];

    if (filters.location) {
      result = result.filter(p => 
        p.city.toLowerCase().includes(filters.location.toLowerCase()) ||
        p.province.toLowerCase().includes(filters.location.toLowerCase())
      );
    }

    if (filters.propertyType !== 'all') {
      result = result.filter(p => p.propertyType === filters.propertyType);
    }

    if (filters.minPrice) {
      result = result.filter(p => p.price >= parseInt(filters.minPrice));
    }

    if (filters.maxPrice) {
      result = result.filter(p => p.price <= parseInt(filters.maxPrice));
    }

    if (filters.beds !== 'any') {
      result = result.filter(p => p.beds >= parseInt(filters.beds));
    }

    if (filters.baths !== 'any') {
      result = result.filter(p => p.baths >= parseInt(filters.baths));
    }

    // Sort
    switch (sortBy) {
      case 'price-low':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-high':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'sqm':
        result.sort((a, b) => b.sqm - a.sqm);
        break;
      default:
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    setFilteredProperties(result);
  }, [filters, sortBy, properties]);

  const toggleFavorite = async (id: number) => {
    if (!isLoggedIn()) return;
    const isFav = favorites.includes(id);
    try {
      if (isFav) {
        await removeFavorite(id);
        setFavorites(prev => prev.filter(f => f !== id));
      } else {
        await addFavorite(id);
        setFavorites(prev => [...prev, id]);
      }
    } catch { /* */ }
  };

  const clearFilters = () => {
    setFilters({
      location: '',
      propertyType: 'all',
      minPrice: '',
      maxPrice: '',
      beds: 'any',
      baths: 'any',
    });
  };

  return (
    <div className="min-h-screen bg-navy pt-20 relative overflow-hidden">
      {/* Background particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {Array.from({ length: 12 }).map((_, i) => (
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

      {/* Search Header */}
      <div className="sticky top-14 z-40 bg-navy/95 backdrop-blur-xl border-b border-white/[0.06] shadow-lg shadow-black/5">
        <div className="px-6 lg:px-[4vw] py-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1 relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors duration-300" />
              <input 
                type="text"
                placeholder="Search by city (e.g., Makati, Cebu, Davao)..."
                value={filters.location}
                onChange={(e) => setFilters({...filters, location: e.target.value})}
                className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-2 focus:ring-sand/10 focus:bg-white/[0.07] transition-all duration-300"
              />
            </div>

            {/* Quick Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0">
              <select 
                value={filters.propertyType}
                onChange={(e) => setFilters({...filters, propertyType: e.target.value})}
                className="px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 whitespace-nowrap transition-all"
              >
                <option value="all" className="bg-navy">All Types</option>
                <option value="house" className="bg-navy">House & Lot</option>
                <option value="condo" className="bg-navy">Condominium</option>
                <option value="townhome" className="bg-navy">Townhouse</option>
                <option value="lot" className="bg-navy">Lot Only</option>
              </select>

              <select 
                value={filters.beds}
                onChange={(e) => setFilters({...filters, beds: e.target.value})}
                className="px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 whitespace-nowrap transition-all"
              >
                <option value="any" className="bg-navy">Any Beds</option>
                <option value="1" className="bg-navy">1+ Bed</option>
                <option value="2" className="bg-navy">2+ Beds</option>
                <option value="3" className="bg-navy">3+ Beds</option>
                <option value="4" className="bg-navy">4+ Beds</option>
              </select>

              <select 
                value={filters.baths}
                onChange={(e) => setFilters({...filters, baths: e.target.value})}
                className="px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 whitespace-nowrap transition-all"
              >
                <option value="any" className="bg-navy">Any Baths</option>
                <option value="1" className="bg-navy">1+ Bath</option>
                <option value="2" className="bg-navy">2+ Baths</option>
                <option value="3" className="bg-navy">3+ Baths</option>
              </select>

              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-3.5 border rounded-xl text-sm whitespace-nowrap transition-all ${
                  showFilters ? 'bg-gradient-to-r from-[#D4A574] to-[#c99660] border-sand text-navy font-semibold' : 'bg-white/5 border-white/10 text-white hover:bg-white/[0.08] hover:border-white/20'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
              </button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="mt-4 p-5 glass-card rounded-xl animate-slide-up-fade">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-gray-blue text-sm mb-2 block">Min Price</label>
                  <select 
                    value={filters.minPrice}
                    onChange={(e) => setFilters({...filters, minPrice: e.target.value})}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-sand"
                  >
                    <option value="" className="bg-navy">No Minimum</option>
                    <option value="1000000" className="bg-navy">₱1M</option>
                    <option value="5000000" className="bg-navy">₱5M</option>
                    <option value="10000000" className="bg-navy">₱10M</option>
                    <option value="20000000" className="bg-navy">₱20M</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-blue text-sm mb-2 block">Max Price</label>
                  <select 
                    value={filters.maxPrice}
                    onChange={(e) => setFilters({...filters, maxPrice: e.target.value})}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-sand"
                  >
                    <option value="" className="bg-navy">No Maximum</option>
                    <option value="5000000" className="bg-navy">₱5M</option>
                    <option value="10000000" className="bg-navy">₱10M</option>
                    <option value="20000000" className="bg-navy">₱20M</option>
                    <option value="50000000" className="bg-navy">₱50M</option>
                    <option value="100000000" className="bg-navy">₱100M</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button 
                  onClick={clearFilters}
                  className="text-gray-blue hover:text-sand text-sm flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> Clear all filters
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results Header */}
      <div className="px-6 lg:px-[4vw] py-6 relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-white">
                {filteredProperties.length} Properties
              </h1>
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-sand/10 text-sand border border-sand/20">
                {filters.location || 'All Philippines'}
              </span>
            </div>
            <p className="text-gray-blue text-sm mt-1">
              {filters.location ? `Showing results in ${filters.location}` : 'Premium listings across the Philippines'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Sort */}
            <div className="relative">
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none px-4 py-2.5 pr-10 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-sand/50 transition-all"
              >
                <option value="newest" className="bg-navy">Newest First</option>
                <option value="price-low" className="bg-navy">Price: Low to High</option>
                <option value="price-high" className="bg-navy">Price: High to Low</option>
                <option value="sqm" className="bg-navy">Size (sqm)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-blue pointer-events-none" />
            </div>

            {/* View Toggle */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/[0.06]">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy shadow-lg shadow-sand/20' : 'text-gray-blue hover:text-white'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('map')}
                className={`p-2.5 rounded-lg transition-all ${viewMode === 'map' ? 'bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy shadow-lg shadow-sand/20' : 'text-gray-blue hover:text-white'}`}
              >
                <Map className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div ref={listingsRef} className="px-6 lg:px-[4vw] pb-16">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white/[0.04] rounded-2xl overflow-hidden border border-white/[0.06]">
                <div className="aspect-[4/3] skeleton" />
                <div className="p-5 space-y-3">
                  <div className="h-5 w-3/4 skeleton rounded-lg" />
                  <div className="h-4 w-1/2 skeleton rounded-lg" />
                  <div className="flex gap-3 mt-4">
                    <div className="h-7 w-16 skeleton rounded-lg" />
                    <div className="h-7 w-16 skeleton rounded-lg" />
                    <div className="h-7 w-20 skeleton rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProperties.map((property) => (
              <div key={property.id} className="listing-card">
                <Link 
                  to={`/property/${property.id}`}
                  className="block card-3d card-glow bg-white/[0.04] rounded-2xl overflow-hidden group border border-white/[0.06] hover:border-white/[0.12] transition-all duration-500"
                >
                  <div className="relative aspect-[4/3] overflow-hidden img-reveal">
                    <img 
                      src={property.image} 
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
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
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavorite(property.id);
                      }}
                      className={`absolute top-4 right-4 p-2.5 rounded-xl backdrop-blur-md transition-all duration-300 ${
                        favorites.includes(property.id)
                          ? 'bg-red-500/80 scale-110'
                          : 'bg-black/30 hover:bg-sand/80 hover:scale-110'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${favorites.includes(property.id) ? 'text-white fill-white' : 'text-white'}`} />
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
                      {property.city}, {property.province}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-gray-blue">
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
                    <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                      <span className="text-gray-blue/60 text-xs uppercase tracking-wider capitalize">{property.propertyType}</span>
                      <span className="text-sand text-xs font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        View Details <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-16 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-sand/20 to-sand/5 rounded-2xl flex items-center justify-center border border-white/10 animate-float-slow">
              <Map className="w-10 h-10 text-sand" />
            </div>
            <h3 className="text-xl font-display font-bold text-white mb-2">Map View</h3>
            <p className="text-gray-blue">Interactive map coming soon. Switch to grid view to see listings.</p>
          </div>
        )}

        {filteredProperties.length === 0 && !isLoading && (
          <div className="text-center py-24">
            <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-sand/20 to-sand/5 rounded-3xl flex items-center justify-center border border-white/10 animate-float-slow">
              <Search className="w-12 h-12 text-sand/60" />
            </div>
            <h3 className="text-2xl font-display font-bold text-white mb-3">No properties found</h3>
            <p className="text-gray-blue mb-8 max-w-sm mx-auto">Try adjusting your filters or search for a different location to see more results.</p>
            <button 
              onClick={clearFilters}
              className="btn-magnetic px-8 py-3.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl text-sm uppercase tracking-wider"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
