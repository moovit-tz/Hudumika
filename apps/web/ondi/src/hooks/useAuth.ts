'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export interface OndiUser {
  id: string;
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  trustScore?: number;
  kycStatus?: string;
  profileImage?: string;
}

export function useAuth(redirectIfUnauthenticated = true) {
  const router = useRouter();
  const [user, setUser] = useState<OndiUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      if (redirectIfUnauthenticated) router.replace('/login');
      setLoading(false);
      return;
    }
    try {
      // Try cached user first for instant render
      const cached = localStorage.getItem('user');
      if (cached) setUser(JSON.parse(cached));

      const data = await apiFetch<OndiUser>('/auth/me');
      const merged: OndiUser = {
        id: data.id,
        phone: data.phone,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        name: data.name ?? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim(),
        trustScore: data.trustScore,
        kycStatus: data.kycStatus,
        profileImage: data.profileImage,
      };
      setUser(merged);
      localStorage.setItem('user', JSON.stringify(merged));
    } catch {
      if (redirectIfUnauthenticated) router.replace('/login');
    } finally {
      setLoading(false);
    }
  }, [router, redirectIfUnauthenticated]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return { user, loading, refetch: fetchUser };
}
