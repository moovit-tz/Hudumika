import React from 'react';

export const SubscriptionSelector = ({ value, onChange }) => {
  const plans = ['Free', 'Basic', 'Pro', 'Enterprise'];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        marginTop: '4px',
        background: 'rgba(255,255,255,0.12)',
        color: '#fff',
        border: 'none',
        padding: '6px',
        borderRadius: '4px',
      }}
    >
      {plans.map((plan) => (
        <option key={plan} value={plan} style={{ background: '#0e1f3d', color: '#fff' }}>
          {plan}
        </option>
      ))}
    </select>
  );
};
