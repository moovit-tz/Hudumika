import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { usePageSEO } from '../hooks/usePageSEO.js';

interface SectionCopy {
  crumb: string;
  titlePlain: string;
  titleEm: string;
  subtitle: string;
  seoDesc: string;
}

// Keyed by the route's final segment — 'quick' / 'advanced' — with the
// index route (Overview) as the fallback. Keeps the header speaking to
// whatever action the user is actually about to take, instead of a single
// static blurb that only ever matched the Overview tab.
const SECTIONS: Record<string, SectionCopy> = {
  overview: {
    crumb: 'Overview',
    titlePlain: 'Compliance',
    titleEm: 'centre',
    subtitle: "Overview of your team's compliance activity, a quick PVoC/GCLA/TBS/WMA checkup, and the guided Trade Compliance Wizard for permits, timelines and offices.",
    seoDesc: 'Overview, quick checks and the guided Trade Compliance Wizard.',
  },
  quick: {
    crumb: 'Quick Check',
    titlePlain: 'Quick',
    titleEm: 'compliance check',
    subtitle: 'Fast per-shipment lookup — PVoC, Destination Inspection, GCLA, TBS, CAMARTEC, TCRA, SUMATRA, EWURA and Weights & Measures (WMA), by HS code and origin.',
    seoDesc: 'Fast PVoC/GCLA/TBS/WMA compliance lookup by HS code and origin.',
  },
  advanced: {
    crumb: 'Trade Wizard',
    titlePlain: 'Trade compliance',
    titleEm: 'wizard',
    subtitle: "Tell us what you want to export, import or transit — we'll show the real permits, offices and process flow.",
    seoDesc: 'Guided trade compliance wizard for permits, timelines and offices.',
  },
};

export const CompliancePage: React.FC = () => {
  const location = useLocation();
  const segment = location.pathname.split('/').pop() ?? '';
  const section = SECTIONS[segment] ?? SECTIONS.overview;

  usePageSEO(`Compliance — ${section.crumb}`, section.seoDesc);

  // Advanced Check (TradeWizard) now renders its own PageHeader + padding —
  // it needs the header's `actions` slot for the search-quota badge, which
  // this shared layout has no way to pass through. Rendering both here and
  // there duplicated the title/breadcrumb, so this layout steps aside for
  // that one route instead of wrapping it a second time.
  if (segment === 'advanced') return <Outlet />;

  return (
    <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['ClearOS', 'Compliance', section.crumb]}
        titlePlain={section.titlePlain}
        titleEm={section.titleEm}
        subtitle={section.subtitle}
      />
      <div style={{ marginTop: 12 }}>
        <Outlet />
      </div>
    </div>
  );
};
