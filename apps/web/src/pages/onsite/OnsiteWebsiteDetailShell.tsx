import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import type { OnsiteWebsite } from '@hudumika/types';

import { OnsiteWebsiteAnalytics } from './OnsiteWebsiteAnalytics.js';
import { OnsiteWebsiteSSL } from './OnsiteWebsiteSSL.js';
import { OnsiteWebsiteWordPress } from './OnsiteWebsiteWordPress.js';
import { OnsiteWebsiteDatabases } from './OnsiteWebsiteDatabases.js';
import { OnsiteWebsiteSSH } from './OnsiteWebsiteSSH.js';
import './Onsite.css';

export function OnsiteWebsiteDetailShell() {
  const { siteId } = useParams<{ siteId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchMenu, setSearchMenu] = useState('');
  const [websites, setWebsites] = useState<OnsiteWebsite[]>([]);

  useEffect(() => {
    apiFetch('/v1/onsite/websites')
      .then((res: any) => setWebsites(Array.isArray(res) ? res : []))
      .catch(() => setWebsites([]));
  }, []);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    security: true,
    website: true,
    files: true,
    databases: true,
    advanced: true,
  });

  const toggleSection = (sec: string) => {
    setOpenSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  const currentPath = location.pathname;
  const baseUrl = `/onsite/websites/${siteId}`;

  const isActive = (path: string) => currentPath === path || currentPath.startsWith(path);

  return (
    <div style={{ display: 'flex', gap: '2rem', minHeight: 'calc(100vh - 120px)' }}>
      {/* Left Contextual Sidebar for Website Management (Images 1-5) */}
      <div style={{
        width: '260px',
        flexShrink: 0,
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.25rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        height: 'fit-content'
      }}>
        {/* Website Selector */}
        <div className="onsite-form-group">
          <label style={{ fontSize: '0.75rem', color: 'var(--ink2)', fontWeight: 600 }}>Website name</label>
          <select
            className="onsite-select"
            value={siteId ?? ''}
            onChange={(e) => navigate(`/onsite/websites/${e.target.value}`)}
            style={{ fontWeight: 600, fontSize: '0.875rem' }}
          >
            {websites.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        {/* Search menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.35rem 0.65rem' }}>
          <Icon name="search" size={14} style={{ color: 'var(--ink3)' }} />
          <input
            type="text"
            placeholder="Search"
            value={searchMenu}
            onChange={(e) => setSearchMenu(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8125rem', width: '100%', color: 'var(--ink)' }}
          />
        </div>

        {/* Navigation Items (Images 1-5) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          <Link
            to={baseUrl}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', textDecoration: 'none',
              fontWeight: 500, color: currentPath === baseUrl ? 'var(--purple)' : 'var(--ink)', background: currentPath === baseUrl ? 'var(--purple-l)' : 'transparent'
            }}
          >
            <Icon name="layoutDashboard" size={16} /> Dashboard
          </Link>

          <Link
            to={`${baseUrl}/analytics`}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', textDecoration: 'none',
              fontWeight: 500, color: isActive(`${baseUrl}/analytics`) ? 'var(--purple)' : 'var(--ink)', background: isActive(`${baseUrl}/analytics`) ? 'var(--purple-l)' : 'transparent'
            }}
          >
            <Icon name="barChart2" size={16} /> Analytics
          </Link>

          {/* Security Group */}
          <div>
            <button
              onClick={() => toggleSection('security')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontWeight: 600, fontSize: '0.875rem' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Icon name="shield" size={16} /> Security
              </span>
              <span>{openSections.security ? '▾' : '▸'}</span>
            </button>
            {openSections.security && (
              <div style={{ paddingLeft: '2.25rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.2rem' }}>
                <Link to={`${baseUrl}/ssl`} style={{ textDecoration: 'none', fontSize: '0.8125rem', color: isActive(`${baseUrl}/ssl`) ? 'var(--purple)' : 'var(--ink2)', fontWeight: isActive(`${baseUrl}/ssl`) ? 600 : 400, padding: '0.3rem 0' }}>
                  SSL certificate
                </Link>
                <span style={{ fontSize: '0.8125rem', color: 'var(--ink3)', padding: '0.3rem 0' }}>Malware Scanner</span>
              </div>
            )}
          </div>

          {/* Website Group */}
          <div>
            <button
              onClick={() => toggleSection('website')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontWeight: 600, fontSize: '0.875rem' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Icon name="globe" size={16} /> Website
              </span>
              <span>{openSections.website ? '▾' : '▸'}</span>
            </button>
            {openSections.website && (
              <div style={{ paddingLeft: '2.25rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.2rem' }}>
                <Link to={`${baseUrl}/wordpress`} style={{ textDecoration: 'none', fontSize: '0.8125rem', color: isActive(`${baseUrl}/wordpress`) ? 'var(--purple)' : 'var(--ink2)', fontWeight: isActive(`${baseUrl}/wordpress`) ? 600 : 400, padding: '0.3rem 0' }}>
                  WordPress Install
                </Link>
                <span style={{ fontSize: '0.8125rem', color: 'var(--ink3)', padding: '0.3rem 0' }}>Auto Installer</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--ink3)', padding: '0.3rem 0' }}>Migrate Website</span>
              </div>
            )}
          </div>

          {/* Databases Group */}
          <div>
            <button
              onClick={() => toggleSection('databases')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontWeight: 600, fontSize: '0.875rem' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Icon name="layers" size={16} /> Databases
              </span>
              <span>{openSections.databases ? '▾' : '▸'}</span>
            </button>
            {openSections.databases && (
              <div style={{ paddingLeft: '2.25rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.2rem' }}>
                <Link to={`${baseUrl}/databases`} style={{ textDecoration: 'none', fontSize: '0.8125rem', color: isActive(`${baseUrl}/databases`) ? 'var(--purple)' : 'var(--ink2)', fontWeight: isActive(`${baseUrl}/databases`) ? 600 : 400, padding: '0.3rem 0' }}>
                  Management
                </Link>
                <span style={{ fontSize: '0.8125rem', color: 'var(--ink3)', padding: '0.3rem 0' }}>phpMyAdmin</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--ink3)', padding: '0.3rem 0' }}>Remote MySQL</span>
              </div>
            )}
          </div>

          {/* Advanced Group */}
          <div>
            <button
              onClick={() => toggleSection('advanced')}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontWeight: 600, fontSize: '0.875rem' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Icon name="settings" size={16} /> Advanced
              </span>
              <span>{openSections.advanced ? '▾' : '▸'}</span>
            </button>
            {openSections.advanced && (
              <div style={{ paddingLeft: '2.25rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.2rem' }}>
                <Link to={`${baseUrl}/ssh`} style={{ textDecoration: 'none', fontSize: '0.8125rem', color: isActive(`${baseUrl}/ssh`) ? 'var(--purple)' : 'var(--ink2)', fontWeight: isActive(`${baseUrl}/ssh`) ? 600 : 400, padding: '0.3rem 0' }}>
                  SSH Access
                </Link>
                <span style={{ fontSize: '0.8125rem', color: 'var(--ink3)', padding: '0.3rem 0' }}>PHP Configuration</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--ink3)', padding: '0.3rem 0' }}>DNS Zone Editor</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--ink3)', padding: '0.3rem 0' }}>Cron Jobs</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area for Sub-routes */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Routes>
          <Route index element={<OnsiteWebsiteAnalytics />} />
          <Route path="analytics" element={<OnsiteWebsiteAnalytics />} />
          <Route path="ssl" element={<OnsiteWebsiteSSL />} />
          <Route path="wordpress" element={<OnsiteWebsiteWordPress />} />
          <Route path="databases" element={<OnsiteWebsiteDatabases />} />
          <Route path="ssh" element={<OnsiteWebsiteSSH />} />
        </Routes>
      </div>
    </div>
  );
}
