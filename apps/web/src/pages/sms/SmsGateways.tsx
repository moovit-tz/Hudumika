import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showConfirm } from '../../lib/confirm.js';
import { showAlert } from '../../lib/alert.js';

interface Gateway {
  id: string;
  provider: string;
  label: string;
  sender_id: string | null;
  priority: number;
  active: boolean;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
}

interface SenderId {
  id: string;
  sender_id: string;
  label: string | null;
  is_default: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  beem: "Beem Africa (Leading East Africa SMS & Mobile Infrastructure)",
  africas_talking: "Africa's Talking (Direct Telco SMPP/REST)",
  twilio: 'Twilio Programmable SMS',
  nexmo: 'Vonage (Nexmo) Global SMS',
  bongolive: 'Beem Africa (Legacy BongoLive API)',
};

const SELECTABLE_PROVIDERS = ['beem', 'africas_talking', 'twilio', 'nexmo'] as const;

const PROVIDER_FIELDS: Record<string, { key: string; label: string; secret?: boolean; placeholder?: string }[]> = {
  beem: [
    { key: 'apiKey', label: 'Beem API Key', placeholder: 'e.g. 7a8b9c... from Beem portal' },
    { key: 'secretKey', label: 'Beem Secret Key', secret: true, placeholder: 'e.g. NTg1OD...' },
  ],
  africas_talking: [
    { key: 'atUser', label: 'Username', placeholder: 'sandbox or live username' },
    { key: 'atKey', label: 'API Key', secret: true, placeholder: 'atsk_...' },
  ],
  twilio: [
    { key: 'twilioSid', label: 'Account SID', placeholder: 'AC...' },
    { key: 'twilioToken', label: 'Auth Token', secret: true, placeholder: 'Twilio secret token' },
  ],
  nexmo: [
    { key: 'apiKey', label: 'API Key', placeholder: 'Vonage API Key' },
    { key: 'apiSecret', label: 'API Secret', secret: true, placeholder: 'Vonage API Secret' },
  ],
  bongolive: [
    { key: 'apiKey', label: 'API Key / Username' },
    { key: 'secretKey', label: 'Secret Key', secret: true },
  ],
};

