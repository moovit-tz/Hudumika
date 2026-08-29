'use client';

import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth(true);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#4253D1]" />
          <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
            Verifying identity...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
