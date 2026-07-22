import React from 'react';
import { useBranding } from '../hooks/useBranding.js';

/**
 * The "[App] powered by [Hudumika logo]" footer line, single-sourced so every
 * page's footer (in-shell PageLayout, public marketing/legal pages) shows the
 * same platform branding instead of a hand-copied logo snippet per page.
 * `theme` picks which logo variant to show on pages with a fixed background
 * (e.g. an always-dark sales page) instead of switching with the app theme.
 */
export function PoweredByHudumika({ appName = 'Hudumika', theme = 'auto' }: { appName?: string; theme?: 'auto' | 'dark' | 'light' }) {
  const { logoLight, logoDark, favicon } = useBranding();
  const imgStyle: React.CSSProperties = {
    height: 22, maxWidth: 140, objectFit: 'contain', verticalAlign: 'middle', display: 'inline-block', margin: '0 4px',
  };

  let logoEl: React.ReactNode;
  if (theme === 'dark') {
    const src = logoDark || logoLight || favicon;
    logoEl = src ? <img src={src} alt="Hudumika" style={imgStyle} /> : <DefaultMark />;
  } else if (theme === 'light') {
    const src = logoLight || logoDark || favicon;
    logoEl = src ? <img src={src} alt="Hudumika" style={imgStyle} /> : <DefaultMark />;
  } else if (logoLight && logoDark) {
    logoEl = (
      <>
        <img src={logoLight} alt="Hudumika" className="logo-light-only" style={imgStyle} />
        <img src={logoDark}  alt="Hudumika" className="logo-dark-only"  style={imgStyle} />
      </>
    );
  } else {
    const src = logoLight || logoDark || favicon;
    logoEl = src ? <img src={src} alt="Hudumika" style={imgStyle} /> : <DefaultMark />;
  }

  return <><strong>{appName}</strong> powered by {logoEl}</>;
}

function DefaultMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--teal, #3088a8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', display: 'inline-block', margin: '0 4px' }}>
      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
      <polyline points="2 17 12 22 22 17"></polyline>
      <polyline points="2 12 12 17 22 12"></polyline>
    </svg>
  );
}
