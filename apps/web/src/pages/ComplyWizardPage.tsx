import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import './ComplyOS.css';

/**
 * Shared multi-step form shell for ComplyOS create/engage flows (New
 * Application, Add Reminder, AI Obligation Scan, Engage Legal Firm, Add
 * Certificate, Add Obligation) — a dedicated page (mounted at its own route)
 * with a step indicator + Back/Next/Cancel footer wrapping whatever step
 * content the caller renders. Not a modal/overlay — "Cancel" and the header
 * back button both navigate back to `backTo` instead of closing a dialog.
 */
export function ComplyWizardPage({
  title, subtitle, steps, step, backTo, onBack, onNext, nextLabel, nextDisabled, busy, children,
}: {
  title: string;
  subtitle?: string;
  steps: string[];
  step: number; // 0-indexed
  backTo: string;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const isLast = step === steps.length - 1;

  return (
    <div className="comply-page">
      <div style={{ marginBottom: 12 }}>
        <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => navigate(backTo)}>
          <Icon name="chevronLeft" size={13} /> Back
        </button>
      </div>
      <PageHeader crumbs={['ComplyOS', 'Wizard']} title={title} subtitle={subtitle} />

      <div className="comply-card comply-wizard-card">
        {/* Step indicator */}
        <div className="comply-wizard-steps">
          {steps.map((label, i) => (
            <React.Fragment key={label}>
              {i > 0 && <div className="comply-wizard-step-connector" style={{ background: i <= step ? 'var(--comply)' : 'var(--border)' }} />}
              <div className="comply-wizard-step">
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                  background: i < step ? 'var(--comply)' : i === step ? 'var(--comply-l, rgba(5,150,105,0.12))' : 'var(--bg)',
                  color: i <= step ? (i < step ? '#fff' : 'var(--comply)') : 'var(--ink3)',
                  border: i === step ? '1.5px solid var(--comply)' : 'none',
                }}>
                  {i < step ? <Icon name="check" size={11} color="#fff" strokeWidth={3} /> : i + 1}
                </div>
                <span className="comply-wizard-step-label" style={{ color: i === step ? 'var(--ink)' : 'var(--ink3)' }}>{label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="comply-wizard-body">
          {children}
        </div>

        <div className="comply-wizard-footer">
          <div className="comply-wizard-footer-back">
            {step > 0 && onBack && (
              <button type="button" className="comply-btn-secondary" onClick={onBack} disabled={busy}>
                <Icon name="chevronLeft" size={13} /> Back
              </button>
            )}
          </div>
          <div className="comply-wizard-footer-actions">
            <button type="button" className="comply-btn-secondary" onClick={() => navigate(backTo)} disabled={busy}>Cancel</button>
            {onNext && (
              <button type="button" className="comply-btn-primary" onClick={onNext} disabled={nextDisabled || busy}>
                {busy ? 'Working…' : (nextLabel ?? (isLast ? 'Finish' : 'Next'))}
                {!busy && !isLast && <Icon name="chevronRight" size={13} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WizardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
