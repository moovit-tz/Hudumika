import React from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { OrgVerificationPanel } from '../components/OrgVerificationPanel.js';

/** Ondi's "Business" mode counterpart to OndiPersonal — the organization's
 *  own identity (KYB), reusing the exact same panel Subscription.tsx's
 *  Company Info tab renders. */
export const OndiBusinessVerification: React.FC = () => (
  <div>
    <PageHeader
      crumbs={['Ondi', 'Business']}
      titlePlain="Business"
      titleEm="identity"
      subtitle="This workspace's own business-registration verification."
    />
    <OrgVerificationPanel />
  </div>
);

export default OndiBusinessVerification;
