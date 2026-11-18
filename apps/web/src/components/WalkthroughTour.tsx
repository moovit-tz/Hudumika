import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import type { InteractiveTour, TourStep } from '@hudumika/types';

interface TourContextValue {
  activeTour: InteractiveTour | null;
  currentStepIndex: number;
  currentStep: TourStep | null;
  startTour: (tourId: string) => Promise<void>;
  nextStep: () => void;
  prevStep: () => void;
  endTour: (completed?: boolean) => void;
  dismissTour: (tourId: string) => void;
  completedTourIds: string[];
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [tours, setTours] = useState<InteractiveTour[]>([]);
  const [activeTour, setActiveTour] = useState<InteractiveTour | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedTourIds, setCompletedTourIds] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    apiFetch('/v1/help/tours')
      .then(res => { if (mounted) setTours(res.tours || []); })
      .catch(() => {});

    apiFetch('/v1/help/getting-started')
      .then(res => {
        if (mounted && res.progress) {
          setCompletedTourIds(res.progress.completedTourIds || []);
        }
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, []);

  const startTour = useCallback(async (tourId: string) => {
    let tour = tours.find(t => t.id === tourId);
    if (!tour) {
      try {
        const res = await apiFetch(`/v1/help/tours`);
        tour = (res.tours || []).find((t: InteractiveTour) => t.id === tourId);
      } catch {}
    }
    if (tour && tour.steps.length > 0) {
      setActiveTour(tour);
      setCurrentStepIndex(0);
    }
  }, [tours]);

  const endTour = useCallback((completed = true) => {
    if (activeTour && completed) {
      const tourId = activeTour.id;
      setCompletedTourIds(prev => Array.from(new Set([...prev, tourId])));
      apiFetch('/v1/help/progress', {
        method: 'POST',
        body: JSON.stringify({ completedTourId: tourId }),
      }).catch(() => {});
    }
    setActiveTour(null);
    setCurrentStepIndex(0);
  }, [activeTour]);

  const dismissTour = useCallback((tourId: string) => {
    apiFetch('/v1/help/progress', {
      method: 'POST',
      body: JSON.stringify({ dismissedTourId: tourId }),
    }).catch(() => {});
    if (activeTour?.id === tourId) {
      setActiveTour(null);
      setCurrentStepIndex(0);
    }
  }, [activeTour]);

  const nextStep = useCallback(() => {
    if (!activeTour) return;
    if (currentStepIndex < activeTour.steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      endTour(true);
    }
  }, [activeTour, currentStepIndex, endTour]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

  const currentStep = activeTour?.steps[currentStepIndex] || null;

  return (
    <TourContext.Provider
      value={{
        activeTour,
        currentStepIndex,
        currentStep,
        startTour,
        nextStep,
        prevStep,
        endTour,
        dismissTour,
        completedTourIds,
      }}
    >
      {children}
      {activeTour && currentStep && (
        <TourSpotlightOverlay
          tour={activeTour}
          step={currentStep}
          stepIndex={currentStepIndex}
          totalSteps={activeTour.steps.length}
          onNext={nextStep}
          onPrev={prevStep}
          onClose={() => endTour(false)}
        />
      )}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    return {
      activeTour: null,
      currentStepIndex: 0,
      currentStep: null,
      startTour: async () => {},
      nextStep: () => {},
      prevStep: () => {},
      endTour: () => {},
      dismissTour: () => {},
      completedTourIds: [],
    };
  }
  return ctx;
}

function TourSpotlightOverlay({
  tour,
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onClose,
}: {
  tour: InteractiveTour;
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    let animId: number;
    const updateTarget = () => {
      const el = document.querySelector(step.target);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
      animId = requestAnimationFrame(updateTarget);
    };
    updateTarget();
    return () => cancelAnimationFrame(animId);
  }, [step.target]);

  const isLast = stepIndex === totalSteps - 1;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        pointerEvents: 'auto',
      }}
    >
      {/* Dimmed backdrop with cut-out */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(2px)',
          pointerEvents: 'none',
        }}
      />

      {/* Target Highlight Box */}
      {targetRect && (
        <div
          style={{
            position: 'absolute',
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            borderRadius: 8,
            boxShadow: '0 0 0 4px var(--teal, #0b7264), 0 0 0 9999px rgba(15, 23, 42, 0.65)',
            pointerEvents: 'none',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 1000000,
          }}
        />
      )}

      {/* Tour Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        style={{
          position: 'absolute',
          top: targetRect ? Math.min(window.innerHeight - 240, Math.max(20, targetRect.bottom + 16)) : '40%',
          left: targetRect ? Math.min(window.innerWidth - 380, Math.max(20, targetRect.left)) : '50%',
          transform: targetRect ? 'none' : 'translate(-50%, -50%)',
          width: 360,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--white, #fff)',
          borderRadius: 14,
          boxShadow: '0 20px 40px -8px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.1)',
          padding: '20px 22px',
          boxSizing: 'border-box',
          zIndex: 1000001,
          fontFamily: 'var(--font, sans-serif)',
          color: 'var(--ink, #0f172a)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--teal, #0b7264)' }}>
            {tour.title} · Step {stepIndex + 1} of {totalSteps}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Exit tour"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink3, #64748b)',
              padding: 4,
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 700, color: 'var(--ink, #0f172a)' }}>
          {step.title}
        </h3>
        <p style={{ margin: '0 0 16px 0', fontSize: 13, lineHeight: 1.55, color: 'var(--ink2, #334155)' }}>
          {step.content}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border, #e2e8f0)' }}>
          <button
            type="button"
            onClick={onPrev}
            disabled={stepIndex === 0}
            style={{
              background: 'transparent',
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: stepIndex === 0 ? 'var(--ink4, #cbd5e1)' : 'var(--ink, #0f172a)',
              cursor: stepIndex === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Back
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                color: 'var(--ink3, #64748b)',
                cursor: 'pointer',
              }}
            >
              Skip
            </button>
            <button
              type="button"
              onClick={onNext}
              style={{
                background: 'var(--teal, #0b7264)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '6px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              }}
            >
              {isLast ? 'Finish Tour' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
