import React, { useState } from 'react';
import type { CustomerShipmentGroup, ShipmentCase } from '@hudumika/types';
import { ShipmentRow } from './ShipmentRow.js';
import { Icon } from './Icon.js';

interface CustomerGroupProps {
  group: CustomerShipmentGroup;
  shipmentHref: (shipment: ShipmentCase) => string;
}

export const CustomerGroup: React.FC<CustomerGroupProps> = ({ group, shipmentHref }) => {
  const [isOpen, setIsOpen] = useState(true);

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
        {/* Collapse Chevron Arrow */}
        <span
          className={`ch-chevron ${isOpen ? 'open' : ''}`}
          style={{
            display: 'inline-block',
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          ▶
        </span>

        {/* Customer Avatar */}
        <div
          className="ch-ava"
          style={{
            backgroundColor: group.customer.avatar_color || 'var(--teal)',
          }}
        >
          {group.customer.avatar_initials || '??'}
        </div>

        {/* Customer Name */}
        <div className="ch-name" style={{ fontWeight: 600 }}>
          {group.customer.name}
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
