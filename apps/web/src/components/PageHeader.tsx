import React from 'react';

interface PageHeaderProps {
  /** e.g. ['Finance', 'Dashboard'] → "FINANCE · DASHBOARD" */
  crumbs: string[];
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
  return (
  <div className="page-header">
    {/* Breadcrumb */}
    <div className="page-header-crumb">
      {crumbs.map((c, i) => (
        <React.Fragment key={c}>
          {i > 0 && <span className="page-header-crumb-sep">·</span>}
          <span>{c}</span>
        </React.Fragment>
      ))}
    </div>

    {/* Title row */}
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <h1 className="page-header-title">
        {plain} <em>{em}</em><span className="ph-dot">.</span>
      </h1>
      {actions && <div style={{ flexShrink: 0, paddingBottom: 6 }}>{actions}</div>}
    </div>

    {/* Subtitle */}
    {subtitle && <p className="page-header-sub">{subtitle}</p>}
  </div>
  );
};
