import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { useCloud, type StorageProvider } from '../../shells/cloud-context.js';

/**
 * Landing page for a storage-connector OAuth redirect
 * (/cloud/connections/:provider/callback?code=...). Exchanges the code via
 * the API, then bounces back to Drive. Mirrors the Contacts Google/Outlook
 * sync callback pattern.
 */
export function ConnectorOAuthCallback() {
  const { provider } = useParams<{ provider: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { completeConnectorOAuth } = useCloud();
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('Finishing the connection…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get('code');
    const err = params.get('error_description') || params.get('error');
    if (err) { setState('error'); setMessage(err); return; }
    if (!code || !provider) { setState('error'); setMessage('No authorization code was returned.'); return; }
    completeConnectorOAuth(provider as StorageProvider, code)
      .then((r) => {
        setState('done');
        setMessage(`Connected${r.email ? ` as ${r.email}` : ''}. Synced ${r.synced} item${r.synced === 1 ? '' : 's'}.`);
        setTimeout(() => navigate('/cloud', { replace: true }), 1400);
      })
      .catch((e: any) => { setState('error'); setMessage(e?.message || 'Could not finish connecting the account.'); });
  }, [params, provider, completeConnectorOAuth, navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '80px 20px', textAlign: 'center' }}>
      <Icon name={state === 'error' ? 'alertCircle' : state === 'done' ? 'checkCircle' : 'refresh'} size={28}
        color={state === 'error' ? 'var(--red)' : state === 'done' ? 'var(--green)' : 'var(--teal)'} />
      <div style={{ fontSize: 14, color: 'var(--ink)', maxWidth: 420 }}>{message}</div>
      {state === 'error' && (
        <button className="btn btn-sm" onClick={() => navigate('/cloud', { replace: true })}>Back to Drive</button>
      )}
    </div>
  );
}
