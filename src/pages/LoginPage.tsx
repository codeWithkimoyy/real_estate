import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, ArrowRight, Home, Sparkles, X, UserPlus } from 'lucide-react';
import { loginUser, loginWithGoogle, completeGoogleRegister } from '../lib/auth';
import type { GoogleNeedsRole } from '../lib/auth';
import { PUBLIC_SIGNUP_ROLES, ROLE_LABELS } from '../lib/rbac';
import type { UserRole } from '../lib/rbac';
import gsap from 'gsap';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            use_fedcm_for_prompt?: boolean;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string | number | boolean>) => void;
        };
      };
    };
    __estateflowGoogleInit?: {
      clientId: string | null;
      initPromise: Promise<void> | null;
    };
    __estateflowGoogleCredentialHandler?: (credential: string) => void;
  }
}

const GOOGLE_GSI_SCRIPT_ID = 'google-gsi-client';

function getGoogleInitState(): { clientId: string | null; initPromise: Promise<void> | null } {
  if (!window.__estateflowGoogleInit) {
    window.__estateflowGoogleInit = { clientId: null, initPromise: null };
  }
  return window.__estateflowGoogleInit;
}

async function ensureGoogleScriptLoaded(): Promise<void> {
  if (window.google?.accounts?.id) return;

  if (document.getElementById(GOOGLE_GSI_SCRIPT_ID)) {
    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (window.google?.accounts?.id) {
          window.clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 10000) {
          window.clearInterval(timer);
          reject(new Error('Google script timed out while loading.'));
        }
      }, 100);
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = GOOGLE_GSI_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In script.'));
    document.head.appendChild(script);
  });
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [pendingGoogleToken, setPendingGoogleToken] = useState<string | null>(null);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('buyer');
  const formRef = useRef<HTMLDivElement>(null);
  const googleButtonHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.__estateflowGoogleCredentialHandler = (credential: string) => {
      setSubmitError('');
      setIsGoogleLoading(true);
      void (async () => {
        try {
          const result = await loginWithGoogle(credential);
          if ('needsRole' in result && result.needsRole) {
            // New user — show role picker
            setPendingGoogleToken(result.pendingToken);
            setShowRolePicker(true);
            setIsGoogleLoading(false);
            return;
          }
          navigate('/dashboard');
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : 'Unable to sign in with Google');
        } finally {
          setIsGoogleLoading(false);
        }
      })();
    };

    return () => {
      window.__estateflowGoogleCredentialHandler = undefined;
    };
  }, [navigate]);

  const handleGoogleRoleSubmit = async () => {
    if (!pendingGoogleToken) return;
    setSubmitError('');
    setIsGoogleLoading(true);
    try {
      await completeGoogleRegister(pendingGoogleToken, selectedRole);
      setShowRolePicker(false);
      navigate('/dashboard');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to complete Google sign-up');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const initGoogleSignIn = useCallback(async (): Promise<boolean> => {
    const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
    if (!clientId) {
      setSubmitError('Google login is not configured. Add VITE_GOOGLE_CLIENT_ID to your .env file.');
      return false;
    }

    if (!googleButtonHostRef.current) {
      return false;
    }

    const googleInit = getGoogleInitState();

    if (googleInit.clientId === clientId) {
      return true;
    }

    try {
      if (!googleInit.initPromise) {
        googleInit.initPromise = (async () => {
          await ensureGoogleScriptLoaded();
        })();
      }
      await googleInit.initPromise;

      if (!window.google?.accounts?.id || !googleButtonHostRef.current) {
        return false;
      }

      // React StrictMode and Fast Refresh can remount/re-evaluate; keep SDK init singleton on window.
      if (googleInit.clientId !== clientId) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          use_fedcm_for_prompt: true,
          callback: (response) => {
            if (!response.credential || !window.__estateflowGoogleCredentialHandler) return;
            window.__estateflowGoogleCredentialHandler(response.credential as string);
          },
        });
        googleInit.clientId = clientId;
      }

      googleButtonHostRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonHostRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        width: 280,
        shape: 'pill',
      });

      return true;
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to initialize Google Sign-In');
      return false;
    } finally {
      const googleInit = getGoogleInitState();
      googleInit.initPromise = null;
    }
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.login-image-overlay', { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power2.out' });
      gsap.fromTo('.login-image-text', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.4, ease: 'power2.out' });
      gsap.fromTo('.login-form-header', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6, delay: 0.2, ease: 'power2.out' });
      gsap.fromTo('.login-form-field', { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.1, delay: 0.4, ease: 'power2.out' });
      gsap.fromTo('.login-form-btn', { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, delay: 0.8, ease: 'back.out(1.5)' });
      gsap.fromTo('.login-social', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, delay: 1, ease: 'power2.out' });
    });
    return () => ctx.revert();
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setSubmitError('');
    setIsLoading(true);

    try {
      await loginUser(formData.email, formData.password);
      setIsLoading(false);
      navigate('/dashboard');
    } catch (error) {
      setIsLoading(false);
      setSubmitError(error instanceof Error ? error.message : 'Unable to sign in');
    }
  };

  const handleGoogleLogin = async () => {
    const initialized = await initGoogleSignIn();
    if (!initialized || !googleButtonHostRef.current) {
      setSubmitError('Google Sign-In is still loading. Please try again in a moment.');
      return;
    }

    setSubmitError('');

    try {
      const button =
        (googleButtonHostRef.current.querySelector('div[role="button"]') as HTMLElement | null) ??
        (googleButtonHostRef.current.firstElementChild as HTMLElement | null);
      if (!button) {
        throw new Error('Google Sign-In button is not ready yet.');
      }

      button.click();
    } catch (error) {
      setIsGoogleLoading(false);
      setSubmitError(error instanceof Error ? error.message : 'Unable to sign in with Google');
    }
  };

  return (
    <div className="min-h-screen bg-navy flex relative overflow-hidden page-enter">
      {/* Background particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-sand/10"
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

      {/* Left Side - Image with parallax */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img 
          src="/images/modern_interior.jpg" 
          alt="Luxury home"
          className="absolute inset-0 w-full h-full object-cover scale-105 transition-transform duration-[3000ms] hover:scale-110"
        />
        <div className="login-image-overlay absolute inset-0 bg-gradient-to-r from-navy/90 via-navy/50 to-navy/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-transparent" />
        
        {/* Decorative gradient orb */}
        <div className="absolute bottom-20 right-20 w-[300px] h-[300px] rounded-full bg-sand/10 blur-[100px] pointer-events-none animate-float-slow" />

        <div className="relative z-10 flex flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-3 text-white group">
            <div className="w-10 h-10 bg-sand/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10 group-hover:bg-sand/30 transition-colors">
              <Home className="w-5 h-5" />
            </div>
            <span className="text-xl font-display font-bold text-gradient-animate">ESTATEFLOW</span>
          </Link>
          <div className="login-image-text">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 mb-6">
              <Sparkles className="w-3.5 h-3.5 text-sand" />
              <span className="text-xs text-white/80 font-medium">Trusted by 2,500+ homebuyers</span>
            </div>
            <h2 className="text-4xl font-display font-bold text-white mb-4 leading-tight">
              Find Your Dream Home<br />in the Philippines
            </h2>
            <p className="text-gray-blue text-lg">
              Join thousands of Filipinos who found their perfect property with EstateFlow.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative" ref={formRef}>
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-navy via-[#0d1f35] to-navy" />
        
        <div className="w-full max-w-md relative">
          {/* Mobile Logo */}
          <Link to="/" className="lg:hidden flex items-center gap-3 text-white mb-8">
            <div className="w-10 h-10 bg-sand/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10">
              <Home className="w-5 h-5" />
            </div>
            <span className="text-xl font-display font-bold text-gradient-animate">ESTATEFLOW</span>
          </Link>

          <div className="login-form-header text-center mb-10">
            <div className="w-16 h-16 mx-auto mb-5 bg-gradient-to-br from-sand/20 to-sand/5 rounded-2xl flex items-center justify-center border border-white/10 animate-float-slow">
              <Lock className="w-7 h-7 text-sand" />
            </div>
            <h1 className="text-3xl font-display font-bold text-white mb-3">
              Welcome Back
            </h1>
            <p className="text-gray-blue text-sm">
              Sign in to access your saved properties and more
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="login-form-field">
              <label className="block text-sm text-gray-blue mb-2 font-medium">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                <input 
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="your@email.com"
                  className={`w-full pl-12 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all ${
                    errors.email ? 'border-red-500' : 'border-white/10'
                  }`}
                />
              </div>
              {errors.email && (
                <p className="text-red-400 text-sm mt-1.5 flex items-center gap-1">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="login-form-field">
              <label className="block text-sm text-gray-blue mb-2 font-medium">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                <input 
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder="Enter your password"
                  className={`w-full pl-12 pr-12 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all ${
                    errors.password ? 'border-red-500' : 'border-white/10'
                  }`}
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-blue hover:text-sand transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-sm mt-1.5">{errors.password}</p>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="login-form-field flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input 
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={(e) => setFormData({...formData, rememberMe: e.target.checked})}
                  className="w-4 h-4 accent-sand rounded"
                />
                <span className="text-gray-blue text-sm group-hover:text-white/70 transition-colors">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-sand text-sm hover:text-white transition-colors">
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            {submitError && (
              <div className="login-form-field bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">{submitError}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="login-form-btn w-full btn-magnetic py-3.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm uppercase tracking-wider hover:shadow-lg hover:shadow-sand/25 active:scale-[0.98] transition-all duration-300"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-navy border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Sign In <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Social Login */}
          <div className="login-social mt-8">
            <div ref={googleButtonHostRef} className="absolute -left-[9999px] -top-[9999px] pointer-events-none opacity-0" aria-hidden="true" />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.06]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-[#0d1f35] text-gray-blue">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <button
                type="button"
                disabled={isGoogleLoading}
                onClick={() => void handleGoogleLogin()}
                className="flex items-center justify-center gap-2.5 px-4 py-3 glass-card rounded-xl text-white hover:bg-white/[0.06] transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {isGoogleLoading ? 'Connecting...' : 'Google'}
              </button>
              <button type="button" className="flex items-center justify-center gap-2.5 px-4 py-3 glass-card rounded-xl text-white hover:bg-white/[0.06] transition-all group">
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebook
              </button>
            </div>
          </div>

          {/* Register Link */}
          <p className="mt-8 text-center text-gray-blue">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="inline-flex items-center gap-1.5 text-sand hover:text-white transition-colors font-medium">
              <UserPlus className="w-4 h-4" />
              Create one
            </Link>
          </p>
        </div>
      </div>

      {/* Role Picker Modal for new Google users */}
      {showRolePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#0d1f35] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => { setShowRolePicker(false); setPendingGoogleToken(null); }}
              className="absolute top-4 right-4 text-gray-blue hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-display font-bold text-white mb-2">Choose Your Role</h2>
            <p className="text-gray-blue text-sm mb-5">How will you use EstateFlow?</p>

            {submitError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
                <p className="text-red-400 text-sm">{submitError}</p>
              </div>
            )}

            <div className="space-y-2 mb-6">
              {PUBLIC_SIGNUP_ROLES.map((role) => (
                <label
                  key={role}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                    selectedRole === role
                      ? 'border-sand/50 bg-sand/10 text-white'
                      : 'border-white/10 bg-white/[0.03] text-gray-blue hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  <input
                    type="radio"
                    name="google-role"
                    value={role}
                    checked={selectedRole === role}
                    onChange={() => setSelectedRole(role)}
                    className="accent-sand w-4 h-4"
                  />
                  <span className="font-medium">{ROLE_LABELS[role]}</span>
                </label>
              ))}
            </div>

            <button
              type="button"
              disabled={isGoogleLoading}
              onClick={() => void handleGoogleRoleSubmit()}
              className="w-full py-3 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm uppercase tracking-wider"
            >
              {isGoogleLoading ? (
                <div className="w-5 h-5 border-2 border-navy border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Continue<ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
