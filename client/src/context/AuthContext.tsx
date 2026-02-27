/**
 * AuthContext — Manages authentication state across the app.
 *
 * Persists JWT + user info to localStorage.
 * Provides login/logout helpers to child components.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { setAuthToken } from '../api/client';
import {
  loginWithTelegram,
  type TelegramUser,
  type AuthResponse,
} from '../api/auth';

// ── Types ───────────────────────────────────────────────────

export interface AuthUser {
  userId: string;
  telegramId: number;
  username: string;
  firstName: string;
  lastName?: string;
  isNewUser: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (telegramUser: TelegramUser, inviteCode?: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

// ── Storage keys ────────────────────────────────────────────

const STORAGE_TOKEN = 'bchat_token';
const STORAGE_USER = 'bchat_user';

// ── Context ─────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
    error: null,
  });

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(STORAGE_TOKEN);
      const storedUser = localStorage.getItem(STORAGE_USER);

      if (storedToken && storedUser) {
        setAuthToken(storedToken);
        setState({
          user: JSON.parse(storedUser),
          token: storedToken,
          loading: false,
          error: null,
        });
        return;
      }
    } catch {
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem(STORAGE_USER);
    }

    setState((s) => ({ ...s, loading: false }));
  }, []);

  const login = useCallback(
    async (telegramUser: TelegramUser, inviteCode?: string) => {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const res: AuthResponse = await loginWithTelegram(telegramUser, inviteCode);

        const user: AuthUser = {
          userId: res.userId,
          telegramId: telegramUser.id,
          username: telegramUser.username || telegramUser.first_name,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          isNewUser: res.isNewUser,
        };

        // Persist
        setAuthToken(res.token);
        localStorage.setItem(STORAGE_TOKEN, res.token);
        localStorage.setItem(STORAGE_USER, JSON.stringify(user));

        setState({
          user,
          token: res.token,
          loading: false,
          error: null,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Login failed';
        setState((s) => ({
          ...s,
          loading: false,
          error: message,
        }));
      }
    },
    [],
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
    setState({ user: null, token: null, loading: false, error: null });
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}
