import React from 'react';

interface PageHeaderProps {
  /** e.g. ['Finance', 'Dashboard'] → "FINANCE · DASHBOARD" */
  crumbs: string[];
  /** Plain part before the italic word, e.g. "Finance" */
  titlePlain: string;
  /** Italic brand-colored word, e.g. "overview" */
  titleEm: string;
  /** Optional subtitle sentence */
  subtitle?: string;
  /** Optional right-side slot (buttons, date chip, etc.) */
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  crumbs,
  titlePlain,
  titleEm,
  subtitle,
  actions,
}) => (
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
        {titlePlain} <em>{titleEm}</em><span className="ph-dot">.</span>
      </h1>
      {actions && <div style={{ flexShrink: 0, paddingBottom: 6 }}>{actions}</div>}
    </div>

    {/* Subtitle */}
    {subtitle && <p className="page-header-sub">{subtitle}</p>}
  </div>
);
