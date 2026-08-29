'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShieldLogo } from '@/components/OneUI';
import { Loader2, ShieldAlert, Check } from 'lucide-react';
import { scopeInfo } from '@/lib/scopes';
import { CLIENT_LOGOS } from '@/lib/clientLogos';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7020/v1';

function AuthorizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // OIDC query parameters
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const scope = searchParams.get('scope') || 'openid profile';
  const state = searchParams.get('state') || '';
  const codeChallenge = searchParams.get('code_challenge') || '';
  const codeChallengeMethod = searchParams.get('code_challenge_method') || 'S256';

  const scopes = scope.split(' ');

  // client_name/isFirstParty from the URL is just a display fallback until the
  // authoritative context loads from GET /oauth/authorize below — a caller
  // can put anything in that query param, so it's never trusted for the
  // auto-approve decision, only for the first paint.
  const fallbackClientName = searchParams.get('client_name') || 'External Application';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<{ id: string; name: string; trustScore?: number; trustTier?: string } | null>(null);
  const [clientCtx, setClientCtx] = useState<{
    clientName: string;
    clientLogoUrl: string | null;
    isFirstParty: boolean;
  } | null>(null);
  const [autoApproving, setAutoApproving] = useState(false);

  const clientName = clientCtx?.clientName || fallbackClientName;
  const clientLogo = clientCtx?.clientLogoUrl || CLIENT_LOGOS[clientName.toLowerCase()];

  // Redirect guard and user hydration
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const storedUserRaw = localStorage.getItem('user');

    if (!token || !storedUserRaw) {
      // Not logged in -> Redirect to login page and pass return URL
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      return;
    }

    try {
      const parsed = JSON.parse(storedUserRaw);
      // Fetch fresh profile details from /v1/auth/me to show updated name & trust score
      fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        const name = [data.firstName, data.lastName].filter(Boolean).join(' ').trim()
          || (data.phoneNumber ? `+${data.phoneNumber}` : 'Ondi User');
        setUser({
          id: data.id,
          name,
          trustScore: data.trustScore ?? 0,
          trustTier: data.trustTier ?? 'LOW'
        });
      })
      .catch(() => {
        // Fallback to local storage if API call fails
        setUser({
          id: parsed.id,
          name: parsed.name || parsed.phone || 'Ondi User',
          trustScore: 0,
          trustTier: 'LOW'
        });
      });
    } catch (e) {
      router.push('/login');
    }
  }, [router]);

  // Once we know who's signed in, ask Ondi for the real client record —
  // this is the authoritative source for isFirstParty (Hudumika-family apps
  // like ClearOS, SEAL, Bliss, Workspace, ComplyOS, FinOps, HuduFreight are
  // all registered first-party). First-party apps skip the consent screen
  // entirely and go straight to issuing a code, same as "Sign in with
  // Google" auto-signs you back into a Google-owned app.
  useEffect(() => {
    if (!user || !clientId || !redirectUri) return;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    });

    fetch(`${API_URL}/oauth/authorize?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const ctx = data?.context;
        if (!ctx) return;
        setClientCtx({
          clientName: ctx.clientName,
          clientLogoUrl: ctx.clientLogoUrl ?? null,
          isFirstParty: !!ctx.isFirstParty,
        });
        if (ctx.isFirstParty) {
          setAutoApproving(true);
          issueCode(user.id);
        }
      })
      .catch(() => {
        // Context lookup failed (e.g. client not found) — fall back to the
        // normal manual-consent screen below rather than blocking sign-in.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, clientId, redirectUri]);

  // Exchanges the current session for an auth code and redirects back to the
  // requesting app. Shared by the auto-approve (first-party) path and the
  // manual "Allow access" button (third-party) path.
  async function issueCode(userId: string) {
    if (!clientId || !redirectUri) return;

    setLoading(true);
    setError('');

    try {
      const codeRes = await fetch(`${API_URL}/oauth/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          clientId,
          scope,
          codeChallenge
        })
      });

      if (!codeRes.ok) {
        const errData = await codeRes.json();
        throw new Error(errData.error || 'Failed to generate authorization code');
      }

      const { code } = await codeRes.json();
      setLoading(false);

      // Redirect back to Service Provider
      const destUrl = new URL(redirectUri);
      destUrl.searchParams.set('code', code);
      if (state) destUrl.searchParams.set('state', state);

      window.location.href = destUrl.toString();
    } catch (err: any) {
      setLoading(false);
      setAutoApproving(false);
      setError(err.message || 'Authorization failed. Please try again.');
    }
  }

  // Click Allow Access (third-party apps only — first-party apps never
  // render this button, see autoApproving below)
  async function handleAllow() {
    if (!user || !clientId || !redirectUri) return;

    setLoading(true);
    setError('');

    try {
      // Record consent, then issue the code.
      const consentRes = await fetch(`${API_URL}/oauth/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          clientId: clientId,
          scopes: scopes
        })
      });

      if (!consentRes.ok) throw new Error('Failed to record user consent');
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Authorization failed. Please try again.');
      return;
    }

    await issueCode(user.id);
  }

  // Click Cancel Access
  function handleCancel() {
    if (!redirectUri) {
      router.push('/dashboard/personal');
      return;
    }
    const destUrl = new URL(redirectUri);
    destUrl.searchParams.set('error', 'access_denied');
    if (state) destUrl.searchParams.set('state', state);

    window.location.href = destUrl.toString();
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center text-sm text-slate-400">
        Verifying session…
      </div>
    );
  }

  // First-party Hudumika app + no consent UI needed — this is the
  // "auto-login when already signed into Ondi" path. We still show a brief
  // branded transition (never a blank screen) while the code exchange and
  // redirect happen, and fall through to the error card below if it fails.
  if (autoApproving && !error) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] text-[#001633] flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white text-xl font-semibold text-[#001633] shadow-sm">
            {clientLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clientLogo} alt="" className="h-full w-full object-contain p-2" />
            ) : (
              clientName[0]
            )}
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-[#4253D1]" />
          <p className="text-sm font-medium text-slate-500">
            Signing you into <span className="font-semibold text-[#001633]">{clientName}</span>…
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#001633] flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
      >
        {error && (
          <div className="flex gap-3 rounded-md border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
            <ShieldAlert size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── App relationship ── */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-xl font-semibold text-[#001633]">
            {clientLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clientLogo} alt="" className="h-full w-full object-contain p-2" />
            ) : (
              clientName[0]
            )}
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4253D1] text-white">
            <ShieldLogo size={16} />
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-[#001633] text-white">
            <ShieldLogo size={24} />
          </div>
        </div>

        {/* ── Heading ── */}
        <div className="text-center">
          <h1 className="text-xl font-semibold leading-snug text-[#001633]">
            Authorize <span className="text-[#4253D1]">{clientName}</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            This application is requesting access to your Ondi verified identity.
          </p>
        </div>

        {/* ── Scopes ── */}
        <div className="space-y-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Requested permissions</p>
          <div className="space-y-2">
            {scopes.map(s => {
              const info = scopeInfo(s);
              const Icon = info.icon;
              return (
                <div key={s} className="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50 p-3.5">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#4253D1]/10 text-[#4253D1]">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#001633]">{info.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{info.desc}</p>
                  </div>
                  <Check size={14} className="mt-1 shrink-0 text-[#10B981]" />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── User context ── */}
        <div className="flex items-center justify-between rounded-md border border-[#4253D1]/10 bg-[#ECEEFF] p-3.5">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[#4253D1]">Signed in as</span>
            <span className="text-sm font-semibold text-[#001633]">{user.name}</span>
          </div>
          <span className="rounded-full border border-[#4253D1]/10 bg-white px-3 py-1 text-xs font-medium text-[#4253D1]">
            {user.trustScore} · {user.trustTier} trust
          </span>
        </div>

        {/* ── Actions ── */}
        <div className="flex flex-col gap-2.5 pt-1">
          <button
            onClick={handleAllow}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#001633] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4253D1] disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Allow access'}
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="w-full rounded-md py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#001633] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>

        {/* ── Footer ── */}
        <p className="mx-auto max-w-[320px] text-center text-xs text-slate-400">
          By allowing access, you agree to share the selected data with this app according to Ondi&apos;s{' '}
          <a href="#" className="font-medium text-[#4253D1] hover:underline">Privacy Policy</a>.
        </p>
      </motion.div>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center text-sm text-slate-400">
        Loading authorization request…
      </div>
    }>
      <AuthorizeContent />
    </Suspense>
  );
}
