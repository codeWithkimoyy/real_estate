import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail, Send } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import FloatingParticles from '../components/FloatingParticles';
import { forgotPassword } from '../lib/auth';

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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidEmail) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await forgotPassword(email);
      setSuccessMessage(result.message);
    } catch (err) {
      setError(getUiErrorMessage(err, 'Unable to request password reset.'));
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
          <h1 className="text-2xl font-display font-bold text-white mb-2">Forgot your password?</h1>
          <p className="text-gray-blue text-sm mb-6">Enter your account email and we will send a 6-digit reset code.</p>

          {successMessage ? (
            <div className="space-y-5">
              <div className="bg-emerald-500/10 border border-emerald-400/25 rounded-xl px-4 py-3">
                <p className="text-emerald-300 text-sm flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{successMessage}</span>
                </p>
              </div>

              <Link
                to={`/reset-password?email=${encodeURIComponent(email)}`}
                className="w-full inline-flex items-center justify-center gap-2 py-3 border border-white/15 text-white font-medium rounded-xl text-sm uppercase tracking-wider hover:bg-white/[0.06] transition-all duration-300"
              >
                Enter Reset Code
              </Link>

              <Link
                to="/login"
                className="w-full inline-flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-[#D4A574] to-[#c99660] text-navy font-semibold rounded-xl text-sm uppercase tracking-wider hover:shadow-lg hover:shadow-sand/25 active:scale-[0.98] transition-all duration-300"
              >
                Back to Sign In
              </Link>
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
                    className={`w-full pl-12 pr-4 py-3.5 bg-white/5 border rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-sand/50 focus:ring-1 focus:ring-sand/20 focus:bg-white/[0.07] transition-all ${
                      error ? 'border-red-500' : 'border-white/10'
                    }`}
                  />
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
                  <>
                    Send Reset Code
                    <Send className="w-4 h-4" />
                  </>
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
