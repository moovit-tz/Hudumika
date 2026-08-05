import React, { useState, useEffect } from 'react';
import { SubscriptionSelector } from './SubscriptionSelector.jsx';

export const CompanyForm = ({ initialData = null, onClose, onSubmit }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [address, setAddress] = useState(initialData?.billing_address || '');
  const [plan, setPlan] = useState(initialData?.plan || 'Free');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [email, setEmail] = useState(initialData?.email || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { name, billing_address: address, plan, phone, email };
    onSubmit(data);
  };

  // Simple overlay styling
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'rgba(15,32,48,0.95)',
          padding: '24px',
          borderRadius: '9px',
          width: '320px',
          color: '#fff',
          backdropFilter: 'blur(8px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: '16px' }}>{initialData ? 'Edit Company' : 'New Company'}</h2>
        <label style={{ display: 'block', marginBottom: '8px' }}>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: '100%', marginTop: '4px' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '8px' }}>
          Address
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ width: '100%', marginTop: '4px' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '8px' }}>
          Phone
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: '100%', marginTop: '4px' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '8px' }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', marginTop: '4px' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '12px' }}>
          Subscription Plan
          <SubscriptionSelector value={plan} onChange={setPlan} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: '1px solid #fff', color: '#fff', padding: 'var(--ds-btn-py-sm) 12px', borderRadius: '4px', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
            Cancel
          </button>
          <button type="submit" style={{ background: 'var(--teal)', border: 'none', color: '#fff', padding: 'var(--ds-btn-py-sm) 12px', borderRadius: '4px', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {initialData ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
};
