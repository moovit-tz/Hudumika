import React, { useState } from 'react';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteEmails() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [emailName, setEmailName] = useState('');
  const [domain, setDomain] = useState('gmtl.co.tz');
  const [password, setPassword] = useState('');

  const mailboxes = [
    { email: 'info@gmtl.co.tz', usage: '1.2 GB / 10 GB', status: 'active' },
    { email: 'support@gmtl.co.tz', usage: '450 MB / 10 GB', status: 'active' },
    { email: 'sales@aleka.co.tz', usage: '80 MB / 10 GB', status: 'active' },
  ];

  const handleCreateMailbox = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailName) return;
    alert(`Mailbox ${emailName}@${domain} created successfully!`);
    setShowAddModal(false);
    setEmailName('');
    setPassword('');
  };

  return (
    <div className="onsite-page">
      <div className="onsite-header">
        <div className="onsite-header-title">
          <h1>Emails</h1>
          <p>Professional domain email mailboxes, forwarders, and webmail access.</p>
        </div>
        <div className="onsite-header-actions">
          <button className="onsite-btn-purple" onClick={() => setShowAddModal(true)}>
            + Create Email Account
          </button>
        </div>
      </div>

      <div className="onsite-card">
        <div className="onsite-table-wrapper">
          <table className="onsite-table">
            <thead>
              <tr>
                <th>Email Address</th>
                <th>Storage Usage</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mailboxes.map((m) => (
                <tr key={m.email}>
                  <td style={{ fontWeight: 600 }}>{m.email}</td>
                  <td>{m.usage}</td>
                  <td>
                    <span className="onsite-badge active">Active</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button className="onsite-btn-outline" onClick={() => window.open('https://webmail.hudumika.tz', '_blank')}>
                        Webmail ↗
                      </button>
                      <button className="btn btn-sm btn-ghost">
                        <Icon name="moreVertical" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div className="onsite-card" style={{ width: '100%', maxWidth: '480px' }}>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">Create Email Mailbox</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateMailbox} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="onsite-form-group">
                <label>Email Username</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="onsite-input"
                    placeholder="you"
                    value={emailName}
                    onChange={(e) => setEmailName(e.target.value)}
                    style={{ flex: 1 }}
                    required
                  />
                  <span>@</span>
                  <select className="onsite-select" value={domain} onChange={(e) => setDomain(e.target.value)}>
                    <option value="gmtl.co.tz">gmtl.co.tz</option>
                    <option value="aleka.co.tz">aleka.co.tz</option>
                    <option value="hudumika.tz">hudumika.tz</option>
                  </select>
                </div>
              </div>
              <div className="onsite-form-group">
                <label>Password</label>
                <input
                  type="password"
                  className="onsite-input"
                  placeholder="Set strong mailbox password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="onsite-btn-purple">
                  Create Mailbox
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
