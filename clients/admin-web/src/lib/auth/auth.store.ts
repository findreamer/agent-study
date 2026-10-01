import { create } from 'zustand';
import type { ProfileResponse } from '@agent-study/contracts';
import { registerAuthHooks, registerClearStore } from '../api/client';

interface AuthData {
  accessToken: string | null;
  user: ProfileResponse['user'] | null;
  currentSystemCode: string | null;
  systems: ProfileResponse['systems'];
  menus: ProfileResponse['menus'];
  permissions: string[];
  bootstrapped: boolean;
}

interface AuthActions {
  setSession: (session: { accessToken: string; profile: ProfileResponse }) => void;
  setProfile: (profile: ProfileResponse) => void;
  setBootstrapped: (bootstrapped: boolean) => void;
  clear: () => void;
}

export type AuthState = AuthData & AuthActions;

const createInitialData = (): AuthData => ({
  accessToken: null,
  user: null,
  currentSystemCode: null,
  systems: [],
  menus: [],
  permissions: [],
  bootstrapped: false,
});

const profileFields = (profile: ProfileResponse) => ({
  user: profile.user,
  currentSystemCode: profile.currentSystemCode,
  systems: profile.systems,
  menus: profile.menus,
  permissions: profile.permissions,
});

export const useAuthStore = create<AuthState>()((set) => ({
  ...createInitialData(),
  setSession: ({ accessToken, profile }) =>
    set({ accessToken, ...profileFields(profile) }),
  setProfile: (profile) => set(profileFields(profile)),
  setBootstrapped: (bootstrapped) => set({ bootstrapped }),
  clear: () => set(createInitialData()),
}));

// Bridge client ↔ store: the client reads the token lazily so it never imports
// the store (which would be circular), and the store pushes token/session
// changes back through these hooks. Registration happens at import time.
registerAuthHooks({
  get accessToken() {
    return useAuthStore.getState().accessToken;
  },
  applyRefreshedToken: (token) => useAuthStore.setState({ accessToken: token }),
});
registerClearStore(() => useAuthStore.getState().clear());
