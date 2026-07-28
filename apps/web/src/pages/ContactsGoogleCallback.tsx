import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';

const STATE_KEY = 'hudumika_google_contacts_oauth_state';

/**
 * Lands here after the user approves (or denies) access on Google's consent
 * screen — this is the redirect_uri registered in the Google Cloud OAuth
 * client (see contacts-sync.routes.ts's GOOGLE_REDIRECT_URI). Exchanges the
 * one-time `code` for real tokens via the backend (which also runs the
 * first sync), then sends the user back to Contacts.
 */
export const ContactsGoogleCallback: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState('Connecting your Google account…');

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const expectedState = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);

    if (error) {
      setStatus('error');
      setMessage(error === 'access_denied' ? 'You cancelled Google sign-in.' : `Google returned an error: ${error}`);
      return;
    }
    if (!code) {
      setStatus('error');
      setMessage('No authorization code was returned by Google.');
      return;
    }
    if (!expectedState || state !== expectedState) {
      setStatus('error');
      setMessage('This sign-in link looks like it was already used or has expired — please try connecting again.');
      return;
    }

    apiFetch('/v1/contacts/google/callback', { method: 'POST', body: JSON.stringify({ code }) })
      .then((res: any) => {
        navigate(`/contacts?googleConnected=1&synced=${res.synced ?? 0}`, { replace: true });
      })
      .catch((err: any) => {
        setStatus('error');
        setMessage(err.message || 'Failed to connect your Google account.');
      });
  }, [params, navigate]);

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
      {status === 'working' ? (
        <>
          <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
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
