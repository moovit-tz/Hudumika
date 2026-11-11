import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CrmChainPartners } from './CrmChainPartners.js';
import { CrmVendors } from './CrmVendors.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { useAuth } from '../hooks/useAuth.js';

const VENDOR_WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'];

export function CrmBusinessRelationships() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const view = searchParams.get('view') === 'vendors' ? 'vendors' : 'partners';
  const canAddVendor = VENDOR_WRITE_ROLES.includes(user?.role ?? '');

  function selectView(val: string) {
    const next = new URLSearchParams(searchParams);
    next.set('view', val);
    setSearchParams(next);
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        crumbs={['CRM', 'Business relationships']}
        titlePlain="Business"
        titleEm="relationships"
        subtitle="Manage logistics partners, freight carriers, ICD/CFS operators, and suppliers shared across CRM and Finance."
        actions={
          <div className="flex items-center gap-2">
            {view === 'vendors' && canAddVendor ? (
              <Button asChild variant="default" className="gap-1.5">
                <Link to="/crm/relationships/vendors/new">
                  <Icon name="plus" size={14} />
                  <span>Add vendor</span>
                </Link>
              </Button>
            ) : view === 'partners' ? (
              <Button asChild variant="default" className="gap-1.5">
                <Link to="/crm/relationships/partners/new">
                  <Icon name="plus" size={14} />
                  <span>Add partner</span>
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Styled Segmented Filter / Tab Bar */}
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div className="inline-flex rounded-xl p-1 bg-muted/50 border border-border/60">
          <button
            type="button"
            onClick={() => selectView('partners')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              view === 'partners'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="link" size={14} className={view === 'partners' ? 'text-primary' : ''} />
            <span>Partners & Facilities</span>
          </button>
          <button
            type="button"
            onClick={() => selectView('vendors')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              view === 'vendors'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="building" size={14} className={view === 'vendors' ? 'text-primary' : ''} />
            <span>Vendors & Suppliers</span>
          </button>
        </div>
      </div>

      <div>
        {view === 'partners' ? (
          <CrmChainPartners embedded />
        ) : (
          <CrmVendors embedded />
        )}
      </div>
    </div>
  );
}
