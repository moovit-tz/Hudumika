import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { SEAL_DECLARATION_STATUS_VARIANT } from '../lib/sealStatus.js';
import { SEAL_DECLARATION_STATUS_LABELS, SEAL_DECLARATION_PROCEDURE_LABELS, type SealDeclarationStatus } from '@hudumika/types';
import './Seal.css';

interface Declaration {
  id: string; lotDescription?: string; procedureCode: string; declarationDate: string;
  hsCode: string; status: SealDeclarationStatus; computation: { totalPayableLocal: number } | null;
  currency: string; submissionReference: string | null;
}

const STATUS_ALL = '__all__';

export function SealDeclarations() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(STATUS_ALL);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== STATUS_ALL) params.set('status', status);
    apiFetch(`/v1/seal/customs-entries?${params.toString()}`).then(setEntries).finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <h1 className="seal-page-title">Declarations</h1>
          <p className="seal-page-sub">Ex-warehouse customs declarations — every duty figure traces back to a stored HS code lookup, never a bare total.</p>
        </div>
        <button type="button" className="seal-btn-primary" onClick={() => navigate('/seal/declarations/new')}>
          <Icon name="plus" size={14} />
          <span>New Declaration</span>
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="input-field" style={{ width: 220 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ALL}>All statuses</SelectItem>
            {Object.entries(SEAL_DECLARATION_STATUS_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <div className="seal-empty">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="seal-empty">No declarations match these filters.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Procedure</th>
                  <th>HS Code</th>
                  <th>Declaration Date</th>
                  <th>Payable</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} onClick={() => navigate(`/seal/declarations/${e.id}`)}>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{e.lotDescription ?? '—'}</td>
                    <td>{SEAL_DECLARATION_PROCEDURE_LABELS[e.procedureCode] ?? e.procedureCode}</td>
                    <td className="seal-mono">{e.hsCode}</td>
                    <td>{new Date(e.declarationDate).toLocaleDateString()}</td>
                    <td>{e.computation ? `${e.computation.totalPayableLocal.toLocaleString()} ${e.currency}` : '—'}</td>
                    <td><Badge variant={SEAL_DECLARATION_STATUS_VARIANT[e.status]}>{SEAL_DECLARATION_STATUS_LABELS[e.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
