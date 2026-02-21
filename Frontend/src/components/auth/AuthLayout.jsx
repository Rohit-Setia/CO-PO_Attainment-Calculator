const AuthLayout = ({ title, subtitle, children }) => (
  <div className="min-h-screen bg-slate-100 px-4 py-10">
    <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-md sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </div>
  </div>
);

export default AuthLayout;
