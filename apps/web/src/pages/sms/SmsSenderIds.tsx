import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
}

interface SenderIdItem {
  id: string;
  gateway_id: string;
  sender_id: string;
  label: string | null;
  is_default: boolean;
  created_at: string;
  // DLT & Regulatory fields
  entity_id?: string;
  header_type?: 'Transactional' | 'Service Implicit' | 'Service Explicit' | 'Promotional';
  status?: 'approved' | 'in_review' | 'pending';
}

const PROVIDER_LABELS: Record<string, string> = {
  beem: 'Beem Africa',
  africas_talking: "Africa's Talking",
  twilio: 'Twilio',
  nexmo: 'Vonage (Nexmo)',
  bongolive: 'Beem Africa (BongoLive)',
};

export function SmsSenderIds() {
  usePageSEO('SMS Sender IDs & DLT Registry', 'Manage registered SMS sender headers, DLT operator IDs, and default dispatch routing.');
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [allSenderIds, setAllSenderIds] = useState<{ gateway: Gateway; items: SenderIdItem[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>('');
  const [senderIdInput, setSenderIdInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether the initial gateway has been auto-selected — prevents
  // re-selecting gList[0] on every reload triggered by form interactions.
  const didInitGateway = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const gRes = await apiFetch('/v1/sms/gateways');
      const gList: Gateway[] = gRes.data || [];
      setGateways(gList);
      if (gList.length > 0 && !didInitGateway.current) {
        setSelectedGatewayId(gList[0].id);
        didInitGateway.current = true;
      }

      const senderResults = await Promise.all(
        gList.map(async (g) => {
          try {
            const sRes = await apiFetch(`/v1/sms/gateways/${g.id}/sender-ids`);
            return { gateway: g, items: (sRes.data || []) as SenderIdItem[] };
          } catch {
            return { gateway: g, items: [] as SenderIdItem[] };
          }
        })
      );
      setAllSenderIds(senderResults);
    } catch {
      setGateways([]);
      setAllSenderIds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateSenderId() {
    if (!selectedGatewayId) {
      setError('Please choose a gateway.');
      return;
    }
    const cleanSender = senderIdInput.trim().toUpperCase();
    if (!cleanSender || cleanSender.length < 2 || cleanSender.length > 11) {
      setError('Sender ID must be between 2 and 11 alphanumeric characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/v1/sms/gateways/${selectedGatewayId}/sender-ids`, {
        method: 'POST',
        body: JSON.stringify({
          senderId: cleanSender,
          label: labelInput.trim() || undefined,
          isDefault,
        }),
      });
      setShowModal(false);
      setSenderIdInput('');
      setLabelInput('');
      setIsDefault(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to register sender ID.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault(gatewayId: string, item: SenderIdItem) {
    try {
      await apiFetch(`/v1/sms/gateways/${gatewayId}/sender-ids/${item.id}/default`, {
        method: 'POST',
      });
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to set default sender ID.');
    }
  }

  async function handleDelete(gatewayId: string, item: SenderIdItem) {
    if (
      !(await showConfirm(
        `Are you sure you want to remove the Sender ID "${item.sender_id}"? Messages sent with this header may fail if not reconfigured.`,
        { title: 'Remove Sender ID?', variant: 'danger', confirmLabel: 'Remove' }
      ))
    ) {
      return;
    }
    try {
      await apiFetch(`/v1/sms/gateways/${gatewayId}/sender-ids/${item.id}`, {
        method: 'DELETE',
      });
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to remove sender ID.');
    }
  }

  const totalHeaders = allSenderIds.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['SMS', 'Configuration', 'Sender IDs & DLT']}
        titlePlain="Sender IDs &"
        titleEm="DLT Registry"
        subtitle="Alphanumeric headers, DLT Entity approvals, and sender identities used for customer SMS dispatch across gateways."
        actions={
          <Button onClick={() => { setShowModal(true); setError(null); }}>
            <Icon name="plus" size={14} /> Register Sender ID
          </Button>
        }
      />

      {/* DLT & Regulatory Info Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          background: 'var(--teal-l)',
          border: '1px solid var(--teal)',
          borderRadius: 'var(--r)',
          padding: '14px 18px',
          marginBottom: 20,
        }}
      >
        <FeaturedIcon variant="brand" size="sm" shape="circle">
          <Icon name="shield" size={16} />
        </FeaturedIcon>
        <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>
          <div style={{ fontWeight: 700, marginBottom: 2, color: 'var(--ink)' }}>
            Carrier & DLT Compliance Standards
          </div>
          <div style={{ color: 'var(--ink2)', lineHeight: 1.45 }}>
            Sender IDs (Alpha Headers) must be registered with your telecom operator (e.g. TCRA, NCC, TRAI) before bulk delivery. 
            Transactional headers deliver 24/7, while Promotional headers operate strictly within regulatory daylight windows.
          </div>
        </div>
      </div>

      {/* Quick Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="brand" size="md" shape="circle"><Icon name="tag" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Sender IDs</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : totalHeaders}</div>
          </div>
        </div>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="success" size="md" shape="circle"><Icon name="checkCircle" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Configured Gateways</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{loading ? '—' : gateways.filter(g => g.active).length}</div>
          </div>
        </div>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FeaturedIcon variant="info" size="md" shape="circle"><Icon name="shield" size={18} /></FeaturedIcon>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Default Header</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
              {gateways.find(g => g.sender_id)?.sender_id || 'Not Set (Generic)'}
            </div>
          </div>
        </div>
      </div>

      {/* Modal / Inline Register Form */}
      {showModal && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Register New Sender ID / Header" collapsible={false}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Target Gateway *</label>
                <Select value={selectedGatewayId} onValueChange={setSelectedGatewayId}>
                  <SelectTrigger><SelectValue placeholder="Select gateway…" /></SelectTrigger>
                  <SelectContent>
                    {gateways.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.label} ({PROVIDER_LABELS[g.provider] || g.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>
                  Sender ID (Alpha Header) * <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>(Up to 11 uppercase chars)</span>
                </label>
                <Input
                  value={senderIdInput}
                  onChange={e => setSenderIdInput(e.target.value.toUpperCase())}
                  placeholder="e.g. HUDUMIKA"
                  maxLength={11}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14, maxWidth: 360 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Internal Description</label>
              <Input
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                placeholder="e.g. Primary OTP Header"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input
                type="checkbox"
                id="is-default-header"
                checked={isDefault}
                onChange={e => setIsDefault(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--teal)', cursor: 'pointer' }}
              />
              <label htmlFor="is-default-header" style={{ fontSize: 13, color: 'var(--ink)', cursor: 'pointer', fontWeight: 500 }}>
                Set as default outgoing sender header for this gateway
              </label>
            </div>

            {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button disabled={saving} onClick={handleCreateSenderId}>
                {saving ? 'Registering…' : 'Save Sender ID'}
              </Button>
              <Button variant="outline" onClick={() => { setShowModal(false); setError(null); }}>
                Cancel
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Gateway Sender IDs List */}
      {loading ? (
        <SectionLoading />
      ) : allSenderIds.length === 0 ? (
        <SectionCard title="Registered Headers" padded={false} collapsible={false}>
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>
            No SMS Gateways configured. Please ask your platform administrator to add a gateway in <Link to="/admin/sms-gateways" style={{ color: 'var(--teal)' }}>Admin → SMS Gateways</Link>.
          </div>
        </SectionCard>
      ) : (
        allSenderIds.map(({ gateway, items }) => (
          <div key={gateway.id} style={{ marginBottom: 24 }}>
            <SectionCard
              title={`${gateway.label} — ${PROVIDER_LABELS[gateway.provider] || gateway.provider}`}
              padded={false}
              collapsible={false}
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge variant={gateway.active ? 'success' : 'gray'}>
                    {gateway.active ? 'Active' : 'Disabled'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedGatewayId(gateway.id);
                      setShowModal(true);
                      setError(null);
                    }}
                  >
                    <Icon name="plus" size={12} /> Add Header
                  </Button>
                </div>
              }
            >
              {items.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  No custom Sender IDs registered under this gateway yet. Messages will send using the gateway's default phone number or provider header.
                </div>
              ) : (
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Sender ID / Header', 'Default Route', 'Registered', ''].map(h => (
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
                      {items.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.05em' }}>
                                {item.sender_id}
                              </span>
                              {item.label && (
                                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                                  ({item.label})
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {item.is_default || gateway.sender_id === item.sender_id ? (
                              <Badge variant="success">Primary Default</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSetDefault(gateway.id, item)}
                                style={{ fontSize: 11.5, height: 24, padding: '0 8px' }}
                              >
                                Set as default
                              </Button>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink3)' }}>
                            {new Date(item.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(gateway.id, item)}
                            >
                              <Icon name="trash" size={13} color="var(--red)" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        ))
      )}
    </div>
  );
}
