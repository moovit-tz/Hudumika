import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import './Onsite.css';

export function OnsiteWebsiteSSH() {
  const [copied, setCopied] = useState(false);

  const sshCommand = 'ssh -p 65002 u348862523@147.93.42.1';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <Link to="/onsite/websites" style={{ color: 'var(--ink2)', textDecoration: 'none' }}>Websites</Link>
        <span>›</span>
        <span>hudumika.tz</span>
        <span>›</span>
        <span>Advanced</span>
        <span>›</span>
        <span>SSH Access</span>
      </div>

      <h1 style={{ fontSize: '1.625rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>SSH Access</h1>

      {/* Top Cards Grid (Image 5) */}
      <div className="onsite-grid-2">
        {/* SSH Details Card */}
        <div className="onsite-card">
          <h3 className="onsite-card-title">SSH details</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--ink2)' }}>IP</span>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                147.93.42.1
                <button className="btn btn-sm btn-ghost" onClick={() => copyToClipboard('147.93.42.1')}>
                  <Icon name="copy" size={14} />
                </button>
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--ink2)' }}>Port</span>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                65002
                <button className="btn btn-sm btn-ghost" onClick={() => copyToClipboard('65002')}>
                  <Icon name="copy" size={14} />
                </button>
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--ink2)' }}>Username</span>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                u348862523
                <button className="btn btn-sm btn-ghost" onClick={() => copyToClipboard('u348862523')}>
                  <Icon name="copy" size={14} />
                </button>
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--ink2)' }}>Password</span>
              <button className="onsite-btn-outline" style={{ color: 'var(--purple)', fontSize: '0.8125rem' }}>
                Change
              </button>
            </div>
          </div>
        </div>

        {/* SSH Status Card */}
        <div className="onsite-card" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="onsite-card-header">
              <h3 className="onsite-card-title">SSH status</h3>
              <span className="onsite-badge active">ACTIVE</span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink2)', marginTop: '0.75rem' }}>
              SSH allows secure file transfer and remote logins over the internet
            </p>
          </div>

          <button className="onsite-btn-outline" style={{ width: 'fit-content', color: 'var(--red)', borderColor: 'var(--red-l)' }}>
            Disable
          </button>
        </div>
      </div>

      {/* Log in to SSH Section (Image 5) */}
      <div className="onsite-card">
        <div className="onsite-card-header">
          <h3 className="onsite-card-title">Log in to SSH</h3>
          <span style={{ fontSize: '0.8125rem', color: 'var(--purple)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Icon name="externalLink" size={14} /> How to log in?
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginTop: '0.5rem' }}>
          {/* Terminal snippet box */}
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--ink)', marginBottom: '0.35rem' }}>
              Use a built-in terminal on your device
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)', marginBottom: '0.75rem' }}>
              Open the terminal and paste this text into the command line. You will be requested to enter your SSH password.
            </div>

            <div style={{ background: 'var(--purple-l)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <code style={{ fontSize: '0.875rem', color: 'var(--ink)', fontWeight: 600 }}>{sshCommand}</code>
              <button className="btn btn-sm btn-ghost" onClick={() => copyToClipboard(sshCommand)}>
                <Icon name={copied ? 'check' : 'copy'} size={16} style={{ color: copied ? 'var(--green)' : 'var(--purple)' }} />
              </button>
            </div>
          </div>

          {/* SSH Client */}
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--ink)', marginBottom: '0.35rem' }}>
              Use SSH client
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--ink2)', marginBottom: '0.75rem' }}>
              Use your preferred SSH Client and enter SSH details to log in.
            </div>

            <button className="onsite-btn-outline" onClick={() => window.open('https://www.putty.org/', '_blank')}>
              PuTTY
            </button>
          </div>
        </div>
      </div>

      {/* SSH Keys Section (Image 5) */}
      <div className="onsite-card">
        <h3 className="onsite-card-title">SSH keys</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink2)', margin: 0 }}>
          SSH keys are one of the most secure SSH authentication options. It is more secure than the usual SSH password authentication. Therefore, it is highly recommended to use SSH Key authentication method for connections to your servers.
        </p>

        <button className="onsite-btn-purple" style={{ width: 'fit-content', marginTop: '0.5rem' }}>
          + Add SSH Key
        </button>
      </div>
    </div>
  );
}
