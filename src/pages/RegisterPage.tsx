import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Phone, ArrowRight, Home, CheckCircle, Sparkles, LogIn, ArrowLeft } from 'lucide-react';
import { registerUser } from '../lib/auth';
import { PUBLIC_SIGNUP_ROLES, ROLE_LABELS, type UserRole } from '../lib/rbac';
import gsap from 'gsap';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: 'agent' as UserRole,
    agreeTerms: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.reg-image-text', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.3, ease: 'power2.out' });
      gsap.fromTo('.reg-form-header', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6, delay: 0.2, ease: 'power2.out' });
      gsap.fromTo('.reg-form-field', { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.08, delay: 0.3, ease: 'power2.out' });
      gsap.fromTo('.reg-form-btn', { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, delay: 0.7, ease: 'back.out(1.5)' });
    });
    return () => ctx.revert();
  }, [step]);

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    
    if (!formData.phone) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\+?[0-9]{10,12}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Please enter a valid Philippine mobile number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, and number';
    }
    
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    if (!formData.agreeTerms) {
      newErrors.agreeTerms = 'You must agree to the terms';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep2()) return;
    
    setSubmitError('');
    setIsLoading(true);

    try {
      await registerUser({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        role: formData.role,
      });

      setIsLoading(false);
      navigate('/dashboard');
    } catch (error) {
      setIsLoading(false);
      setSubmitError(error instanceof Error ? error.message : 'Unable to create account');
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

      {/* Left Side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img 
          src="/images/property2.jpg" 
          alt="Luxury home"
          className="absolute inset-0 w-full h-full object-cover scale-105 transition-transform duration-[3000ms] hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy/90 via-navy/50 to-navy/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-transparent" />
        
        <div className="absolute bottom-20 left-20 w-[300px] h-[300px] rounded-full bg-sand/10 blur-[100px] pointer-events-none animate-float-slow" />

        <div className="relative z-10 flex flex-col justify-between p-12">
          <Link to="/" className="flex items-center gap-3 text-white group">
            <div className="w-10 h-10 bg-sand/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10 group-hover:bg-sand/30 transition-colors">
              <Home className="w-5 h-5" />
            </div>
            <span className="text-xl font-display font-bold text-gradient-animate">ESTATEFLOW</span>
          </Link>
          <div className="reg-image-text">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 mb-6">
              <Sparkles className="w-3.5 h-3.5 text-sand" />
              <span className="text-xs text-white/80 font-medium">Free to join &bull; No credit card required</span>
            </div>
            <h2 className="text-4xl font-display font-bold text-white mb-4 leading-tight">
              Start Your Property<br />Journey Today
            </h2>
            <p className="text-gray-blue text-lg">
              Create an account to save favorites, get alerts, and connect with agents.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-navy via-[#0d1f35] to-navy" />
        
        <div className="w-full max-w-md relative">
          {/* Mobile Logo */}
          <Link to="/" className="lg:hidden flex items-center gap-3 text-white mb-8">
            <div className="w-10 h-10 bg-sand/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10">
              <Home className="w-5 h-5" />
            </div>
            <span className="text-xl font-display font-bold text-gradient-animate">ESTATEFLOW</span>
          </Link>

          <div className="reg-form-header text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-5 bg-gradient-to-br from-sand/20 to-sand/5 rounded-2xl flex items-center justify-center border border-white/10 animate-float-slow">
              <User className="w-7 h-7 text-sand" />
            </div>
            <h1 className="text-3xl font-display font-bold text-white mb-3">
              Create Account
            </h1>
            <p className="text-gray-blue text-sm">
              Step {step} of 2 — {step === 1 ? 'Personal Information' : 'Set Password'}
            </p>
          </div>

          {/* Enhanced Progress Bar */}
          <div className="flex gap-3 mb-8">
            <div className="flex-1 relative">
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${step >= 1 ? 'w-full bg-gradient-to-r from-sand to-[#c99660]' : 'w-0'}`} />
              </div>
              <span className="absolute -bottom-5 left-0 text-[10px] text-gray-blue">Personal Info</span>
            </div>
            <div className="flex-1 relative">
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${step >= 2 ? 'w-full bg-gradient-to-r from-sand to-[#c99660]' : 'w-0'}`} />
              </div>
              <span className="absolute -bottom-5 right-0 text-[10px] text-gray-blue">Password</span>
            </div>
          </div>

          <div className="mt-4" />

          {step === 1 ? (
            <div className="space-y-5">
              {/* Name Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="reg-form-field">
                  <label className="block text-sm text-gray-blue mb-2 font-medium">First Name</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                    <input 
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      placeholder="Juan"
                      className={`w-full pl-12 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all ${
                        errors.firstName ? 'border-red-500' : 'border-white/10'
                      }`}
                    />
                  </div>
                  {errors.firstName && (
                    <p className="text-red-400 text-sm mt-1">{errors.firstName}</p>
                  )}
                </div>
                <div className="reg-form-field">
                  <label className="block text-sm text-gray-blue mb-2 font-medium">Last Name</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                    <input 
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                      placeholder="Dela Cruz"
                      className={`w-full pl-12 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all ${
                        errors.lastName ? 'border-red-500' : 'border-white/10'
                      }`}
                    />
                  </div>
                  {errors.lastName && (
                    <p className="text-red-400 text-sm mt-1">{errors.lastName}</p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div className="reg-form-field">
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
                  <p className="text-red-400 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              {/* Phone */}
              <div className="reg-form-field">
                <label className="block text-sm text-gray-blue mb-2 font-medium">Mobile Number</label>
                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                  <input 
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="+63 917 123 4567"
                    className={`w-full pl-12 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all ${
                      errors.phone ? 'border-red-500' : 'border-white/10'
                    }`}
                  />
                </div>
                {errors.phone && (
                  <p className="text-red-400 text-sm mt-1">{errors.phone}</p>
                )}
              </div>

              {/* Role */}
              <div className="reg-form-field">
                <label className="block text-sm text-gray-blue mb-2 font-medium">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 transition-all"
                >
                  {PUBLIC_SIGNUP_ROLES.map((role) => (
                    <option key={role} value={role} className="bg-navy">
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Next Button */}
              <button 
                onClick={handleNext}
                className="reg-form-btn w-full btn-magnetic py-3.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl flex items-center justify-center gap-2 text-sm uppercase tracking-wider hover:shadow-lg hover:shadow-sand/25 active:scale-[0.98] transition-all duration-300"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Password */}
              <div className="reg-form-field">
                <label className="block text-sm text-gray-blue mb-2 font-medium">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="Create a strong password"
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
                  <p className="text-red-400 text-sm mt-1">{errors.password}</p>
                )}
                
                {/* Password Requirements — Enhanced */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { label: '8+ characters', valid: formData.password.length >= 8 },
                    { label: 'Uppercase', valid: /[A-Z]/.test(formData.password) },
                    { label: 'Lowercase', valid: /[a-z]/.test(formData.password) },
                    { label: 'Number', valid: /\d/.test(formData.password) },
                  ].map((req, i) => (
                    <div key={i} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all ${req.valid ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/[0.03] border border-white/[0.06]'}`}>
                      <CheckCircle className={`w-3.5 h-3.5 shrink-0 ${req.valid ? 'text-green-400' : 'text-gray-600'}`} />
                      <span className={req.valid ? 'text-green-400' : 'text-gray-500'}>{req.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Confirm Password */}
              <div className="reg-form-field">
                <label className="block text-sm text-gray-blue mb-2 font-medium">Confirm Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                  <input 
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    placeholder="Confirm your password"
                    className={`w-full pl-12 pr-12 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all ${
                      errors.confirmPassword ? 'border-red-500' : 'border-white/10'
                    }`}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-blue hover:text-sand transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-red-400 text-sm mt-1">{errors.confirmPassword}</p>
                )}
              </div>

              {/* Terms */}
              <div className="reg-form-field">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input 
                    type="checkbox"
                    checked={formData.agreeTerms}
                    onChange={(e) => setFormData({...formData, agreeTerms: e.target.checked})}
                    className="w-4 h-4 mt-1 accent-sand rounded"
                  />
                  <span className="text-gray-blue text-sm group-hover:text-white/70 transition-colors">
                    I agree to the{' '}
                    <Link to="/terms" className="text-sand hover:text-white transition-colors">Terms of Service</Link>
                    {' '}and{' '}
                    <Link to="/privacy" className="text-sand hover:text-white transition-colors">Privacy Policy</Link>
                  </span>
                </label>
                {errors.agreeTerms && (
                  <p className="text-red-400 text-sm mt-1">{errors.agreeTerms}</p>
                )}
              </div>

              {/* Submit */}
              {submitError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-sm">{submitError}</p>
                </div>
              )}

              <div className="reg-form-btn flex gap-3">
                <button 
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3.5 glass-card rounded-xl text-white hover:bg-white/[0.06] transition-all font-medium inline-flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 btn-magnetic py-3.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm uppercase tracking-wider"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-navy border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Create Account <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Login Link */}
          <p className="mt-8 text-center text-gray-blue">
            Already have an account?{' '}
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sand hover:text-white transition-colors font-medium">
              <LogIn className="w-4 h-4" />
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
