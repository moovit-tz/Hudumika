import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale.js';
import { BackButton } from './ui/BackButton.js';

/** A crumb is a bare label, or a label with an explicit destination when the
 *  one derived from the URL would be wrong. */
export type Crumb = string | { label: string; to?: string };

interface PageHeaderProps {
  /** e.g. ['Finance', 'Dashboard'] → "Finance / Dashboard" */
  crumbs: Crumb[];
  /** Plain part before the italic word, e.g. "Finance" */
  titlePlain?: string;
  /** Italic brand-colored word, e.g. "overview" */
  titleEm?: string;
  /**
   * A whole title to split on its last word, for pages whose title is only
   * known at runtime — a task view's name, a CMS page's name, a shipment's
   * own title. Prefer titlePlain/titleEm for static titles: the split is a
   * guess, and a one-word value leaves nothing to pair the italic against.
   */
  title?: string;
  /** Optional subtitle. ReactNode, not string: several pages need a link or
   *  an emphasised value inside the sentence. */
  subtitle?: React.ReactNode;
  /** Optional right-side slot (buttons, date chip, etc.) */
  actions?: React.ReactNode;
  /** Create/edit flows use a quieter, plain title with Back as the first row. */
  variant?: 'brand' | 'create';
  backTo?: string;
  backLabel?: string;
  onBack?: () => void;
  /** Optional live telemetry status badge (e.g. "Live") */
  liveStatus?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  crumbs,
  titlePlain,
  titleEm,
  title,
  subtitle,
  actions,
  variant = 'brand',
  backTo,
  backLabel = 'Back',
  onBack,
  liveStatus,
}) => {
  // An explicit split always wins; `title` is the runtime fallback.
  let plain = titlePlain ?? '';
  let em = titleEm ?? '';
  if (!titleEm && title) {
    const words = title.trim().split(/\s+/);
    em = (words.length > 1 ? words.pop()! : title).toLowerCase();
    plain = words.join(' ');
  }

  const { language } = useLocale();
  const nonLatin = language === 'ar' || language === 'zh';
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  function hrefFor(c: Crumb, i: number): string | null {
    if (typeof c !== 'string' && c.to) return c.to;
    if (i >= crumbs.length - 1) return null;      // current page
    if (i >= segments.length - 1) return null;    // would be the current path
    return '/' + segments.slice(0, i + 1).join('/');
  }

  return (
    <div className={`page-header${variant === 'create' ? ' page-header--create' : ''}`}>
      {variant === 'create' && (backTo || onBack) && (
        <BackButton to={backTo} onClick={onBack} label={backLabel} color="var(--ink2)" />
      )}
      
      {/* DreamsCore breadcrumb — "Parent / Current page" */}
      {variant !== 'create' && (
        <div className="page-header-crumb">
          {crumbs.map((c, i) => {
            const label = typeof c === 'string' ? c : c.label;
            const href = hrefFor(c, i);
            const isLast = i === crumbs.length - 1;
            return (
              <React.Fragment key={label}>
                {i > 0 && <span className="page-header-crumb-sep">/</span>}
                {href
                  ? <Link to={href} className="page-header-crumb-link">{label}</Link>
                  : <span className={isLast ? 'page-header-crumb-current' : ''}>{label}</span>}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Title row */}
      <div className="page-header-main-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {variant === 'create' ? (
            <h1 className="page-header-title page-header-title--create">{[plain, em].filter(Boolean).join(' ')}</h1>
          ) : (
            <h1 className={`page-header-title${nonLatin ? ' ph-cjk' : ''}`}>
              {plain}{plain && em ? ' ' : ''}<span className="ph-em">{em}</span>
            </h1>
          )}
          {liveStatus && (
            <span className="page-header-live-badge">
              <span className="page-header-live-dot" />
              {liveStatus}
            </span>
          )}
        </div>
        {actions && <div className="page-header-actions-wrap" style={{ flexShrink: 0, minWidth: 0, maxWidth: '100%' }}>{actions}</div>}
      </div>

      {/* Subtitle */}
      {subtitle && <p className="page-header-sub">{subtitle}</p>}
    </div>
  );
};
