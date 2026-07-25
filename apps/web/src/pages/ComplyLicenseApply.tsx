import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useComplyLicenseCatalog, useComplyApplications } from '../hooks/useComply.js';
import { ComplyWizardPage, WizardField } from './ComplyWizardPage.js';
import { ComplyCustomerPicker } from './ComplyCustomerPicker.js';
import { showAlert } from '../lib/alert.js';
import './ComplyOS.css';

const STEPS = ['Licence', 'Requirements', 'Review'];

function formatFee(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  if (amount === 0) return 'Nil';
  const formatted = new Intl.NumberFormat('en-US').format(amount);
  return currency === 'USD' ? `USD ${formatted}` : `TZS ${formatted}/=`;
}

export function ComplyLicenseApply() {
  const { catalogId } = useParams<{ catalogId: string }>();
  const navigate = useNavigate();
  const { catalog, loading } = useComplyLicenseCatalog();
  const { create } = useComplyApplications();

  const entry = catalog.find(c => c.id === catalogId) ?? null;

  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [requirements, setRequirements] = useState<string[]>([]);
  const [newReq, setNewReq] = useState('');

  useEffect(() => {
    if (entry) setRequirements(entry.requirements);
  }, [entry?.id]);

  function removeRequirement(i: number) {
    setRequirements(rs => rs.filter((_, idx) => idx !== i));
  }

  function addRequirement() {
    const v = newReq.trim();
    if (!v) return;
    setRequirements(rs => [...rs, v]);
    setNewReq('');
  }

  async function handleCreate() {
    if (!entry) return;
    try {
      setCreating(true);
      const certType = `${entry.category} — ${entry.description}${entry.tier ? ` (${entry.tier})` : ''}`;
      await create({
        cert_type: certType,
        agency_code: 'LGA',
        notes: notes.trim() || undefined,
        customer_id: customerId,
        license_catalog_id: entry.id,
        metadata: {
          license_catalog_code: entry.code,
          requirements,
          fee: {
            principal: entry.principal_fee, principal_currency: entry.principal_currency,
            subsidiary: entry.subsidiary_fee, subsidiary_currency: entry.subsidiary_currency,
          },
        },
      });
      navigate('/complyos/applications');
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setCreating(false);
    }
  }

  if (!loading && !entry) {
    return (
      <div className="comply-page">
        <div className="comply-note comply-note--error">
          Licence not found. <a href="/complyos/license-catalog">Back to the catalogue</a>.
        </div>
      </div>
    );
  }

  return (
    <ComplyWizardPage
      title="Apply for a Business Licence"
      subtitle={entry ? `${entry.category} — ${entry.description}${entry.tier ? ` (${entry.tier})` : ''}` : undefined}
      steps={STEPS}
      step={step}
      backTo="/complyos/license-catalog"
      onBack={() => setStep(s => s - 1)}
      busy={creating || loading}
      nextLabel={step === STEPS.length - 1 ? (creating ? 'Submitting…' : 'Create Application') : undefined}
      onNext={() => {
        if (step < STEPS.length - 1) setStep(s => s + 1);
        else handleCreate();
      }}
    >
      {step === 0 && entry && (
        <>
          <div className="comply-meta-grid">
            {[
              { label: 'Category', val: `${entry.sn}. ${entry.category}` },
              { label: 'Licence', val: entry.description },
              { label: 'Tier', val: entry.tier ?? '—' },
              { label: 'Principal Fee', val: formatFee(entry.principal_fee, entry.principal_currency) },
              { label: 'Sub-Licence Fee', val: formatFee(entry.subsidiary_fee, entry.subsidiary_currency) },
              { label: 'Issuing Authority', val: 'Local Government Authority (LGA)' },
            ].map(m => (
              <div key={m.label}>
                <div className="comply-meta-key">{m.label}</div>
                <div className="comply-meta-val">{m.val}</div>
              </div>
            ))}
          </div>
          {entry.notes && <div className="comply-note" style={{ marginTop: 12 }}><strong>Note: </strong>{entry.notes}</div>}
          <div style={{ marginTop: 16 }}>
            <ComplyCustomerPicker value={customerId} onChange={setCustomerId} />
          </div>
          <div style={{ marginTop: 16 }}>
            <WizardField label="Notes (optional)">
              <textarea className="input-field" rows={3} placeholder="Any context for this application…" value={notes} onChange={e => setNotes(e.target.value)} />
            </WizardField>
          </div>
        </>
      )}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.5 }}>
            A general starting checklist for this category — not an official per-licence requirements list.
            Edit it to match what your council actually asks for; you can attach documents once the application is created.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {requirements.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <Icon name="fileText" size={13} color="var(--comply)" />
                <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1 }}>{r}</span>
                <button type="button" className="comply-close-btn" title="Remove" onClick={() => removeRequirement(i)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
            {requirements.length === 0 && <div className="comply-empty-hint">No requirements listed — add any documents your council requires below.</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input-field"
              style={{ flex: 1 }}
              placeholder="Add a required document or condition…"
              value={newReq}
              onChange={e => setNewReq(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRequirement(); } }}
            />
            <button type="button" className="comply-btn-secondary" onClick={addRequirement}>
              <Icon name="plus" size={13} /> Add
            </button>
          </div>
        </div>
      )}

      {step === 2 && entry && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="comply-meta-grid">
            {[
              { label: 'Licence', val: `${entry.description}${entry.tier ? ` (${entry.tier})` : ''}` },
              { label: 'Issuing Authority', val: 'Local Government Authority (LGA)' },
              { label: 'Client / Entity', val: customerId ? 'Selected client' : 'This business' },
              { label: 'Principal Fee', val: formatFee(entry.principal_fee, entry.principal_currency) },
              { label: 'Sub-Licence Fee', val: formatFee(entry.subsidiary_fee, entry.subsidiary_currency) },
              { label: 'Requirements', val: `${requirements.length} item${requirements.length === 1 ? '' : 's'}` },
            ].map(m => (
              <div key={m.label}>
                <div className="comply-meta-key">{m.label}</div>
                <div className="comply-meta-val">{m.val}</div>
              </div>
            ))}
          </div>
          {notes && <div className="comply-note"><strong>Note: </strong>{notes}</div>}
          <p style={{ fontSize: 12, color: 'var(--ink3)' }}>
            This creates a draft application you can review and submit from the Applications page. Submitting routes it through
            the LGA (walk-in/portal) channel and tracks its status the same way as your other agency applications.
          </p>
        </div>
      )}
    </ComplyWizardPage>
  );
}
