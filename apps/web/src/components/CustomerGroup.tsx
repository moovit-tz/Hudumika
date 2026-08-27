import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CustomerShipmentGroup, ShipmentCase } from '@hudumika/types';
import { ShipmentRow } from './ShipmentRow.js';
import { Icon } from './Icon.js';
import { CompanyAvatar } from './PersonAvatar.js';

interface CustomerGroupProps {
  group: CustomerShipmentGroup;
  shipmentHref: (shipment: ShipmentCase) => string;
}

export const CustomerGroup: React.FC<CustomerGroupProps> = ({ group, shipmentHref }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="cust-group" style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        className="cust-header"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 16px',
          background: 'var(--bg)',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Collapse toggle. Was a bare ▶ glyph — a text character, so its
            weight and baseline came from the font rather than the icon set
            every other control here uses. Now the same chevron as the rest of
            the app, in a proper hit target that shows it is pressable. */}
        <span
          className={`ch-chevron ${isOpen ? 'open' : ''}`}
          role="button"
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse customer' : 'Expand customer'}
        >
          <Icon name="chevronRight" size={13} strokeWidth={2.4} />
        </span>

        {/* Customer Avatar — the real CRM logo when the company has one, else
            the derived initials on the brand colour. */}
        <CompanyAvatar name={group.customer.name} logoUrl={group.customer.logo_url} size={34} shape="circle" />

        {/* Customer name → CRM profile, with the CRM category/location under it. */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Link
            to={`/crm/customers?id=${group.customer.id}`}
            onClick={(e) => e.stopPropagation()}
            title="Open in CRM"
            className="ch-name"
            style={{ fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            {group.customer.name}
          </Link>
          {(group.customer.category || group.customer.city) && (
            <span style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[group.customer.category, group.customer.city].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        {/* Risk Indicators */}
        <div className="ch-tags">
          {group.urgent_count > 0 && (
            <span className="ch-tag ct-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="alertCircle" size={11} /> {group.urgent_count} Demurrage Risk
            </span>
          )}
          {group.action_count > 0 && (
            <span className="ch-tag ct-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="alertTriangle" size={11} /> {group.action_count} Action Needed
            </span>
          )}
          <span className="ch-tag ct-def" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="package" size={11} /> {group.shipment_count} Active
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="ship-list open">
          {group.shipments.map((shipment) => (
            <ShipmentRow
              key={shipment.id}
              shipment={shipment}
              to={shipmentHref(shipment)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
