import React, { useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../../components/ui/accordion.js';
import { EntityPicker, PickerItem } from '../../components/EntityPicker.js';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import type { StepProps } from './types.js';

const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 };

// Same height/padding box-model as .btn.btn-sm (index.css), so the kind
// badge lines up with the "Source" link button next to it instead of
// sitting shorter/squatter than it.
const badgeAligned: React.CSSProperties = { minHeight: 34, padding: '8px 16px', fontSize: 13, display: 'inline-flex', alignItems: 'center' };

async function searchCustomers(q: string): Promise<PickerItem[]> {
  const res = await apiFetch('/v1/customers').catch(() => ({ data: [] }));
  const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
  const ql = q.trim().toLowerCase();
  const filtered = ql ? list.filter((c) => (c.name || '').toLowerCase().includes(ql) || (c.email || '').toLowerCase().includes(ql)) : list;
  return filtered.slice(0, 25).map((c) => ({ id: c.id, label: c.name, sublabel: c.email || c.phone || undefined }));
}

const INVOICE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'];

export function StepResults({ draft, onBack }: StepProps) {
  const result = draft.result;
  const { user } = useAuth();

  const [showDetails, setShowDetails] = useState(false);
  const [customer, setCustomer] = useState<PickerItem | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  if (!result) return null;
  const { procedure, steps, documents_needed, offices, usage } = result;
  const canInvoice = !user?.role || INVOICE_ROLES.includes(user.role);

  async function requestConsultation() {
    if (!customer) { setPostError('Pick the customer this consultation is for.'); return; }
    setPosting(true);
    setPostError(null);
    try {
      const product = await apiFetch('/v1/customs/trade-wizard/consultation-product');
      await apiFetch('/v1/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: customer.id,
          status: 'Draft',
          items: [{
            name: `${product.name} — ${procedure!.name}`,
            unit: product.unit || 'session',
            rate: product.sale_price,
            qty: 1,
            currency: product.currency || 'TZS',
            line_group: 'other',
          }],
        }),
      });
      setPosted(true);
    } catch (err: any) {
      setPostError(err?.message || 'Could not create the consultation invoice.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        <Icon name="chevronLeft" size={13} /> Back
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{procedure.name}</div>
          {procedure.summary && <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4, maxWidth: 560 }}>{procedure.summary}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Badge variant="brand" style={badgeAligned}>{procedure.kind}</Badge>
          {procedure.source_url && (
            <a href={procedure.source_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              Source <Icon name="externalLink" size={12} />
            </a>
          )}
        </div>
      </div>

      {usage.limit !== null && (
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16 }}>
          {usage.used} of {usage.limit} wizard searches used this month
        </div>
      )}

      {/* Process flow — the primary content of this step; certificates/timing/
          offices reference data is folded behind the toggle below so the
          reader lands straight on what to actually do next. */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FeaturedIcon variant="success" size="sm" shape="square"><Icon name="layers" size={15} /></FeaturedIcon>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Process flow</div>
          </div>
          <button
            type="button"
            onClick={() => setShowDetails(v => !v)}
            className="btn btn-secondary btn-sm"
          >
            <Icon name={showDetails ? 'chevronUp' : 'chevronDown'} size={13} />
            {showDetails ? 'Hide' : 'View'} certificates, timing & offices
          </button>
        </div>
        <Accordion type="single" collapsible className="flex flex-col gap-2">
          {steps.map(s => (
            <AccordionItem key={s.id} value={s.id}>
              <AccordionTrigger>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.step_no}</span>
                  {s.name}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {s.description && <p style={{ margin: '0 0 8px' }}>{s.description}</p>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12 }}>
                  {s.institution_name && <span><strong>Office:</strong> {s.institution_name}</span>}
                  {s.duration_estimate && <span><strong>Time:</strong> {s.duration_estimate}</span>}
                  {s.cost_estimate && <span><strong>Cost:</strong> {s.cost_estimate}</span>}
                  <span><strong>Online:</strong> {s.is_online ? 'Yes' : 'No'}</span>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Certificates / timing / offices — collapsed by default */}
      {showDetails && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
          {/* Certificates & permits needed */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <FeaturedIcon variant="warning" size="sm" shape="square"><Icon name="fileText" size={15} /></FeaturedIcon>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Certificates & permits needed</div>
            </div>
            {documents_needed.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No specific documents recorded for this procedure yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {documents_needed.map(d => (
                  <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)' }}>
                    <Icon name="checkCircle" size={13} color="var(--gold)" /> {d}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Time to acquire — a real two-column table (Process / Time), scrolls
              horizontally on its own instead of squeezing text if the card
              ever gets narrower than the content needs. */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <FeaturedIcon variant="info" size="sm" shape="square"><Icon name="clock" size={15} /></FeaturedIcon>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Time to acquire</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 220 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '0 8px 8px 0', color: 'var(--ink3)', fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Process</th>
                    <th style={{ textAlign: 'right', padding: '0 0 8px 8px', color: 'var(--ink3)', fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.4px' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: i < steps.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '8px 8px 8px 0', color: 'var(--ink2)', verticalAlign: 'top' }}>{s.name}</td>
                      <td style={{ padding: '8px 0 8px 8px', color: 'var(--ink3)', textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {s.duration_estimate || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Offices & authorities */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <FeaturedIcon variant="brand" size="sm" shape="square"><Icon name="mapPin" size={15} /></FeaturedIcon>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Offices & authorities</div>
            </div>
            {offices.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No specific offices recorded for this procedure yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {offices.map(o => (
                  <div key={o.id ?? o.name} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflowWrap: 'break-word' }}>{o.name}{o.acronym ? ` (${o.acronym})` : ''}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                      {o.phone && <span>{o.phone}</span>}
                      {o.email && <span style={{ overflowWrap: 'break-word' }}>{o.email}</span>}
                      {o.website && <a href={o.website} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>Website</a>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {canInvoice && (
        <div style={{
          background: 'linear-gradient(135deg, var(--teal-l) 0%, var(--green-l) 100%)',
          border: '1px solid var(--teal-m)',
          borderRadius: 16,
          padding: 'clamp(18px, 4vw, 24px)',
          boxShadow: '0 4px 20px var(--teal-l)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FeaturedIcon variant="brand" size="md" shape="square"><Icon name="users" size={18} /></FeaturedIcon>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>Need hands-on help with this procedure?</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2, maxWidth: 480 }}>
                  Bill your customer for a compliance consultation on this procedure — a Draft invoice is created in your own Billing so you can review it before sending.
                </div>
              </div>
            </div>
            <Badge variant="brand">Consulting</Badge>
          </div>

          <div style={{ maxWidth: 420 }}>
            {posted ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 11, background: 'var(--green-l)', color: 'var(--green)', fontSize: 13, fontWeight: 700 }}>
                <Icon name="checkCircle" size={15} /> Draft invoice created — find it in Billing to review and send.
              </div>
            ) : !showRequestForm ? (
              <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowRequestForm(true)}>
                <Icon name="fileText" size={15} /> Request Consultation Invoice
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <EntityPicker label="Customer" value={customer} onChange={setCustomer} search={searchCustomers} placeholder="Search customers…" />
                {postError && <div style={{ color: 'var(--red)', fontSize: 12.5 }}>{postError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowRequestForm(false)}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={requestConsultation} disabled={posting}>
                    {posting ? 'Creating…' : 'Send Request'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
