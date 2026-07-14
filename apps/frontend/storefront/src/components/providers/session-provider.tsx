'use client';

import { useEffect } from 'react';
import { useSessionStore } from '@/lib/session';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { setSession, status } = useSessionStore();

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const profile = await res.json();
          setSession(profile);
        } else {
          setSession(null);
        }
      } catch (error) {
        console.error('Failed to fetch session', error);
        setSession(null);
      }
    }

    if (status === 'loading') {
      fetchSession();
    }
  }, [setSession, status]);

  return <>{children}</>;
}
