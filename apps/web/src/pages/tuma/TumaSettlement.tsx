import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';

interface Beneficiary {
  id: string;
  name: string;
  bank_name: string | null;
  account_number: string | null;
  mobile_number: string | null;
  created_at: string;
}

export function TumaSettlement() {
  const [rows, setRows] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/tuma/settlement')
      .then(r => setRows(r.beneficiaries))
      .catch(e => showAlert(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Tuma', 'Finance']}
        titlePlain="Beneficiary"
        titleEm="settlement"
        subtitle="Revenue-share recipients, deduction schedules and settlement history."
      />
      <SectionCard title="Beneficiaries" collapsible={false}>
        {loading ? <SectionLoading /> : rows.length === 0 ? (
          <p style={{ padding: 24, color: 'var(--ink2)', textAlign: 'center' }}>No beneficiaries registered yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>Name</th><th>Bank</th><th>Account No.</th><th>Mobile</th>
              </tr></thead>
              <tbody>
                {rows.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 500 }}>{b.name}</td>
                    <td>{b.bank_name || '—'}</td>
                    <td>{b.account_number || '—'}</td>
                    <td>{b.mobile_number || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
