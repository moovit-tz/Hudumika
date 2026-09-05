import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { apiFetch } from '../../lib/api.js';
import { SEAL_DECLARATION_STATUS_LABELS, SEAL_DECLARATION_PROCEDURE_LABELS, type SealDeclarationStatus } from '@hudumika/types';

interface Declaration {
  id: string; lotDescription?: string; procedureCode: string; declarationDate: string;
  hsCode: string; status: SealDeclarationStatus; computation: { totalPayableLocal: number } | null;
  currency: string;
}

const STATUS_VARIANT: Record<SealDeclarationStatus, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  DRAFT: 'gray', SUBMITTED: 'info', QUERIED: 'warning', ASSESSED: 'brand', PAID: 'success', RELEASED: 'success', CANCELLED: 'error',
};
const STATUS_ALL = '__all__';

export function SealExWarehouseEntries() {
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
    <div style={{ padding: '0 0 24px'}}>
      <PageHeader
        crumbs={['ClearOS', 'Ops Command']}
        titlePlain="Ex-Warehouse"
        titleEm="Declarations"
        subtitle="Customs declarations releasing bonded SEAL lots for home use, re-export, or transfer — every duty figure traces to a stored tariff lookup."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate('/seal/ex-warehouse/new')}>
            <Icon name="plus" size={14} /> New Declaration
          </button>
        }
      />

      <div style={{ display: 'flex', gap: 10, margin: '16px 0' }}>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="input-field" style={{ width: 220 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ALL}>All statuses</SelectItem>
            {Object.entries(SEAL_DECLARATION_STATUS_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <SectionLoading />
        ) : entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No declarations match these filters.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Lot', 'Procedure', 'HS Code', 'Declaration Date', 'Payable', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => navigate(`/seal/ex-warehouse/${e.id}`)}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--ink)' }}>{e.lotDescription ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}>{SEAL_DECLARATION_PROCEDURE_LABELS[e.procedureCode] ?? e.procedureCode}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}>{e.hsCode}</td>
                  <td style={{ padding: '12px 16px' }}>{new Date(e.declarationDate).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 16px' }}>{e.computation ? `${e.computation.totalPayableLocal.toLocaleString()} ${e.currency}` : '—'}</td>
                  <td style={{ padding: '12px 16px' }}><Badge variant={STATUS_VARIANT[e.status]}>{SEAL_DECLARATION_STATUS_LABELS[e.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
