import React from 'react';
import { OndiSecuritySettings } from '../pages/OndiSecuritySettings.js';

/**
 * Shared self-service account-security surface — password, 2FA, identity
 * verification (KYC), active sessions, passkeys, trust score, and recovery.
 * Unifies /ondi/personal/security and UserProfile.tsx's Security tab so
 * they never drift.
 */
export function AccountSecurityPanel() {
  return <OndiSecuritySettings />;
}

export default AccountSecurityPanel;
