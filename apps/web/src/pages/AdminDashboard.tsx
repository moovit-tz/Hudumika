import React from 'react';

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
        padding: '40px',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', marginBottom: '20px' }}>Admin Dashboard</h1>
      <p style={{ fontSize: '1.2rem', maxWidth: '600px', textAlign: 'center' }}>
        Welcome, Administrator. This area will host privileged tools and analytics for ClearOS.
        Future components (user management, system settings, audit logs) will appear here.
      </p>
    </div>
  );
};
