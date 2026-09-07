import React from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { CallsMetrics } from './CallsMetrics.js';

export function CallsReports() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 24px', background: 'var(--bg)', minHeight: '100%' }}>
      <PageHeader
        crumbs={['Bliss', 'Calls', 'Reports']}
        titlePlain="Call & Meeting"
        titleEm="Reports"
        subtitle="Comprehensive metrics for support voice calls, WebRTC softphone queues, video conference rooms, and participant performance."
      />
      <CallsMetrics />
    </div>
  );
}
