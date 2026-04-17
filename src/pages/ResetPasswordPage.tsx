import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Mail } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import FloatingParticles from '../components/FloatingParticles';
import { resetPassword } from '../lib/auth';

function getUiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error && typeof error === 'object') {
    const maybeObj = error as { message?: unknown; errorMessage?: unknown };
    if (typeof maybeObj.errorMessage === 'string' && maybeObj.errorMessage.trim()) {
      return maybeObj.errorMessage;
    }
    if (typeof maybeObj.message === 'string' && maybeObj.message.trim()) {
      return maybeObj.message;
    }
  }
  return fallback;
}

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('email')?.trim() ?? '';
  });
  const [resetCode, setResetCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const sanitizedCode = useMemo(() => resetCode.replace(/\D/g, '').slice(0, 6), [resetCode]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!/^\d{6}$/.test(sanitizedCode)) {
      setError('Reset code must be a 6-digit number.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password.length > 72) {
      setError('Password must not exceed 72 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const message = await resetPassword(email, sanitizedCode, password);
      setSuccessMessage(message);
      window.setTimeout(() => navigate('/login'), 1600);
    } catch (err) {
      setError(getUiErrorMessage(err, 'Unable to reset password.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center relative overflow-hidden px-4 py-8 page-enter">
      <FloatingParticles count={12} className="absolute inset-0 pointer-events-none overflow-hidden" sizeRange={4} durationMin={8} durationRange={10} />
      <div className="absolute inset-0 bg-gradient-to-br from-navy via-[#0d1f35] to-navy" />

      <div className="w-full max-w-md relative">
        <BrandLogo to="/" className="mb-8 text-white" logoClassName="w-16 h-16" textClassName="text-xl font-display font-bold text-gradient-animate" />

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-sm shadow-2xl">
          <h1 className="text-2xl font-display font-bold text-white mb-2">Reset your password</h1>
          <p className="text-gray-blue text-sm mb-6">Choose a strong new password for your account.</p>

          {successMessage ? (
            <div className="bg-emerald-500/10 border border-emerald-400/25 rounded-xl px-4 py-3">
              <p className="text-emerald-300 text-sm flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{successMessage}</span>
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label className="block text-sm text-gray-blue mb-2 font-medium">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-blue mb-2 font-medium">6-Digit Reset Code</label>
                <div className="relative group">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={sanitizedCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="123456"
                    className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all tracking-[0.25em]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-blue mb-2 font-medium">New Password</label>
                <div className="relative group">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full pl-12 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-blue hover:text-sand transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-blue mb-2 font-medium">Confirm Password</label>
                <div className="relative group">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-blue group-focus-within:text-sand transition-colors" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full pl-12 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-blue hover:text-sand transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 text-sm uppercase tracking-wider hover:shadow-lg hover:shadow-sand/25 active:scale-[0.98] transition-all duration-300"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-navy border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}
        </div>

        <Link to="/login" className="mt-6 inline-flex items-center gap-2 text-gray-blue hover:text-white transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>
      </div>
    </div>
  );
}
