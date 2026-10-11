import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  clearSession,
  getFullName,
  getRole,
  getToken,
  setFullName,
  setRole,
  setToken,
} from '@/lib/storage';

interface AuthContextValue {
  token: string | null;
  fullName: string | null;
  role: string | null;
  isLoading: boolean;
  signIn: (token: string, fullName: string, role?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [fullName, setFullNameState] = useState<string | null>(null);
  const [role, setRoleState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [t, n, r] = await Promise.all([getToken(), getFullName(), getRole()]);
      setTokenState(t);
      setFullNameState(n);
      setRoleState(r);
      setIsLoading(false);
    })();
  }, []);

  const signIn = useCallback(async (newToken: string, name: string, userRole: string = 'GATEMAN') => {
    await Promise.all([setToken(newToken), setFullName(name), setRole(userRole)]);
    setTokenState(newToken);
    setFullNameState(name);
    setRoleState(userRole);
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setTokenState(null);
    setFullNameState(null);
    setRoleState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, fullName, role, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
