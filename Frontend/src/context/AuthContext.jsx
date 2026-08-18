import { createContext, useContext, useMemo, useState } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('teacher_token'));
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('teacher_user');
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const login = (authToken, authUser) => {
    // Only store safe, non-sensitive fields
    const safeUser = {
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      role: authUser.role,
    };
    localStorage.setItem('teacher_token', authToken);
    localStorage.setItem('teacher_user', JSON.stringify(safeUser));
    setToken(authToken);
    setUser(safeUser);
  };

  const logout = () => {
    localStorage.removeItem('teacher_token');
    localStorage.removeItem('teacher_user');
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      // Helper: check if the current user has one of the given roles
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
      login,
      logout,
      setUser,
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
