import React from 'react';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';

/**
 * Shared multi-step wizard chrome for the customs calculators — the vertical
 * (desktop) / horizontal (mobile) step bar, the step caption, and the
 * Back/Continue nav row, all lifted from LandedCostPage.tsx's own FCL wizard
 * so LCL/Air/Transit follow the same pattern instead of being single long
 * forms. Deliberately its own file rather than exported from
 * LandedCostPage.tsx — that file is enormous and FCL-specific; this only
 * carries the generic chrome, parameterised by each calculator's own step
 * list and content.
 */

export interface WizardStepItem {
  label: string;
  shortLabel: string;
  desc: string;
  icon: IconName;
}

interface StepBarProps {
  steps: WizardStepItem[];
  current: number; // 0-indexed
  setStep: (s: number) => void; // 1-indexed
}

export function WizardVerticalStepBar({ steps, current, setStep }: StepBarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {steps.map((item, i) => {
        const isDone = i < current;
        const isActive = i === current;
        return (
          <div key={i} style={{ display: 'flex', gap: 14, cursor: isDone ? 'pointer' : 'default' }} onClick={() => isDone && setStep(i + 1)}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
                background: isActive ? 'var(--teal)' : isDone ? 'color-mix(in srgb, var(--teal) 15%, transparent)' : 'var(--surface, rgba(255,255,255,0.05))',
                border: `1.5px solid ${isActive || isDone ? 'var(--teal)' : 'var(--border)'}`,
                color: isActive ? '#fff' : isDone ? 'var(--teal)' : 'var(--ink3)',
                boxShadow: isActive ? '0 0 14px color-mix(in srgb, var(--teal) 35%, transparent)' : 'none',
                transition: 'all 0.2s ease',
              }}>
                {isDone ? <Icon name="check" size={15} color="var(--teal)" strokeWidth={3} /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 28, background: isDone ? 'var(--teal)' : 'var(--border)', margin: '6px 0', borderRadius: 2 }} />
              )}
            </div>
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 13.5, fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--ink)' : isDone ? 'var(--teal)' : 'var(--ink3)', transition: 'color 0.2s' }}>
                {item.label}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{item.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WizardHorizontalStepBar({ steps, current, setStep }: StepBarProps) {
  return (
    <div className="calc-wiz-card calc-wiz-step-mobile">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {steps.map((item, i) => {
          const isDone = i < current;
          const isActive = i === current;
          return (
            <React.Fragment key={i}>
              <div onClick={() => isDone && setStep(i + 1)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: isDone ? 'pointer' : 'default', flexShrink: 0 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                  background: isActive ? 'var(--teal)' : isDone ? 'color-mix(in srgb, var(--teal) 15%, transparent)' : 'var(--surface, rgba(255,255,255,0.05))',
                  border: `1.5px solid ${isActive || isDone ? 'var(--teal)' : 'var(--border)'}`,
                  color: isActive ? '#fff' : isDone ? 'var(--teal)' : 'var(--ink3)',
                }}>
                  {isDone ? <Icon name="check" size={13} color="var(--teal)" strokeWidth={3} /> : i + 1}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--teal)' : 'var(--ink3)', whiteSpace: 'nowrap' }}>
                  {item.shortLabel}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, background: isDone ? 'var(--teal)' : 'var(--border)', margin: '0 6px 16px', borderRadius: 2 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** "Step X of N — Label" caption shown at the top of every step's card. */
export function WizardStepCaption({ steps, index }: { steps: WizardStepItem[]; index: number }) {
  const item = steps[index];
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>
      Step {index + 1} of {steps.length} · {item.label}
    </div>
  );
}

export function WizardNavRow({ step, totalSteps, setStep, error, busy, onContinue, continueLabel }: {
  step: number;
  totalSteps: number;
  setStep: (s: number) => void;
  error?: string | null;
  busy?: boolean;
  /** Called instead of a plain advance when Continue is pressed on the last input
   *  step — used to trigger the actual calculation before moving to Results. */
  onContinue?: () => void;
  continueLabel?: string;
}) {
  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      {error && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: 'color-mix(in srgb, var(--red) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)', color: 'var(--red)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="alertCircle" size={15} color="var(--red)" /> {error}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {step > 1
          ? <button type="button" onClick={() => setStep(step - 1)} disabled={busy}
              style={{ height: 'var(--ctl-h)', padding: '0 22px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="arrowLeft" size={14} /> Back
            </button>
          : <div />
        }
        {step < totalSteps
          ? <button type="button" disabled={!!error || busy}
              onClick={() => { if (!error) { if (onContinue) onContinue(); else setStep(step + 1); } }}
              style={{ height: 'var(--ctl-h)', padding: '0 28px', borderRadius: 'var(--r-sm)', border: 'none', background: error ? 'var(--border)' : 'var(--teal)', color: error ? 'var(--ink3)' : '#fff', fontWeight: 700, fontSize: 14, cursor: error || busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: error ? 'none' : '0 4px 16px color-mix(in srgb, var(--teal) 30%, transparent)' }}>
              {busy ? 'Calculating…' : (continueLabel ?? 'Continue')} {!busy && <Icon name="arrowRight" size={14} color={error ? 'var(--ink3)' : '#fff'} />}
            </button>
          : null
        }
      </div>
    </div>
  );
}

export function WizardShell({ steps, step, setStep, sidebarExtra, children }: {
  steps: WizardStepItem[];
  step: number;
  setStep: (s: number) => void;
  /** Extra card(s) rendered below the step list in the desktop sidebar — e.g. a live-rate or reference card. */
  sidebarExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{`
        .calc-wiz-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 24px; align-items: start; margin-top: 16px; }
        .calc-wiz-card { min-width: 0; background: var(--card-bg, var(--white)); border: 1px solid var(--border); border-radius: 16px; padding: 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
        .calc-wiz-step-mobile { display: none; }
        .calc-wiz-step-desktop { display: flex; flex-direction: column; gap: 20px; }
        @media (max-width: 860px) {
          .calc-wiz-layout { grid-template-columns: minmax(0, 1fr); gap: 14px; }
          .calc-wiz-step-desktop { display: none; }
          .calc-wiz-step-mobile { display: block; padding: 16px 14px; }
        }
        @media (max-width: 520px) {
          .calc-wiz-card { padding: 18px; border-radius: 12px; }
        }
      `}</style>

      <WizardHorizontalStepBar steps={steps} current={step - 1} setStep={setStep} />

      <div className="calc-wiz-layout">
        <div className="calc-wiz-step-desktop">
          <div className="calc-wiz-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 16 }}>
              Calculation Steps
            </div>
            <WizardVerticalStepBar steps={steps} current={step - 1} setStep={setStep} />
          </div>
          {sidebarExtra}
        </div>

        <div>{children}</div>
      </div>
    </>
  );
}

/** Label is always exactly one line (a hint, when present, sits behind an
 *  info icon rather than inline text) so paired fields in the same 2-column
 *  grid row always start their inputs at the same Y. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        {hint && (
          <span title={hint} style={{ display: 'inline-flex', flexShrink: 0, cursor: 'help' }}>
            <Icon name="info" size={11} color="var(--ink4)" />
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

export const wizInputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 38, fontSize: 13 };
