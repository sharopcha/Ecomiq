import { create } from 'zustand';
import type { CustomerProfileDto } from '@temp-nx/api-types/crm';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

export type UserProfile = CustomerProfileDto;

interface SessionState {
  status: SessionStatus;
  profile: UserProfile | null;
  setSession: (profile: UserProfile | null) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  profile: null,
  setSession: (profile) => 
    set({ status: profile ? 'authenticated' : 'anonymous', profile }),
  clearSession: () => 
    set({ status: 'anonymous', profile: null }),
}));
