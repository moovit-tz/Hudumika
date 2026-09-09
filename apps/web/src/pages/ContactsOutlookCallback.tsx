import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { Spinner } from '../components/ui/spinner.js';

const STATE_KEY = 'hudumika_outlook_contacts_oauth_state';

/**
 * Lands here after the user approves (or denies) access on Microsoft's
 * consent screen — this is the redirect_uri registered in the Azure AD app
 * (see contacts-sync.routes.ts's MICROSOFT_REDIRECT_URI). Mirrors
 * ContactsGoogleCallback.tsx exactly, one provider swapped for the other.
 */
export const ContactsOutlookCallback: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState('Connecting your Outlook account…');

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const expectedState = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);

    if (error) {
      setStatus('error');
      setMessage(error === 'access_denied' ? 'You cancelled Outlook sign-in.' : `Microsoft returned an error: ${error}`);
      return;
    }
    if (!code) {
      setStatus('error');
      setMessage('No authorization code was returned by Microsoft.');
      return;
    }
    if (!expectedState || state !== expectedState) {
      setStatus('error');
      setMessage('This sign-in link looks like it was already used or has expired — please try connecting again.');
      return;
    }

    apiFetch('/v1/contacts/outlook/callback', { method: 'POST', body: JSON.stringify({ code }) })
      .then((res: any) => {
        navigate(`/contacts?outlookConnected=1&synced=${res.synced ?? 0}`, { replace: true });
      })
      .catch((err: any) => {
        setStatus('error');
        setMessage(err.message || 'Failed to connect your Outlook account.');
      });
  }, [params, navigate]);

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
      {status === 'working' ? (
        <>
          <Spinner size={36} thickness={3} />
          <div style={{ fontSize: 13.5, color: 'var(--ink2)' }}>{message}</div>
        </>
      ) : (
        <>
          <Icon name="alertCircle" size={32} color="var(--red)" />
          <div style={{ fontSize: 13.5, color: 'var(--ink)', maxWidth: 380, textAlign: 'center' }}>{message}</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/contacts')}>Back to Contacts</button>
        </>
      )}
    </div>
  );
};
