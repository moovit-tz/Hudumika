import React from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { AccountSecurityPanel } from '../components/AccountSecurityPanel.js';

/** Ondi's "Personal" mode home — your own identity (KYC, 2FA, passkeys,
 *  trust score, sessions), reusing the exact same panel /profile's Security
 *  tab renders. Available to every signed-in user regardless of role. */
export const OneIdPersonal: React.FC = () => (
  <div>
    <PageHeader
      crumbs={['Ondi', 'Personal']}
      titlePlain="My"
      titleEm="identity"
      subtitle="Your own identity verification, sign-in methods, and sessions."
    />
    <AccountSecurityPanel />
  </div>
);

export default OneIdPersonal;
