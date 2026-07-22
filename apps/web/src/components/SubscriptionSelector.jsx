import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';

export const SubscriptionSelector = ({ value, onChange }) => {
  const plans = ['Free', 'Basic', 'Pro', 'Enterprise'];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="border-0 bg-white/10 text-white hover:border-0 focus:ring-white/40 data-[placeholder]:text-white/70"
        style={{ width: '100%', marginTop: '4px' }}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {plans.map((plan) => (
          <SelectItem key={plan} value={plan}>{plan}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
