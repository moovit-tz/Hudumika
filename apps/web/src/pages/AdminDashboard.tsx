import React from 'react';
import { PageHeader } from '../components/PageHeader.js';

export const AdminDashboard: React.FC = () => {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top left, #0b7264, #0a192f)',
        color: '#fff',
        fontFamily: 'Inter, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PageHeader
        crumbs={['Admin', 'Dashboard']}
        titlePlain="Admin"
        titleEm="dashboard"
        subtitle="Welcome, Administrator. This area will host privileged tools and analytics for ClearOS. Future components (user management, system settings, audit logs) will appear here."
      />
    </div>
  );
};
