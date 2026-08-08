import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon.js';

interface BackButtonProps {
  /** The destination path if this is a route link. Mutually exclusive with onClick. */
  to?: string;
  /** The click handler if this is a programmatic action. Mutually exclusive with to. */
  onClick?: () => void;
  /** The text to display next to the back arrow */
  label: string;
  /** Override the color. Defaults to var(--app-color, var(--teal)) */
  color?: string;
}

export function BackButton({ to, onClick, label, color = 'var(--app-color, var(--teal))' }: BackButtonProps) {
  const style: React.CSSProperties = { 
    fontSize: 12, 
    color, 
    fontWeight: 600, 
    textDecoration: 'none', 
    display: 'inline-flex', 
    alignItems: 'center', 
    gap: 4, 
    marginBottom: 16, 
    cursor: 'pointer',
    background: 'transparent', 
    border: 'none', 
    padding: 0
  };

  if (to) {
    return (
      <Link to={to} style={style}>
        <Icon name="arrowLeft" size={12} /> {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} style={style}>
      <Icon name="arrowLeft" size={12} /> {label}
    </button>
  );
}
