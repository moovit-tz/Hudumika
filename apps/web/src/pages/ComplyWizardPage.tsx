import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import {ButtonSpinner} from '../components/ui/spinner.js';
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
      <PageHeader crumbs={['ComplyOS', 'Wizard']} title={title} subtitle={subtitle}
        actions={<Button variant="outline" size="sm" onClick={() => navigate(backTo)}><Icon name="chevronLeft" size={13} /> Back to list</Button>} />

      <Card className="comply-card comply-wizard-card">
        {/* Step indicator */}
        <ol className="comply-wizard-progress" aria-label="Form progress">
          {steps.map((label, i) => (
            <li key={label} className="comply-wizard-progress-item" data-state={i < step ? 'complete' : i === step ? 'current' : 'upcoming'} aria-current={i === step ? 'step' : undefined}>
                <span className="comply-wizard-progress-number" aria-hidden="true">
                  {i < step ? <Icon name="check" size={11} strokeWidth={3} /> : i + 1}
                </span>
                <span>{label}</span>
            </li>
          ))}
        </ol>

        <div className="comply-wizard-body">
          {children}
        </div>

        <div className="comply-wizard-footer">
          <div className="comply-wizard-footer-back">
            {step > 0 && onBack && (
              <Button variant="outline" size="sm" type="button"  onClick={onBack} disabled={busy} >
                <Icon name="chevronLeft" size={13} /> Back
              </Button>
            )}
          </div>
          <div className="comply-wizard-footer-actions">
            <Button variant="outline" size="sm" type="button"  onClick={() => navigate(backTo)} disabled={busy} >Cancel</Button>
            {onNext && (
              <Button variant="default" size="sm" type="button"  onClick={onNext} disabled={nextDisabled || busy} >
                {busy && <ButtonSpinner />}{busy ? 'Working…' : (nextLabel ?? (isLast ? 'Finish' : 'Next'))}
                {!busy && !isLast && <Icon name="chevronRight" size={13} />}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export function WizardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="comply-form-field">
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}