export function SmsGateways() {
  usePageSEO('SMS Gateways & Intelligent Routing', "Configure Beem Africa, Africa's Talking, Twilio and global SMS carriers with automatic failover.");
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState('beem');
  const [label, setLabel] = useState('');
  const [senderId, setSenderId] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});

  // Testing modal state
  const [testModalGateway, setTestModalGateway] = useState<Gateway | null>(null);
  const [testNumber, setTestNumber] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/sms/gateways')
      .then(res => setGateways(res.data || []))
      .catch(() => setGateways([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function startCreate() {
    setProvider('africas_talking');
    setLabel('');
    setSenderId('');
    setCreds({});
    setError(null);
    setShowForm(true);
  }

  async function save() {
    if (!label.trim()) {
      setError('Gateway name is required.');
      return;
    }
    const fields = PROVIDER_FIELDS[provider];
    if (fields.some(f => !creds[f.key]?.trim())) {
      setError('All carrier credentials are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/sms/gateways', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          label: label.trim(),
          credentials: creds,
          senderId: senderId.trim() || undefined,
        }),
      });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to save gateway.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(g: Gateway) {
    setGateways(prev => prev.map(x => (x.id === g.id ? { ...x, active: !x.active } : x)));
    await apiFetch(`/v1/sms/gateways/${g.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !g.active }),
    }).catch(load);
  }

  async function remove(id: string, gatewayLabel: string) {
    if (
      !(await showConfirm(`"${gatewayLabel}" will be removed. Sends routing to this gateway will fall back to next active carrier.`, {
        title: 'Delete Gateway?',
        variant: 'danger',
        confirmLabel: 'Delete',
      }))
    ) {
      return;
    }
    setGateways(prev => prev.filter(g => g.id !== id));
    await apiFetch(`/v1/sms/gateways/${id}`, { method: 'DELETE' }).catch(load);
  }

  async function executeTestSend() {
    if (!testModalGateway || !testNumber.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch(`/v1/sms/gateways/${testModalGateway.id}/test`, {
        method: 'POST',
        body: JSON.stringify({ to: testNumber.trim() }),
      });
      if (res.data?.success) {
        setTestResult({ success: true, message: 'Test SMS dispatched successfully. Check phone for delivery receipt.' });
      } else {
        setTestResult({ success: false, message: `Carrier rejected: ${res.data?.error || 'Unknown error'}` });
      }
      load();
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test failed.' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Admin', 'Communications', 'SMS Gateways']}
        titlePlain="SMS Gateways &"
        titleEm="Carrier Routing"
        subtitle="Intelligent carrier dispatch, Africa's Talking, Twilio, Vonage, priority ordering, and live failover."
        actions={
          <Button onClick={startCreate}>
            <Icon name="plus" size={14} /> New Gateway
          </Button>
        }
      />

      {/* Failover Architecture Info Card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: 'var(--white)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: '14px 18px',
          marginBottom: 20,
        }}
      >
        <FeaturedIcon variant="brand" size="sm" shape="circle">
          <Icon name="zap" size={16} />
        </FeaturedIcon>
        <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Automatic Carrier Failover Enabled</div>
          <div style={{ color: 'var(--ink2)', lineHeight: 1.45 }}>
            Outbound messages are routed to Priority #1 gateway. If the upstream telecom returns a transient failure (e.g. rate limit, route outage), the system immediately falls through to the next active carrier.
          </div>
        </div>
      </div>

      {/* Test Send Modal */}
      {testModalGateway && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard
            title={`Live Carrier Test — ${testModalGateway.label}`}
            collapsible={false}
            action={
              <button
                onClick={() => setTestModalGateway(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}
              >
                <Icon name="x" size={14} />
              </button>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
                Sends a live ping message directly through <strong>{testModalGateway.label}</strong> to verify API credentials, sender header permissions, and telecom connectivity.
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1, maxWidth: 320 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                    Destination Phone Number
                  </label>
                  <Input
                    value={testNumber}
                    onChange={e => setTestNumber(e.target.value)}
                    placeholder="+255712345678"
                  />
                </div>
                <Button disabled={!testNumber.trim() || testing} onClick={executeTestSend}>
                  <Icon name="send" size={14} /> {testing ? 'Pinging carrier…' : 'Send Test Ping'}
                </Button>
              </div>

              {testResult && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--r)',
                    fontSize: 13,
                    background: testResult.success ? 'var(--green-l)' : 'var(--red-l)',
                    color: testResult.success ? 'var(--green)' : 'var(--red)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Icon name={testResult.success ? 'checkCircle' : 'alertTriangle'} size={15} />
                  {testResult.message}
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Create Gateway Form */}
      {showForm && (
        <div style={{ marginBottom: 20 }}>
          <SectionCard title="Add New Carrier Gateway" collapsible={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                  Carrier Provider *
                </label>
                <Select value={provider} onValueChange={v => { setProvider(v); setCreds({}); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SELECTABLE_PROVIDERS.map(v => (
                      <SelectItem key={v} value={v}>{PROVIDER_LABELS[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                  Gateway Display Name *
                </label>
                <Input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. Primary Africa's Talking Link"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
              {PROVIDER_FIELDS[provider].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                    {f.label} *
                  </label>
                  <Input
                    type={f.secret ? 'password' : 'text'}
                    value={creds[f.key] || ''}
                    onChange={e => setCreds(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder || f.label}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 16, maxWidth: 360 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                Default Sender ID (Optional)
              </label>
              <Input
                value={senderId}
                onChange={e => setSenderId(e.target.value.toUpperCase())}
                placeholder="e.g. HUDUMIKA"
                maxLength={11}
              />
            </div>

            {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button disabled={saving} onClick={save}>
                {saving ? 'Connecting Gateway…' : 'Save Gateway'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setError(null); }}>
                Cancel
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Gateways Table */}
      <SectionCard title="Configured Gateways" padded={false} collapsible={false}>
        {loading ? (
          <SectionLoading />
        ) : gateways.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
            No SMS Gateways configured yet. Click <strong>New Gateway</strong> to connect Africa's Talking, Twilio, or Vonage.
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Priority', 'Carrier Gateway', 'Default Header', 'Failover Order', 'Status', 'Last Activity', ''].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: 'var(--ink3)',
                        background: 'var(--bg)',
                        borderBottom: '1px solid var(--border)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gateways.map((g, idx) => (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--ink3)' }}>
                      #{idx + 1}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{g.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                        {PROVIDER_LABELS[g.provider] || g.provider}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>
                        {g.sender_id || 'Generic'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant={idx === 0 ? 'brand' : 'gray'}>
                        {idx === 0 ? 'Primary Active' : `Fallback Level ${idx}`}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => toggleActive(g)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Badge variant={g.active ? 'success' : 'gray'}>
                          {g.active ? 'Active' : 'Disabled'}
                        </Badge>
                      </button>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                      {g.last_used_at ? new Date(g.last_used_at).toLocaleString() : 'Never used'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTestModalGateway(g);
                            setTestResult(null);
                          }}
                        >
                          <Icon name="send" size={11} /> Test Ping
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(g.id, g.label)}>
                          <Icon name="trash" size={13} color="var(--red)" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
