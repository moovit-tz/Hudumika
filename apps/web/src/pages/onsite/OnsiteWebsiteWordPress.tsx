import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteWebsiteWordPress() {
  const [detecting, setDetecting] = useState(false);
  const [installing, setInstalling] = useState(false);

  const handleDetect = () => {
    setDetecting(true);
    setTimeout(() => {
      setDetecting(false);
      alert('WordPress installation detected on hudumika.tz! WP Dashboard link attached.');
    }, 1200);
  };

  const handleInstall = () => {
    setInstalling(true);
    setTimeout(() => {
      setInstalling(false);
      alert('WordPress 6.7 installed successfully on hudumika.tz!');
    }, 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <Link to="/onsite/websites" style={{ color: 'var(--ink2)', textDecoration: 'none' }}>Websites</Link>
        <span>›</span>
        <span>hudumika.tz</span>
        <span>›</span>
        <span>WordPress</span>
        <span>›</span>
        <span>Overview</span>
      </div>

      {/* Title */}
      <div style={{ fontSize: '1.625rem', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        hudumika.tz <Icon name="externalLink" size={18} style={{ color: 'var(--ink3)' }} />
      </div>

      {/* Domain selector */}
      <div className="onsite-card" style={{ maxWidth: '600px', padding: '0.875rem 1.25rem' }}>
        <select className="onsite-select" defaultValue="hudumika.tz">
          <option value="hudumika.tz">hudumika.tz</option>
          <option value="gmtl.co.tz">gmtl.co.tz</option>
          <option value="moovit.co.tz">moovit.co.tz</option>
        </select>
      </div>

      {/* WordPress Installations Card (Image 3) */}
      <div className="onsite-card">
        <h3 className="onsite-card-title">+ WordPress Installations</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
          {/* Detect WordPress */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--ink)' }}>Detect WordPress</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)', marginTop: '0.25rem' }}>
                If you have manually uploaded your WordPress, you can detect to show WP dashboard
              </div>
            </div>
            <button className="onsite-btn-purple" onClick={handleDetect} disabled={detecting}>
              {detecting ? 'Detecting…' : 'Detect'}
            </button>
          </div>

          {/* Install WordPress */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--ink)' }}>Install WordPress</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)', marginTop: '0.25rem' }}>
                Install the recent version of WordPress to your website.
              </div>
            </div>
            <button className="onsite-btn-purple" onClick={handleInstall} disabled={installing}>
              {installing ? 'Installing…' : 'Install'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
