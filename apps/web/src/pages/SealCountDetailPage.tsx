import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import type { SealCountDetail } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { Banner } from '../components/ui/alert.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { showConfirm } from '../lib/confirm.js';
import './Seal.css';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RECONCILING: 'Reconciling',
  CLOSED: 'Closed & Reconciled',
  CANCELLED: 'Cancelled',
};

const STATUS_VARIANT: Record<string, 'brand' | 'gray'> = {
  OPEN: 'gray',
  IN_PROGRESS: 'brand',
  RECONCILING: 'brand',
  CLOSED: 'brand',
  CANCELLED: 'gray',
};

export function SealCountDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [count, setCount] = useState<SealCountDetail | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0); // 0 = count, 1 = review variances
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/v1/seal/cycle-counts/${id}`)
      .then(data => {
        if (!active) return;
        setCount(data);
        setValues(
          Object.fromEntries(
            data.lines.map((l: any) => [l.id, l.countedQty == null ? '' : String(l.countedQty)])
          )
        );
        setError(null);
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, version]);

  async function act(action: 'save' | 'reconcile' | 'cancel') {
    if (!count) return;

    if (action === 'cancel') {
      const ok = await showConfirm(
        'Are you sure you want to cancel this count? Un-reconciled lines will be discarded.',
        { title: 'Cancel Count', confirmLabel: 'Cancel Count' }
      );
      if (!ok) return;
    }

    setBusy(true);
    setError(null);
    try {
      if (action === 'save') {
        for (const line of count.lines) {
          const value = values[line.id];
          if (
            value == null ||
            value.trim() === '' ||
            !Number.isFinite(Number(value)) ||
            Number(value) < 0
          ) {
            throw Error('Enter a valid non-negative quantity for every lot.');
          }
        }
        for (const line of count.lines) {
          await apiFetch(`/v1/seal/cycle-counts/${id}/lines/${line.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ countedQty: Number(values[line.id]) }),
          });
        }
        setStage(1);
      } else {
        await apiFetch(`/v1/seal/cycle-counts/${id}/${action}`, { method: 'POST' });
      }
      setVersion(v => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Count update failed.');
    } finally {
      setBusy(false);
    }
  }

  const closed = count && ['CLOSED', 'CANCELLED'].includes(count.status);
  const totalLines = count?.lines.length ?? 0;
  const countedLines = count?.lines.filter(l => l.countedQty != null).length ?? 0;
  const varianceLines = count?.lines.filter(l => (l.varianceQty ?? 0) !== 0).length ?? 0;

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={[
          { label: 'SEAL', to: '/seal' },
          { label: 'Counts & Adjustments', to: '/seal/adjustments' },
          count?.count_ref ?? 'Count Detail',
        ]}
        titlePlain="Physical stock"
        titleEm="count"
        subtitle={
          count ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>
                Reference: <strong style={{ color: 'var(--ink)' }}>{count.count_ref}</strong>
              </span>
              {count.notes && <span>· {count.notes}</span>}
            </span>
          ) : undefined
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/seal/adjustments')}>
              <Icon name="arrowLeft" size={14} />
              <span>All Counts</span>
            </Button>
          </div>
        }
      />

      {error && <Banner variant="error">{error}</Banner>}

      {loading ? (
        <SectionLoading label="Loading count details…" />
      ) : count ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status and Progress Card */}
          <div className="seal-card" style={{ padding: 20 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  className="seal-strip"
                  style={{
                    height: 32,
                    margin: 0,
                    background: count.status === 'CLOSED' ? 'var(--teal)' : 'var(--ink3)',
                  }}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h2 className="seal-entity-title" style={{ margin: 0 }}>{count.count_ref}</h2>
                    <Badge variant={STATUS_VARIANT[count.status] ?? 'gray'}>
                      {STATUS_LABELS[count.status] ?? count.status}
                    </Badge>
                  </div>
                  <div className="seal-mono" style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                    Initiated {new Date(count.initiated_at).toLocaleDateString()}
                    {count.closed_at ? ` · Closed ${new Date(count.closed_at).toLocaleDateString()}` : ''}
                  </div>
                </div>
              </div>

              {/* Stats badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>
                    Lots in Scope
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
                    {totalLines}
                  </div>
                </div>
                <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>
                    Discrepancies
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: varianceLines > 0 ? 'var(--teal)' : 'var(--ink)' }}>
                    {varianceLines}
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Workflow Progress Steps */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: 'var(--card-sunken, var(--bg))',
                borderRadius: 'var(--r)',
                border: '1px solid var(--border)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {[
                { step: 0, label: '1. Count Stock Quantities' },
                { step: 1, label: '2. Review Variances' },
                { step: 2, label: '3. Reconcile & Post' },
              ].map((s, idx) => {
                const currentStep = closed ? 2 : stage;
                const isActive = currentStep === s.step;
                const isPassed = currentStep > s.step;
                return (
                  <React.Fragment key={s.step}>
                    {idx > 0 && <span style={{ color: 'var(--ink3)' }}>→</span>}
                    <span
                      style={{
                        color: isActive ? 'var(--teal)' : isPassed ? 'var(--ink)' : 'var(--ink3)',
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      {s.label}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {closed && (
            <Banner variant={count.status === 'CLOSED' ? 'success' : 'warning'}>
              {count.status === 'CLOSED'
                ? 'Cycle count reconciled successfully. All variances were posted to the immutable movement ledger.'
                : 'This cycle count was cancelled.'}
            </Banner>
          )}

          {/* Lines Table Card */}
          <div className="seal-card">
            <div className="seal-card-hdr">
              <div>
                <h3 className="seal-card-title">Lot Breakdown & Verification</h3>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                  {stage === 0 && !closed
                    ? 'Enter the physical on-hand quantity observed for each lot below.'
                    : 'Review recorded balance vs. counted quantity before posting reconciliation adjustments.'}
                </div>
              </div>
            </div>

            <div className="seal-card-body">
              <table className="seal-table">
                <thead>
                  <tr>
                    <th>Lot / Description</th>
                    <th style={{ textAlign: 'right' }}>Recorded Qty</th>
                    <th style={{ width: 180, textAlign: 'right' }}>Physical Count</th>
                    <th style={{ textAlign: 'right' }}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {count.lines.map(l => (
                    <tr key={l.id}>
                      <td>
                        <Link
                          className="font-semibold underline"
                          style={{ color: 'var(--ink)', textDecoration: 'none' }}
                          to={`/seal/lots/${l.lotId}`}
                        >
                          {l.description}
                        </Link>
                        <div className="seal-mono" style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                          ID: {l.lotId.slice(0, 8).toUpperCase()}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {l.systemQty.toLocaleString()} {l.uom}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {stage === 0 && !closed ? (
                          <Input
                            aria-label={`Counted quantity for ${l.description}`}
                            type="number"
                            min="0"
                            step="any"
                            value={values[l.id] ?? ''}
                            onChange={e => setValues(v => ({ ...v, [l.id]: e.target.value }))}
                            placeholder="0"
                            style={{ textAlign: 'right' }}
                          />
                        ) : (
                          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            {l.countedQty != null ? `${l.countedQty.toLocaleString()} ${l.uom}` : 'Not counted'}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {l.varianceQty != null && l.varianceQty !== 0 ? (
                          <Badge variant="brand">
                            {l.varianceQty > 0 ? `+${l.varianceQty.toLocaleString()}` : l.varianceQty.toLocaleString()}{' '}
                            {l.uom}
                          </Badge>
                        ) : (
                          <span style={{ color: 'var(--ink3)', fontSize: 12 }}>
                            {l.varianceQty === 0 ? '0' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions Toolbar */}
            {!closed && (
              <div
                style={{
                  padding: '16px 20px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <Button variant="outline" size="sm" disabled={busy} onClick={() => act('cancel')}>
                  Cancel Count
                </Button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {stage > 0 && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => setStage(0)}>
                      Back to Edit Counts
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={busy || !count.lines.length}
                    onClick={() => act(stage === 0 ? 'save' : 'reconcile')}
                  >
                    {busy
                      ? 'Processing…'
                      : stage === 0
                      ? 'Review Variances'
                      : 'Reconcile & Post Adjustments'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
