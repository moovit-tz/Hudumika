import React from 'react';
import { useEntitlements } from '../hooks/useEntitlements.js';
import { Icon, type IconName } from './Icon.js';

interface RequireAppEnabledProps {
  children: React.ReactNode;
  appId: string;
}

function FullScreenNotice({ icon, title, message }: { icon: IconName; title: string; message: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', width: '100%', textAlign: 'center', padding: 24, gap: 10,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={28} color="var(--ink3)" />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
      <div style={{ fontSize: 14, color: 'var(--ink3)', maxWidth: 420 }}>{message}</div>
      <a href="/" style={{ marginTop: 8, fontSize: 13, color: 'var(--teal)', fontWeight: 600 }}>Back to home</a>
    </div>
  );
}

/** Blocks an app's shell when it's under maintenance or not included in the tenant's plan. */
export function RequireAppEnabled({ children, appId }: RequireAppEnabledProps) {
  const entitlements = useEntitlements();

  if (entitlements === null) return <>{children}</>; // still loading — don't flash a redirect before we know

  if (entitlements.appStatus[appId] === 'maintenance') {
    return (
      <FullScreenNotice
        icon="tool"
        title="Under maintenance"
        message="This app is temporarily unavailable while we roll out an update. Please check back shortly."
      />
    );
  }

  if (entitlements.features[appId] === false) {
    return (
      <FullScreenNotice
        icon="lock"
        title="Not included in your plan"
        message="This app isn't included in your organization's current plan. Contact your administrator to upgrade."
      />
    );
  }

  return <>{children}</>;
}
