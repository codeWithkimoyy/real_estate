import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { X, Menu, Search, Heart, Home, Building2, Users, DollarSign, LayoutDashboard, LogIn, UserPlus, LogOut } from 'lucide-react';
import { getStoredAuth, isLoggedIn, logoutUser, subscribeAuthChange } from '../lib/auth';
import { roleHasPermission } from '../lib/rbac';
import BrandLogo from './BrandLogo';

const navIcons: Record<string, typeof Home> = {
  Home, Listings: Building2, Agents: Users, 'Sell Your Home': DollarSign, Dashboard: LayoutDashboard,
};

export default function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location]);

  useEffect(() => {
    const unsubscribe = subscribeAuthChange(() => setLoggedIn(isLoggedIn()));
    setLoggedIn(isLoggedIn());
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    setIsMenuOpen(false);
    navigate('/');
  };

  const userRole = getStoredAuth()?.user.role;
  const canSeeDashboard = roleHasPermission(userRole, 'view_dashboard');
  const isDashboardPage = location.pathname.startsWith('/dashboard');

  const menuItems = [
    { label: 'Home', href: '/' },
    { label: 'Listings', href: '/listings' },
    { label: 'Agents', href: '/agents' },
    { label: 'Sell Your Home', href: '/sell' },
    ...(loggedIn && canSeeDashboard ? [{ label: 'Dashboard', href: '/dashboard' }] : []),
  ];

  // On dashboard, show only the items not already in the sidebar
  const navItems = isDashboardPage
    ? [{ label: 'Home', href: '/' }, { label: 'Listings', href: '/listings' }]
    : menuItems;

  const isHomePage = location.pathname === '/';

  const getNavIcon = (label: string) => navIcons[label] ?? Home;

  /* ── Dashboard pages: slim header only (sidebar lives in DashboardPage) ── */
  if (isDashboardPage) {
    return (
      <header
        className="fixed top-0 left-0 right-0 z-[100] bg-navy/90 backdrop-blur-md border-b border-white/[0.06] shadow-lg shadow-black/10"
      >
        <div className="flex items-center justify-between px-6 lg:px-[4vw] py-4">
          <BrandLogo to="/" logoClassName="w-10 h-10" textClassName="text-xl font-display font-bold text-gradient-animate tracking-tight" />
          <div className="flex items-center gap-4">
            <Link to="/listings" className="hidden sm:flex items-center gap-2 text-gray-blue hover:text-white transition-colors">
              <Search className="w-5 h-5" />
            </Link>
            {loggedIn && (
              <button onClick={() => { void handleLogout(); }} className="flex items-center gap-2 text-gray-blue hover:text-sand text-sm transition-colors font-medium">
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            )}
          </div>
        </div>
      </header>
    );
  }

  /* ── Non-dashboard pages: full top bar + sidebar drawer ── */
  return (
    <>
      {/* Fixed Header */}
      <header 
        className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ease-out ${
          isScrolled || !isHomePage 
            ? 'bg-navy/95 backdrop-blur-xl border-b border-white/[0.06] shadow-lg shadow-black/10 py-0' 
            : 'bg-transparent py-1'
        }`}
      >
        <div className="flex items-center justify-between px-6 lg:px-[4vw] py-3.5">
          {/* Logo */}
          <BrandLogo to="/" logoClassName="w-10 h-10" textClassName="text-xl font-display font-bold text-gradient-animate tracking-tight" />

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            {navItems.map((item) => (
              (() => {
                const Icon = getNavIcon(item.label);
                return (
              <Link
                key={item.label}
                to={item.href}
                className={`relative flex items-center gap-2 text-sm tracking-wide transition-all duration-300 link-underline ${
                  location.pathname === item.href 
                    ? 'text-sand font-medium nav-dot' 
                    : 'text-gray-blue hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
                );
              })()
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            <Link 
              to="/listings" 
              className="hidden sm:flex items-center gap-2 text-gray-blue hover:text-white transition-colors"
            >
              <Search className="w-5 h-5" />
            </Link>
            {loggedIn && canSeeDashboard ? (
              <Link 
                to="/dashboard" 
                className="hidden sm:flex items-center gap-2 text-gray-blue hover:text-white transition-colors"
              >
                <Heart className="w-5 h-5" />
              </Link>
            ) : null}
            
            {/* Login/Register Buttons */}
            <div className="hidden md:flex items-center gap-3">
              {loggedIn ? (
                <button
                  onClick={() => { void handleLogout(); }}
                  className="flex items-center gap-2 text-gray-blue hover:text-sand text-sm transition-colors font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              ) : (
                <>
                  <Link 
                    to="/login"
                    className="flex items-center gap-2 text-gray-blue hover:text-white text-sm transition-colors font-medium"
                  >
                    <LogIn className="w-4 h-4" />
                    Sign In
                  </Link>
                  <Link 
                    to="/register"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-sand/25 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.97]"
                  >
                    <UserPlus className="w-4 h-4" />
                    Sign Up
                  </Link>
                </>
              )}
            </div>
            
            {/* Mobile Menu Button */}
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="flex items-center gap-2 text-white hover:text-sand transition-colors lg:hidden"
            >
              <span className="micro-label hidden sm:inline">MENU</span>
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Backdrop */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-[199] bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* ── Mobile Sidebar Drawer ──────────────────────── */}
      <aside
        className={`fixed top-0 right-0 z-[200] h-full w-80 bg-gradient-to-b from-[#0c1f35] to-[#081729] border-l border-white/[0.06] flex flex-col transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-2xl shadow-black/50 lg:hidden ${
          isMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <BrandLogo
            to="/"
            className="group"
            logoClassName="w-9 h-9"
            textClassName="text-lg font-display font-bold text-gradient-animate tracking-tight"
            onClick={() => setIsMenuOpen(false)}
          />
          <button onClick={() => setIsMenuOpen(false)} className="p-2 rounded-lg text-gray-blue hover:text-white hover:bg-white/10 transition-all group">
            <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-4 px-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-blue/60 mb-2 px-3">Navigation</p>
          <div className="space-y-1">
            {navItems.map((item, index) => {
              const isActive = location.pathname === item.href;
              const Icon = navIcons[item.label] ?? Home;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className={`group flex items-center gap-3 px-3 py-3 text-sm rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-sand/12 text-sand shadow-sm shadow-sand/5'
                      : 'text-gray-blue hover:text-white hover:bg-white/[0.04]'
                  }`}
                  style={{ 
                    transitionDelay: isMenuOpen ? `${index * 40}ms` : '0ms',
                    opacity: isMenuOpen ? 1 : 0,
                    transform: isMenuOpen ? 'translateX(0)' : 'translateX(20px)',
                    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                >
                  <div className={`p-1.5 rounded-md transition-colors ${isActive ? 'bg-sand/15' : 'bg-white/[0.04] group-hover:bg-white/[0.06]'}`}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                  </div>
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Auth Buttons */}
        <div className="px-4 py-4 border-t border-white/[0.06] space-y-2">
          {loggedIn ? (
            <button
              onClick={() => { void handleLogout(); }}
              className="flex items-center gap-3 w-full px-3 py-3 text-sm text-gray-blue hover:text-white hover:bg-white/[0.04] rounded-lg transition-all font-medium"
            >
              <div className="p-1.5 rounded-md bg-white/[0.04]"><LogOut className="w-4 h-4" /></div>
              Sign Out
            </button>
          ) : (
            <>
              <Link to="/login" className="flex items-center gap-3 w-full px-3 py-3 text-sm text-gray-blue hover:text-white hover:bg-white/[0.04] rounded-lg transition-all font-medium">
                <div className="p-1.5 rounded-md bg-white/[0.04]"><LogIn className="w-4 h-4" /></div>
                Sign In
              </Link>
              <Link to="/register" className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-lg hover:shadow-lg hover:shadow-[#D4A574]/20 transition-all duration-200 text-sm">
                <UserPlus className="w-4 h-4" /> Create Account
              </Link>
            </>
          )}
        </div>

        {/* Contact Info */}
        <div className="px-6 py-4 border-t border-white/[0.06] text-center">
          <p className="text-gray-blue text-xs mb-1">hello@braderrealestate.ph</p>
          <p className="text-gray-blue text-xs">+63 917 014 2200</p>
        </div>
      </aside>
    </>
  );
}
