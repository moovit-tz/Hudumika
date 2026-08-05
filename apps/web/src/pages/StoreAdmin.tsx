import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import './Store.css';

export const StoreAdmin: React.FC = () => {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadApps = async () => {
    try {
      const data = await apiFetch('/v1/store/admin/apps');
      setApps(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    try {
      await apiFetch(`/v1/store/admin/apps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      loadApps();
    } catch (e) {
      showAlert('Failed to update status');
    }
  };

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <div className="store-main" style={{ padding: '40px' }}>
      <div className="store-section-header">
        <h3 className="store-section-title">Store Admin</h3>
        <span className="store-section-count">Manage App Submissions</span>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', marginTop: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--ink3)' }}>App Name</th>
              <th style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--ink3)' }}>Developer</th>
              <th style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--ink3)' }}>Category</th>
              <th style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--ink3)' }}>Status</th>
              <th style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--ink3)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {apps.map(app => (
              <tr key={app.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '16px', fontWeight: 600 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {app.iconUrl ? <img src={app.iconUrl} alt="icon" style={{ width: 24, height: 24, borderRadius: 4 }} /> : <Icon name="package" size={24} />}
                    {app.name}
                  </div>
                </td>
                <td style={{ padding: '16px' }}>{app.developer_name}</td>
                <td style={{ padding: '16px', textTransform: 'capitalize' }}>{app.category}</td>
                <td style={{ padding: '16px' }}>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                    background: app.status === 'approved' ? '#ecfdf5' : app.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                    color: app.status === 'approved' ? '#065f46' : app.status === 'rejected' ? '#991b1b' : '#92400e'
                  }}>
                    {app.status}
                  </span>
                </td>
                <td style={{ padding: '16px' }}>
                  {app.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" style={{ padding: 'var(--ds-btn-py-xs) 12px', fontSize: '12px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}} onClick={() => handleUpdateStatus(app.id, 'approved')}>Approve</button>
                      <button className="btn btn-secondary" style={{ padding: 'var(--ds-btn-py-xs) 12px', fontSize: '12px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}} onClick={() => handleUpdateStatus(app.id, 'rejected')}>Reject</button>
                    </div>
                  )}
                  {app.status === 'approved' && (
                    <button className="btn btn-secondary" style={{ padding: 'var(--ds-btn-py-xs) 12px', fontSize: '12px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}} onClick={() => handleUpdateStatus(app.id, 'rejected')}>Revoke</button>
                  )}
                  {app.status === 'rejected' && (
                    <button className="btn btn-secondary" style={{ padding: 'var(--ds-btn-py-xs) 12px', fontSize: '12px', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box'}} onClick={() => handleUpdateStatus(app.id, 'approved')}>Approve</button>
                  )}
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>No apps found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
