import React from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { CallsMetrics } from './CallsMetrics.js';

export function CallsReports() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader crumbs={['Bliss', 'Calls']} titlePlain="Call" titleEm="reports"
        subtitle="Your own call and meeting activity, plus the team-wide trend for management roles." />
      <CallsMetrics />
    </div>
  );
}
