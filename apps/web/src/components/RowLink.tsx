import { Link } from 'react-router-dom';

/**
 * Makes an entire row/card a real, ctrl/cmd/middle-clickable link without
 * nesting an <a> around interactive children (invalid HTML, breaks clicks).
 * Render as the FIRST child of a `position: relative` row/card — later
 * siblings (buttons) paint on top and stay independently clickable.
 */
export function RowLink({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  return (
    <Link to={to} aria-label={label} onClick={onClick} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
  );
}
