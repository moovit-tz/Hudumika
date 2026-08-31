// ─── OneIdSecuritySettings.tsx — Ondi Personal · Security Settings ───
// Its own sidebar page rather than a tab, so it's directly linkable — the
// content itself (password/email/2FA/passkeys/sessions/KYC/trust score)
// is all real, already built this session's Ondi program: AccountSecurityPanel.
import React from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { AccountSecurityPanel } from '../components/AccountSecurityPanel.js';

export const OneIdSecuritySettings: React.FC = () => (
  <div>
    <PageHeader
      crumbs={['Ondi', 'Personal']}
      titlePlain="Security"
      titleEm="settings"
      subtitle="Password, email, two-factor authentication, passkeys, identity verification, and active sessions."
    />
    <AccountSecurityPanel />
  </div>
);

export default OneIdSecuritySettings;
