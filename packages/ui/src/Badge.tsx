import React from 'react';

export interface BadgeProps {
  variant?: 'teal' | 'gold' | 'red' | 'green' | 'blue' | 'purple' | 'grey';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'grey', children, className = '' }) => {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {children}
    </span>
  );
};
