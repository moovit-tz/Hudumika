'use client';

import { use, useState } from 'react';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function VisitorCheckInPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch(`/organizations/${orgId}/visitors/check-in`, {
        method: 'POST',
        body: JSON.stringify({
          visitorName: f.get('visitorName'),
          visitorPhone: f.get('visitorPhone'),
          company: f.get('company') || undefined,
          hostName: f.get('hostName') || undefined,
          purpose: f.get('purpose'),
        }),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message === 'organization_not_found' ? 'This check-in link is no longer valid.' : 'Something went wrong. Please ask reception for help.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#001633] p-6">
        <div className="bg-white rounded-[16px] p-10 max-w-sm w-full text-center shadow-xl">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-[#001633] font-space uppercase mb-2">You&apos;re Checked In</h1>
          <p className="text-sm text-slate-500">Your host has been notified. Please take a seat — someone will be with you shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#001633] p-6">
      <div className="bg-white rounded-[16px] p-8 max-w-sm w-full shadow-xl">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck size={20} className="text-[#4253D1]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#4253D1] font-space">Visitor Check-In</span>
        </div>
        <p className="text-xs text-slate-400 mb-6">Your details are encrypted and automatically deleted after this organization&apos;s retention window — this isn&apos;t a paper logbook other visitors can read.</p>
        <form onSubmit={submit} className="space-y-3">
          <input name="visitorName" placeholder="Full name" required className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm" />
          <input name="visitorPhone" placeholder="Phone number" required className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm" />
          <input name="company" placeholder="Company (optional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm" />
          <input name="hostName" placeholder="Who are you here to see? (optional)" className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm" />
          <input name="purpose" placeholder="Purpose of visit" required className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm" />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button type="submit" disabled={busy} className="w-full py-3 bg-[#4253D1] text-white text-sm font-bold rounded-full hover:bg-[#1A3060] transition-all disabled:opacity-50">
            {busy ? 'Checking in...' : 'Check In'}
          </button>
        </form>
      </div>
    </div>
  );
}
