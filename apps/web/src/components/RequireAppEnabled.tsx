import React from 'react';
import { Navigate } from 'react-router-dom';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';

interface RequireAppEnabledProps {
  children: React.ReactNode;
  appId: string;
}

/** Redirects away from an app's shell if a SuperAdmin has disabled it for this tenant. */
export function RequireAppEnabled({ children, appId }: RequireAppEnabledProps) {
  const enabledApps = useEnabledApps();
  if (enabledApps !== null && !isAppEnabled(appId, enabledApps)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
