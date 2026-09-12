import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { KeyRound, Loader2 } from 'lucide-react';
import { confirmPasswordSetup, requestPasswordSetup } from '../Api/adminApi';
import { resetPassword, forgotPassword } from '../Api/authApi';

// Public page opened from an emailed token link.
//   /set-password?token=...                 → teacher first-login password SETUP (unchanged)
//   /set-password?token=...&mode=reset       → HOD / Administrator password RESET
export default function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const isReset = searchParams.get('mode') === 'reset';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [showResend, setShowResend] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error(isReset
        ? 'This password reset link is missing its token. Please use the link from your email.'
        : 'This password-setup link is missing its token. Please use the link from your email.');
      return;
    }
    if (password.length < 6 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      toast.error('Password must be at least 6 characters and contain a letter and a number.');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const res = isReset
        ? await resetPassword(token, password)
        : await confirmPasswordSetup(token, password);
      toast.success(res.data?.message || (isReset ? 'Your password has been reset successfully.' : 'Password set successfully.'));
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not set the password. The link may have expired.');
      setShowResend(true);
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail) return;
    try {
      if (isReset) {
        await forgotPassword(resendEmail);
        toast.success('If that email belongs to an Administrator or HOD account, a new reset link has been sent.');
      } else {
        await requestPasswordSetup(resendEmail);
        toast.success('If that email exists, a new password-setup link has been sent.');
      }
    } catch {
      toast.error('Could not send the reset email. Please try again later.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{isReset ? 'Reset Your Password' : 'Set Your Password'}</h1>
            <p className="text-sm text-muted-foreground">CT University OBE ERP</p>
          </div>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">
              {isReset
                ? 'Your password has been reset successfully. You can now log in with your email and new password.'
                : 'Your password has been set successfully. You can now log in with your email/username and new password.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Go to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!token && (
              <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700">
                No token found in the URL. Please open the exact link from your credential email.
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="At least 6 characters, one letter and one number"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isReset ? 'Reset Password' : 'Set Password'}
            </button>
          </form>
        )}

        {showResend && !done && (
          <form onSubmit={handleResend} className="mt-6 space-y-2 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Link expired? Enter your email to receive a new one.</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="you@ctuniversity.in"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="submit" className="rounded-xl border border-border px-3 py-2 text-xs font-semibold transition hover:bg-secondary">
                Send
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/login" className="font-semibold text-primary hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  );
}