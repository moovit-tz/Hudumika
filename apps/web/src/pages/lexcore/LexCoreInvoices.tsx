import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { formatDate } from '../../lib/tenantLocale.js';
import './LexCore.css';

const INV_V: Record<string, 'info' | 'brand' | 'success' | 'warning' | 'error' | 'gray'> = {
  draft: 'gray', sent: 'info', paid: 'success', overdue: 'error', cancelled: 'gray',
};

interface Invoice { id: string; invoice_number: string; client_name?: string; amount: number; status: string; created_at: string; }

export function LexCoreInvoices() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/lexcore/invoices').then(d => setRows(d.invoices ?? [])).finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['LexCore', 'Finance']}
        titlePlain="Legal"
        titleEm="invoices"
        subtitle="Pre-bill review, invoice issuance, WHT calculation and TRA VFD fiscal receipts."
      />

      {loading ? <SectionLoading /> : (
        <SectionCard padded={false}>
          {rows.length === 0 ? <div className="lc-empty">No invoices issued.</div> : (
            <table className="lc-table">
              <thead><tr><th>Invoice #</th><th>Client</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {rows.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{inv.invoice_number}</td>
                    <td>{inv.client_name || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(inv.amount)}</td>
                    <td><Badge variant={INV_V[inv.status] ?? 'gray'}>{inv.status}</Badge></td>
                    <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{formatDate(inv.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}
    </div>
  );
}
