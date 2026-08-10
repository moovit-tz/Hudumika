import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteWebsiteDatabases() {
  const [dbName, setDbName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const databases = [
    { name: 'u348862523_rcbzQ', size: '179 MB', user: 'u348862523_SpkQ6', createdAt: '2024-12-18', website: null },
  ];

  const handleCreateDb = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbName || !dbUser || !password) return;
    setCreating(true);
    setTimeout(() => {
      setCreating(false);
      alert(`MySQL Database u348862523_${dbName} created successfully!`);
      setDbName('');
      setDbUser('');
      setPassword('');
    }, 1200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <Link to="/onsite/websites" style={{ color: 'var(--ink2)', textDecoration: 'none' }}>Websites</Link>
        <span>›</span>
        <span>hudumika.tz</span>
        <span>›</span>
        <span>Databases</span>
        <span>›</span>
        <span>Management</span>
      </div>

      <h1 style={{ fontSize: '1.625rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Management</h1>

      {/* Create MySQL Database Form Card (Image 4) */}
      <div className="onsite-card">
        <h3 className="onsite-card-title">+ Create a New MySQL Database And Database User</h3>

        <form onSubmit={handleCreateDb} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
          {/* DB Name */}
          <div className="onsite-form-group">
            <label style={{ color: 'var(--ink)' }}>MySQL database name</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ background: 'var(--bg)', color: 'var(--ink2)', padding: '0.55rem 0.875rem', borderRadius: '0.5rem 0 0 0.5rem', border: '1px solid var(--border)', borderRight: 'none', fontSize: '0.875rem', fontWeight: 600 }}>
                u348862523_
              </span>
              <input
                type="text"
                className="onsite-input"
                placeholder="Database name"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                style={{ borderRadius: '0 0.5rem 0.5rem 0', flex: 1 }}
                required
              />
            </div>
          </div>

          {/* DB User */}
          <div className="onsite-form-group">
            <label style={{ color: 'var(--ink)' }}>MySQL username</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ background: 'var(--bg)', color: 'var(--ink2)', padding: '0.55rem 0.875rem', borderRadius: '0.5rem 0 0 0.5rem', border: '1px solid var(--border)', borderRight: 'none', fontSize: '0.875rem', fontWeight: 600 }}>
                u348862523_
              </span>
              <input
                type="text"
                className="onsite-input"
                placeholder="Option"
                value={dbUser}
                onChange={(e) => setDbUser(e.target.value)}
                style={{ borderRadius: '0 0.5rem 0.5rem 0', flex: 1 }}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="onsite-form-group">
            <label style={{ color: 'var(--ink)' }}>Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="onsite-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', paddingRight: '2.5rem' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
              </button>
            </div>

            {/* Validation Rules (Image 4) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--green)' }}>
              <div>✓ Minimum 8 characters</div>
              <div>✓ Must contain at least one lowercase letter</div>
              <div>✓ Must contain at least one uppercase letter</div>
              <div>✓ Must contain at least one number</div>
            </div>
          </div>

          <button type="submit" className="onsite-btn-purple" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} disabled={creating}>
            <Icon name="check" size={16} /> {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
      </div>

      {/* Table: List of Current MySQL Databases And Users (Image 4) */}
      <div className="onsite-card">
        <h3 className="onsite-card-title">List of Current MySQL Databases And Users</h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.4rem 0.75rem', maxWidth: '360px' }}>
          <Icon name="search" size={16} style={{ color: 'var(--ink3)' }} />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem', width: '100%', color: 'var(--ink)' }}
          />
        </div>

        <div className="onsite-table-wrapper">
          <table className="onsite-table">
            <thead>
              <tr>
                <th>MySQL Database</th>
                <th>MySQL User</th>
                <th>Created at</th>
                <th>Website</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {databases.map((db) => (
                <tr key={db.name}>
                  <td>
                    <div style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--ink)' }}>{db.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink2)' }}>{db.size}</div>
                  </td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--ink)' }}>{db.user}</td>
                  <td>{db.createdAt}</td>
                  <td>
                    <span style={{ color: 'var(--purple)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
                      + Assign
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button className="onsite-btn-outline" onClick={() => window.open('https://phpmyadmin.hudumika.tz', '_blank')}>
                        Enter phpMyAdmin
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
    </div>
  );
}
