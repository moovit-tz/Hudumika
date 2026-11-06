import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TaneswTrackingResult } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { TanzaniaTracking } from '../components/TanzaniaTracking.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { ButtonSpinner } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

function readHistory(key: string): string[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function CustomsTracker() {
  const { user } = useAuth();
  const historyKey = user ? `hudumika_customs_history:${user.tenant_id}:${user.id}` : '';
  const [history, setHistory] = useState<string[]>(() => historyKey ? readHistory(historyKey) : []);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialBl = searchParams.get('bl') || searchParams.get('q') || '';

  const [bill, setBill] = useState(initialBl);
  const [result, setResult] = useState<TaneswTrackingResult | null>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);

  const executeTrack = useCallback(async (targetNumber: string) => {
    const cleanNumber = targetNumber.replace(/\s/g, '').toUpperCase();
    if (!cleanNumber || pending.current) return;
    pending.current = true;

    setLoading(true);
    setError('');
    setResult(undefined);

    // Update URL query param so search is shareable/reproducible
    setSearchParams({ bl: cleanNumber }, { replace: true });

    try {
      const data = await apiFetch<{ result: TaneswTrackingResult | null }>('/v1/tracker/tanzania', {
        method: 'POST',
        body: JSON.stringify({ number: cleanNumber }),
      });
      setResult(data.result);
      if (data.result && historyKey) {
        const next = [cleanNumber, ...readHistory(historyKey).filter(number => number !== cleanNumber)].slice(0, 8);
        setHistory(next);
        try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* Browser storage can be unavailable. */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'TRA TANESW lookup failed.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }, [historyKey, setSearchParams]);

  useEffect(() => {
    setHistory(historyKey ? readHistory(historyKey) : []);
  }, [historyKey]);

  // Handle manual form submission
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bill.trim()) return;
    executeTrack(bill);
  }

  // Auto-track on initial mount if param is provided
  useEffect(() => {
    if (initialBl && !result && !loading) {
      executeTrack(initialBl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <PageHeader
        crumbs={['Cargo Tracker', 'Customs Tracker']}
        titlePlain="Customs & Port"
        titleEm="Tracker"
        subtitle="Track Tanzania customs clearance, ICD transfers, and gate-out records."
      />

      <SectionCard title="Find a consignment" collapsible={false}>
        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-xl">
            <Label htmlFor="customs-bill" className="text-xs font-semibold text-(--ink)">
              Bill of lading
            </Label>
            <div className="relative">
              <Input
                id="customs-bill"
                placeholder="Enter a master or house B/L"
                value={bill}
                onChange={event => setBill(event.target.value)}
                disabled={loading}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={64}
                required
                className="min-h-11 w-full pr-12 text-base"
              />
              {bill && !loading && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setBill('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  aria-label="Clear bill of lading"
                >
                  <Icon name="x" size={16} />
                </Button>
              )}
            </div>
          </div>

          <Button type="submit" disabled={loading || !bill.trim()} className="min-h-11 w-full gap-2 sm:w-auto">
            {loading ? <ButtonSpinner /> : <Icon name="search" size={15} />}
            <span>{loading ? 'Checking TRA…' : result && bill.trim().toUpperCase() === result.billOfLading ? 'Refresh tracking' : 'Track consignment'}</span>
          </Button>
        </form>

        <p className="mt-3 text-sm text-(--ink2)">For consolidated cargo, use the house bill of lading.</p>
        {history.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-(--border) pt-3">
            <span className="text-sm font-medium">Recent searches</span>
            {history.map(number => (
              <Button key={number} type="button" variant="outline" size="sm" disabled={loading} onClick={() => {
                setBill(number);
                void executeTrack(number);
              }}>{number}</Button>
            ))}
          </div>
        )}
      </SectionCard>

      <TanzaniaTracking result={result} error={error} loading={loading} />
    </div>
  );
}
