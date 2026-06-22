import React from 'react';

export interface CardProps {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ className = '', children, onClick }) => {
  return (
    <div className={`card ${onClick ? 'card-interactive' : ''} ${className}`} onClick={onClick}>
      {children}
    </div>
  );
};
