import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Icon } from '../../components/Icon.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { EMPTY_DRAFT } from './types.js';
import type { WizardDraft, ProcedureKind } from './types.js';
import { StepGoal } from './StepGoal.js';
import { StepPrecheck } from './StepPrecheck.js';
import { StepResults } from './StepResults.js';

const STEP_ITEMS = [
  { step: 1, label: 'What do you need?', desc: 'Goal & Commodity Selection', icon: 'search' },
  { step: 2, label: 'Pre-check', desc: 'Qualifying Questions & Permits', icon: 'clipboardList' },
  { step: 3, label: 'Results & Flow', desc: 'Offices, Steps & Invoicing', icon: 'fileText' },
];

const KINDS: { value: ProcedureKind; label: string; icon: any; desc: string }[] = [
  { value: 'EXPORT', label: 'Export', icon: 'arrowUp', desc: 'Send goods out of Tanzania' },
  { value: 'IMPORT', label: 'Import', icon: 'arrowDown', desc: 'Bring goods into Tanzania' },
  { value: 'TRANSIT', label: 'Transit', icon: 'truck', desc: 'Move goods through Tanzania to another country' },
  { value: 'REGISTRATION', label: 'Registration', icon: 'clipboardList', desc: 'General licences and registrations' },
];

export function TradeWizard() {
  const isMobile = useIsMobile();
  const [urlParams] = useSearchParams();
  const [draft, setDraft] = useState<WizardDraft>(EMPTY_DRAFT);
  const [step, setStep] = useState(1);
  const [usage, setUsage] = useState<{ used: number; limit: number | null } | null>(null);
  const [reopening, setReopening] = useState(() => !!urlParams.get('procedure'));

  useEffect(() => {
    apiFetch('/v1/customs/trade-wizard/usage').then(setUsage).catch(() => {});
  }, [step]);

  useEffect(() => {
    const procedureId = urlParams.get('procedure');
    if (!procedureId) return;
    apiFetch(`/v1/customs/trade-wizard/procedures/${procedureId}`)
      .then(detail => {
        setDraft(prev => ({ ...prev, kind: (detail.kind as ProcedureKind) ?? prev.kind, procedure: detail, answers: {} }));
        setStep(2);
      })
      .catch(() => {})
      .finally(() => setReopening(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<WizardDraft>) => setDraft(prev => ({ ...prev, ...patch }));
  const onNext = () => setStep(s => Math.min(3, s + 1));
  const onBack = () => setStep(s => Math.max(1, s - 1));

  const stepProps = { draft, update, onNext, onBack };
  const quotaExhausted = usage && usage.limit !== null && usage.used >= usage.limit;

  const canNavigateTo = (targetStep: number) => {
    if (targetStep === 1) return true;
    if (targetStep === 2) return !!draft.procedure;
    if (targetStep === 3) return !!draft.result;
    return false;
  };

  return (
    <div style={{ padding: isMobile ? '12px 16px 24px 16px' : '16px 32px 32px 32px', flex: 1, overflowY: 'auto' }}>
      {/* Page Header with Redesigned Quota Button */}
      <PageHeader
        crumbs={['ClearOS', 'Compliance']}
        titlePlain="Trade compliance"
        titleEm="wizard"
        subtitle="Tell us what you want to export, import or transit — we'll show the real permits, offices and process flow."
        actions={usage && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 16px',
            borderRadius: 20,
            background: quotaExhausted ? 'color-mix(in srgb, var(--red) 10%, transparent)' : 'color-mix(in srgb, var(--teal) 10%, transparent)',
            border: `1.5px solid ${quotaExhausted ? 'color-mix(in srgb, var(--red) 30%, transparent)' : 'color-mix(in srgb, var(--teal) 30%, transparent)'}`,
            color: quotaExhausted ? 'var(--red)' : 'var(--teal)',
            fontWeight: 700,
            fontSize: 12.5,
            boxShadow: '0 2px 10px color-mix(in srgb, var(--teal) 12%, transparent)'
          }}>
            <Icon name={quotaExhausted ? 'alertTriangle' : 'sparkle'} size={14} color={quotaExhausted ? 'var(--red)' : 'var(--teal)'} />
            <span>{usage.limit === null ? 'Unlimited searches on your plan' : `${usage.used} of ${usage.limit} searches used this month`}</span>
          </div>
        )}
      />

      {/* TOP HORIZONTAL STEPPER WIZARD BAR — scrolls horizontally on narrow
          screens instead of crushing the three steps into each other. */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: isMobile ? 'flex-start' : 'space-between',
        overflowX: isMobile ? 'auto' : 'visible',
        padding: '16px 28px',
        background: 'var(--card-bg, var(--white))',
        border: '1px solid var(--border)',
        borderRadius: 16,
        marginTop: 8,
        marginBottom: 18,
        boxShadow: '0 4px 18px rgba(0,0,0,0.03)'
      }}>
        {STEP_ITEMS.map((item, i) => {
          const isDone = i + 1 < step;
          const isActive = i + 1 === step;
          const canClick = isDone || canNavigateTo(i + 1);

          return (
            <React.Fragment key={i}>
              <div
                onClick={() => canClick && setStep(i + 1)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexShrink: 0,
                  cursor: canClick ? 'pointer' : 'default',
                  padding: '4px 8px'
                }}
              >
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12.5,
                  fontWeight: 800,
                  flexShrink: 0,
                  background: isActive ? 'var(--teal)' : isDone ? 'color-mix(in srgb, var(--teal) 15%, transparent)' : 'var(--surface, rgba(255,255,255,0.05))',
                  border: `1.5px solid ${isActive || isDone ? 'var(--teal)' : 'var(--border)'}`,
                  color: isActive ? '#ffffff' : isDone ? 'var(--teal)' : 'var(--ink3)',
                  boxShadow: isActive ? '0 0 12px color-mix(in srgb, var(--teal) 35%, transparent)' : 'none',
                  transition: 'all 0.2s ease'
                }}>
                  {isDone ? <Icon name="check" size={14} color="var(--teal)" strokeWidth={3} /> : i + 1}
                </div>
                <div style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 13.5, fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--ink)' : isDone ? 'var(--teal)' : 'var(--ink3)' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{item.desc}</div>
                </div>
              </div>
              {i < STEP_ITEMS.length - 1 && (
                <div style={{ flex: isMobile ? '0 0 32px' : 1, height: 2, background: i + 1 < step ? 'var(--teal)' : 'var(--border)', margin: '0 20px', borderRadius: 2 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* MAIN 2-COLUMN WORKSPACE GRID — stacks to one column on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '280px 1fr', gap: 20, alignItems: 'start' }}>
        
        {/* LEFT SIDEBAR: "What do you want to do?" Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 14 }}>
              What do you want to do?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={() => update({ kind: null })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: 'var(--ds-btn-py) 14px',
                  borderRadius: 'var(--r)',
                  border: `1.5px solid ${draft.kind === null ? 'var(--teal)' : 'var(--border)'}`,
                  background: draft.kind === null ? 'color-mix(in srgb, var(--teal) 12%, transparent)' : 'var(--surface, rgba(255,255,255,0.03))',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <FeaturedIcon variant={draft.kind === null ? 'brand' : 'gray'} size="sm" shape="square">
                  <Icon name="grid" size={15} />
                </FeaturedIcon>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>All Procedures</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Browse full catalog</div>
                </div>
              </button>

              {KINDS.map(k => {
                const isSelected = draft.kind === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => update({ kind: k.value })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: 'var(--ds-btn-py) 14px',
                      borderRadius: 'var(--r)',
                      border: `1.5px solid ${isSelected ? 'var(--teal)' : 'var(--border)'}`,
                      background: isSelected ? 'color-mix(in srgb, var(--teal) 12%, transparent)' : 'var(--card-bg, var(--white))',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FeaturedIcon variant={isSelected ? 'brand' : 'gray'} size="sm" shape="square">
                      <Icon name={k.icon} size={15} />
                    </FeaturedIcon>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{k.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{k.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Selected Procedure Card */}
          {draft.procedure && (
            <div style={{ background: 'color-mix(in srgb, var(--teal) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 22%, transparent)', borderRadius: 14, padding: '14px 16px', fontSize: 12.5, color: 'var(--ink)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                Selected Procedure
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>{draft.procedure.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>Kind: <strong>{draft.procedure.kind}</strong></div>
            </div>
          )}
        </div>

        {/* RIGHT MAIN WORKSPACE PANEL */}
        <div>
          {reopening ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16 }}>
              <Icon name="refresh" size={24} color="var(--teal)" className="tw-spin" style={{ display: 'block', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13 }}>Loading procedure detail…</div>
              <style>{`@keyframes tw-spin { to { transform: rotate(360deg); } } .tw-spin { animation: tw-spin 1s linear infinite; }`}</style>
            </div>
          ) : quotaExhausted && step === 1 ? (
            <div style={{ padding: 32, textAlign: 'center', background: 'var(--red-l)', border: '1px solid var(--red-l)', borderRadius: 16 }}>
              <Icon name="alertTriangle" size={24} color="var(--red)" />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 10 }}>Monthly search limit reached</div>
              <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4 }}>You've used all {usage!.limit} Trade Compliance Wizard searches included on your plan this month. Upgrade your plan for more searches.</div>
            </div>
          ) : (
            <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 4px 18px rgba(0,0,0,0.03)' }}>
              {step === 1 && <StepGoal {...stepProps} />}
              {step === 2 && <StepPrecheck {...stepProps} />}
              {step === 3 && <StepResults {...stepProps} />}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
