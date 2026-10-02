import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import './Seal.css';

export function SealStorageInvoices() {
  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Billing', 'Storage Invoices']}
        titlePlain="Storage"
        titleEm="invoices"
        subtitle="Generate and manage storage billing for lots and consignments held in your warehouses."
      />
      <div className="seal-card">
        <div className="seal-card-body" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ink3)' }}>
          <div style={{ marginBottom: 12, opacity: 0.4 }}>
            <Icon name="fileText" size={40} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Storage invoicing coming soon</div>
          <div style={{ fontSize: 13 }}>Automatic tariff-based billing will be available here in a future update.</div>
        </div>
      </div>
    </div>
  );
}
