import React from 'react';

interface CompanyCardProps {
  company: any;
  onEdit: () => void;
  onDelete: () => void;
}

export const CompanyCard: React.FC<CompanyCardProps> = ({ company, onEdit, onDelete }) => {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '9px',
        padding: '16px',
        backdropFilter: 'blur(8px)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{company.name}</h3>
        <p style={{ margin: '4px 0', fontSize: '0.9rem', opacity: 0.8 }}>
          {company.address}
        </p>
        <p style={{ margin: '4px 0', fontSize: '0.85rem', opacity: 0.7 }}>
          Subscription: {company.subscriptionPlan || 'Free'}
        </p>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
        <button
          onClick={onEdit}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            border: 'none',
            padding: '6px',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          style={{
            flex: 1,
            background: 'rgba(255,0,0,0.2)',
            color: '#fff',
            border: 'none',
            padding: '6px',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
};
