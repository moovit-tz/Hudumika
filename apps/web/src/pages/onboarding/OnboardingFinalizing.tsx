import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { PageLoading } from '../../components/ui/spinner.js';
import type { OnboardingCompleteResponse } from '@hudumika/types';
import './Onboarding.css';

// Where a hosted-checkout signup (OnboardingWizard.tsx's POST /checkout)
// lands after Flutterwave redirects the customer back. Nothing was created
// yet at that point — billing-webhooks.routes.ts's charge.completed handler
// finalizes the tenant once it verifies payment, which can land seconds
// after the redirect, so this polls rather than assuming it's done already.
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

export const OnboardingFinalizing: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const txRef = searchParams.get('tx_ref');
  const { completeOnboarding } = useAuth();
  const [state, setState] = useState<'pending' | 'failed' | 'timeout' | 'missing_ref'>('pending');
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!txRef) { setState('missing_ref'); return; }
    let cancelled = false;

    async function poll() {
      try {
        const res = await apiFetch(`/v1/onboarding/checkout-status?tx_ref=${encodeURIComponent(txRef!)}`);
        if (cancelled) return;
        if (res.status === 'completed') {
          completeOnboarding(res as OnboardingCompleteResponse);
          navigate('/welcome');
          return;
        }
        if (res.status === 'failed' || res.status === 'expired') {
          setState('failed');
          return;
        }
        if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
          setState('timeout');
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled && Date.now() - startedAt.current > POLL_TIMEOUT_MS) { setState('timeout'); return; }
        if (!cancelled) setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    poll();
    return () => { cancelled = true; };
  }, [txRef, completeOnboarding, navigate]);

  return (
    <div className="login-page">
      <div className="ob-success">
        {state === 'pending' && (
          <>
            <PageLoading label="Confirming your payment…" />
            <p className="login-subtext">This usually takes a few seconds. Please don't close this page.</p>
          </>
        )}
        {state === 'failed' && (
          <>
            <h1 className="login-headline">Payment didn't go through</h1>
            <p className="login-subtext">Nothing was charged. Please go back and try again.</p>
            <button type="button" className="login-submit-btn" onClick={() => navigate('/signup')} data-ui-native-button="">Back to signup</button>
          </>
        )}
        {state === 'timeout' && (
          <>
            <h1 className="login-headline">Still processing</h1>
            <p className="login-subtext">Your payment is taking longer than expected to confirm. We'll email you once your workspace is ready.</p>
          </>
        )}
        {state === 'missing_ref' && (
          <>
            <h1 className="login-headline">Something went wrong</h1>
            <p className="login-subtext">We couldn't find your checkout session. Please start over.</p>
            <button type="button" className="login-submit-btn" onClick={() => navigate('/signup')} data-ui-native-button="">Back to signup</button>
          </>
        )}
      </div>
    </div>
  );
};
