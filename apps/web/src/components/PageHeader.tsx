import React from 'react';
import { Link, useLocation } from 'react-router-dom';

/** A crumb is a bare label, or a label with an explicit destination when the
 *  one derived from the URL would be wrong. */
export type Crumb = string | { label: string; to?: string };

interface PageHeaderProps {
  /** e.g. ['Finance', 'Dashboard'] → "FINANCE · DASHBOARD" */
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
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  crumbs,
  titlePlain,
  titleEm,
  title,
  subtitle,
  actions,
}) => {
  // An explicit split always wins; `title` is the runtime fallback.
  let plain = titlePlain ?? '';
  let em = titleEm ?? '';
  if (!titleEm && title) {
    const words = title.trim().split(/\s+/);
    em = (words.length > 1 ? words.pop()! : title).toLowerCase();
    plain = words.join(' ');
  }
  /**
   * Crumbs carry no path of their own — 153 call sites pass bare strings —
   * so a destination is derived from the URL: crumb i maps to the first i+1
   * segments of the current path.
   *
   * That is only sound when the crumbs line up with the segments, and often
   * they do not: ['ClearOS','Compliance','Overview'] is three crumbs over the
   * two segments of /clearos/compliance. So a crumb is only linked when its
   * derived path is a genuine prefix of where we already are — a path the
   * router demonstrably resolves, because we are standing on it. Anything
   * else stays plain text rather than becoming a link to nowhere.
   *
   * The last crumb is never a link: it is the page you are on.
   */
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  function hrefFor(c: Crumb, i: number): string | null {
    if (typeof c !== 'string' && c.to) return c.to;
    if (i >= crumbs.length - 1) return null;      // current page
    if (i >= segments.length - 1) return null;    // would be the current path
    return '/' + segments.slice(0, i + 1).join('/');
  }

  return (
  <div className="page-header">
    {/* Breadcrumb */}
    <div className="page-header-crumb">
      {crumbs.map((c, i) => {
        const label = typeof c === 'string' ? c : c.label;
        const href = hrefFor(c, i);
        return (
          <React.Fragment key={label}>
            {i > 0 && <span className="page-header-crumb-sep">·</span>}
            {href
              ? <Link to={href} className="page-header-crumb-link">{label}</Link>
              : <span>{label}</span>}
          </React.Fragment>
        );
      })}
    </div>

    {/* Title row */}
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <h1 className="page-header-title">
        {plain} <em>{em}</em><span className="ph-dot">.</span>
      </h1>
      {actions && <div style={{ flexShrink: 0, minWidth: 0, maxWidth: '100%', paddingBottom: 6 }}>{actions}</div>}
    </div>

    {/* Subtitle */}
    {subtitle && <p className="page-header-sub">{subtitle}</p>}
  </div>
  );
};
