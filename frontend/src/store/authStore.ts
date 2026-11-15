import { create } from 'zustand';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface AuthState {
  isAuthenticated: boolean;
  isChecking: boolean;
  isLoggingOut: boolean;
  isLoggingIn: boolean;
  error: string | null;
  loginError: string | null;
  hasClientSecret: boolean;
  activeJobs: number;
  totalUploaded: number;
  checkAuth: (showLoader?: boolean) => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isChecking: true,
  isLoggingOut: false,
  isLoggingIn: false,
  error: null,
  loginError: null,
  hasClientSecret: true,
  activeJobs: 0,
  totalUploaded: 0,

  checkAuth: async (showLoader = true) => {
    // Never set isChecking=true on background polls — that causes the splash blink
    if (showLoader) set({ isChecking: true, error: null });
    try {
      const res = await fetch(`${API}/status`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      set({
        isAuthenticated:  data.authenticated === true,
        hasClientSecret:  data.has_client_secret ?? true,
        activeJobs:       data.active_jobs ?? 0,
        totalUploaded:    data.total_uploaded ?? 0,
        isChecking:       false,
        error:            null,
      });
    } catch (err: unknown) {
      // On background polls, don't wipe isAuthenticated if we were already logged in
      // — a momentary network hiccup shouldn't log the user out
      const isBackground = !showLoader;
      if (isBackground && get().isAuthenticated) {
        // silent fail: just mark not-checking, keep auth state
        set({ isChecking: false });
      } else {
        set({
          isAuthenticated: false,
          isChecking:      false,
          error:           err instanceof Error ? err.message : 'Cannot reach server',
        });
      }
    }
  },

  login: () => {
    set({ isLoggingIn: true, loginError: null });

    const w = 500, h = 660;
    const left = Math.round(window.screenX + (window.outerWidth  - w) / 2);
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);

    const popup = window.open(
      `${API}/auth/login`,
      'yt-oauth',
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
    );

    if (!popup) {
      set({ isLoggingIn: false, loginError: 'Popup blocked — please allow popups for this page and try again.' });
      return;
    }

    let finished = false;

    const finish = (success: boolean, errMsg?: string) => {
      if (finished) return;
      finished = true;
      clearInterval(pollTimer);
      window.removeEventListener('message', onMessage);
      if (success) {
        // checkAuth(false) so no splash screen — just quietly update state
        get().checkAuth(false).then(() => set({ isLoggingIn: false }));
      } else {
        set({ isLoggingIn: false, loginError: errMsg ?? 'Login cancelled' });
      }
    };

    const onMessage = (event: MessageEvent) => {
      // Only trust messages from our own backend origin
      if (!event.origin.startsWith('http://localhost')) return;
      if (event.data?.type === 'AUTH_SUCCESS') finish(true);
      else if (event.data?.type === 'AUTH_ERROR')  finish(false, event.data.message);
    };
    window.addEventListener('message', onMessage);

    // Fallback: detect popup closed without postMessage (user closed it manually)
    const pollTimer = setInterval(() => {
      if (popup.closed) finish(false, undefined); // undefined = "cancelled", no error shown
    }, 600);
  },

  logout: async () => {
    set({ isLoggingOut: true });
    try { await fetch(`${API}/auth/logout`, { method: 'DELETE' }); } catch { /* ignore */ }
    set({ isLoggingOut: false, isAuthenticated: false, error: null, activeJobs: 0, totalUploaded: 0 });
  },
}));

export const API_BASE = API;