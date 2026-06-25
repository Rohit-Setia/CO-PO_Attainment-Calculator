import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signUpTeacher } from '../Api/authApi';
import AuthLayout from '../components/auth/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Lock, Loader2 } from 'lucide-react';

const initialState = { name: '', email: '', password: '', confirmPassword: '' };

const SignupPage = () => {
  const [formData, setFormData] = useState(initialState);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
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
      const response = await signUpTeacher({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });

      const { token, user } = response.data.data;
      login(token, user);
      navigate('/dashboard', { replace: true });
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

  return (
    <AuthLayout title="Register Account" subtitle="Register a new faculty profile.">
      <form onSubmit={onSubmit} className="space-y-4 text-left">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-bold text-slate-400 uppercase">
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-500" />
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={onChange}
              required
              placeholder="e.g. Prof. Alan Turing"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all font-semibold"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-bold text-slate-400 uppercase">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-500" />
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={onChange}
              required
              placeholder="e.g. teacher@university.edu"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all font-semibold"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-bold text-slate-400 uppercase">
            Syllabus Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-500" />
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={onChange}
              required
              placeholder="••••••••"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all font-semibold"
            />
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-xs font-bold text-slate-400 uppercase">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-500" />
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={onChange}
              required
              placeholder="••••••••"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-all font-semibold"
            />
          </div>
        </div>

        {error ? (
          <div className="bg-red-950/40 text-red-400 border border-red-900 px-3 py-2 rounded-xl text-xs font-semibold">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 py-3 text-sm font-extrabold text-white transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Creating Account...</span>
            </>
          ) : (
            <span>Sign Up</span>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500 font-medium">
        Already registered?{' '}
        <Link className="font-extrabold text-blue-500 hover:underline" to="/login">
          Login here
        </Link>
      </p>
    </AuthLayout>
  );
};

export default SignupPage;
