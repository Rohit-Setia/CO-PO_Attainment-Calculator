import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { forgotPassword } from '../Api/authApi';
import AuthLayout from '../components/auth/AuthLayout';

// Forgot Password — available to Administrator (Admin) and HOD (Moderator) accounts.
// The server decides eligibility from the account's real role; teachers and every
// other role receive the same generic message and no email.
const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await forgotPassword(email.trim());
      // Always show the same confirmation — never reveal whether the account exists
      // or is eligible (prevents account enumeration).
      setSubmitted(true);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to process the request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Forgot Password?" subtitle="Reset link for Administrator and HOD accounts">
      {submitted ? (
        <div className="space-y-4">
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            If that email belongs to an authorized Administrator or HOD account, a password reset link has been sent.
            Please check your inbox.
          </p>
          <p className="text-xs text-muted-foreground">
            The link expires after a short time and can be used only once. If you did not request a reset, you can safely ignore the email.
          </p>
          <Link
            to="/login"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
              Registered Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-70"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            <Link className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline" to="/login">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
