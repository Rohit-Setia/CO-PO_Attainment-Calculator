import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { signUpTeacher } from '../Api/authApi';
import AuthLayout from '../components/auth/AuthLayout';

const initialState = { name: '', email: '', password: '', confirmPassword: '' };

const SignupPage = () => {
  const [formData, setFormData] = useState(initialState);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const navigate = useNavigate();

  const onChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Signup never returns a session token — every new account starts inactive
      // and needs Admin approval before it can log in (see authController.registerTeacher).
      await signUpTeacher({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });
      setRegistered(true);
    } catch (apiError) {
      const validationErrors = apiError.response?.data?.errors;
      if (validationErrors?.length) {
        setError(validationErrors.map((err) => err.message).join(' '));
      } else {
        setError(apiError.response?.data?.message || 'Unable to register right now.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <AuthLayout title="Registration Submitted" subtitle="One more step before you can sign in">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <p className="text-sm text-muted-foreground">
            Your account has been created and is now <span className="font-semibold text-foreground">pending Admin approval</span>.
            You&rsquo;ll be able to log in once an administrator activates your account.
          </p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            Back to Login
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create Account" subtitle="Register as a teacher to get started">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-foreground">
            Full Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={onChange}
            required
            autoFocus
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={onChange}
            required
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={formData.password}
            onChange={onChange}
            required
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-foreground">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={onChange}
            required
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
          {loading ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/login">
          Login here
        </Link>
      </p>
    </AuthLayout>
  );
};

export default SignupPage;
