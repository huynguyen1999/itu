import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api, AuthSession } from '../api/client';
import { safeLocalStorage } from '../browser/safeStorage';

interface AuthContextValue {
  user: AuthSession['user'] | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login(identifierOrEmail: string, password: string): Promise<void>;
  register(
    data: { email?: string; username?: string; password: string; displayName?: string } | string,
    password?: string,
    displayName?: string,
  ): Promise<void>;
  completeGoogleLogin(code: string): Promise<{ registerToken?: string }>;
  registerWithGoogle(registerToken: string, termsAgreed: boolean): Promise<void>;
  updateProfile(data: { displayName?: string | null; username?: string | null }): Promise<void>;
  deleteAccount(password?: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthSession['user'] | null>(() => {
    const saved = safeLocalStorage.getItem('user');
    if (!saved) return null;

    try {
      return JSON.parse(saved) as AuthSession['user'];
    } catch {
      safeLocalStorage.removeItem('user');
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(() => Boolean(safeLocalStorage.getItem('user')));

  useEffect(() => {
    if (!safeLocalStorage.getItem('user')) return;

    let active = true;

    api
      .refresh()
      .then((session) => {
        if (!active) return;
        saveSession(session);
        setUser(session.user);
      })
      .catch(() => {
        if (!active) return;
        clearSession();
        setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      async login(identifierOrEmail, password) {
        const session = await api.login(identifierOrEmail, password);
        saveSession(session);
        setUser(session.user);
        setIsLoading(false);
      },
      async register(data, password, displayName) {
        const session = await api.register(data as any, password, displayName);
        saveSession(session);
        setUser(session.user);
        setIsLoading(false);
      },
      async completeGoogleLogin(code) {
        try {
          const session = await api.oauthExchange(code);
          if ('registerToken' in session) {
            return { registerToken: session.registerToken };
          }
          saveSession(session);
          setUser(session.user);
          setIsLoading(false);
          return {};
        } catch (error) {
          api.setToken(null);
          safeLocalStorage.removeItem('user');
          setUser(null);
          throw error;
        }
      },
      async registerWithGoogle(registerToken, termsAgreed) {
        const session = await api.googleRegister(registerToken, termsAgreed);
        saveSession(session);
        setUser(session.user);
        setIsLoading(false);
      },
      async updateProfile(data) {
        const session = await api.updateProfile(data);
        saveSession(session);
        setUser(session.user);
      },
      async deleteAccount(password) {
        await api.deleteAccount(password);
        clearSession();
        setUser(null);
        setIsLoading(false);
      },
      logout() {
        void api.logout().catch(() => undefined);
        clearSession();
        setUser(null);
        setIsLoading(false);
      },
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function saveSession(session: AuthSession): void {
  clearLegacyTokens();
  api.setToken(session.accessToken);
  safeLocalStorage.setItem('user', JSON.stringify(session.user));
}

function clearSession(): void {
  clearLegacyTokens();
  api.setToken(null);
  safeLocalStorage.removeItem('user');
}

function clearLegacyTokens(): void {
  safeLocalStorage.removeItem('accessToken');
  safeLocalStorage.removeItem('refreshToken');
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
