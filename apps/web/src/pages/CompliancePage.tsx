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
    // Short on purpose: the breadcrumb already reads "… · Compliance · …",
    // so a full "Compliance Check" here would repeat the word right next to
    // itself. The page's own H1 (titlePlain/titleEm below) carries the full
    // "Compliance check." wording the crumb doesn't need to restate.
    crumb: 'Check',
    titlePlain: 'Compliance',
    titleEm: 'check',
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

  // Advanced Check (TradeWizard), Screening and Certificate of Origin all
  // render their own PageHeader — Screening/Origin need this too: neither
  // segment exists in SECTIONS above, so without this guard they silently
  // fell through to the Overview copy ("Compliance centre") and rendered
  // it here ABOVE their own real header, stacking two titles on one page.
  // Any route whose child owns its own header belongs in this list.
  if (segment === 'advanced' || segment === 'screening' || segment === 'origin') return <Outlet />;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
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
