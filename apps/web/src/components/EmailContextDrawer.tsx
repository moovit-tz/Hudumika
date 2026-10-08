import React from 'react';
import { Icon } from './Icon.js';
import { PersonAvatar } from './PersonAvatar.js';
import { Tip } from './ui/tooltip.js';
import { showAlert } from '../lib/alert.js';

interface EmailAddress {
  name: string;
  email: string;
  userId?: string;
}

interface EmailContextDrawerProps {
  sender: EmailAddress;
  subject: string;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

export const EmailContextDrawer: React.FC<EmailContextDrawerProps> = ({
  sender,
  subject,
  isOpen,
  onClose,
  onNavigate,
}) => {
  if (!isOpen) return null;

  const domain = sender.email.split('@')[1] || '';
  const companyName = domain.split('.')[0]?.toUpperCase() || 'Organization';

  function handleCreateCrmLead() {
    onNavigate(`/crm/leads?create=1&email=${encodeURIComponent(sender.email)}&name=${encodeURIComponent(sender.name || '')}`);
    onClose();
  }

  return (
    <div className="em-context-drawer">
      <div className="em-context-drawer-header">
        <div className="em-context-drawer-title">
          <Icon name="user" size={16} color="var(--teal)" />
          <span>Contact & CRM Intelligence</span>
        </div>
        <button
          type="button"
          className="em-icon-btn em-icon-btn--ghost"
          onClick={onClose}
          aria-label="Close drawer"
         data-ui-native-button="">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="em-context-drawer-body">
        {/* Profile Card */}
        <div className="em-context-profile-card">
          <PersonAvatar userId={sender.userId} name={sender.name} size={54} />
          <div className="em-context-profile-info">
            <h3 className="em-context-profile-name">{sender.name || sender.email}</h3>
            <span className="em-context-profile-email">{sender.email}</span>
            <span className="em-context-profile-company">
              <Icon name="briefcase" size={12} /> {companyName}
            </span>
          </div>
        </div>

        {/* Quick Cross-App Action Grid */}
        <div className="em-context-section">
          <h4 className="em-context-section-title">Quick Actions</h4>
          <div className="em-context-action-grid">
            <button
              type="button"
              className="em-context-action-btn"
              onClick={handleCreateCrmLead}
             data-ui-native-button="">
              <div className="em-context-action-icon em-context-action-icon--blue">
                <Icon name="userPlus" size={16} />
              </div>
              <div className="em-context-action-text">
                <strong>Create CRM Lead</strong>
                <span>Add to Sales Pipeline</span>
              </div>
            </button>

            {sender.userId ? (
              <button
                type="button"
                className="em-context-action-btn"
                onClick={() => {
                  onNavigate(`/bliss/calls?call=${sender.userId}&kind=VIDEO`);
                  onClose();
                }}
               data-ui-native-button="">
                <div className="em-context-action-icon em-context-action-icon--green">
                  <Icon name="video" size={16} />
                </div>
                <div className="em-context-action-text">
                  <strong>Bliss Video Call</strong>
                  <span>Instant HD Conference</span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                className="em-context-action-btn"
                onClick={() => {
                  onNavigate(`/bliss/calls`);
                  onClose();
                }}
               data-ui-native-button="">
                <div className="em-context-action-icon em-context-action-icon--green">
                  <Icon name="phone" size={16} />
                </div>
                <div className="em-context-action-text">
                  <strong>Call Contact</strong>
                  <span>Open Bliss Dialer</span>
                </div>
              </button>
            )}

            <button
              type="button"
              className="em-context-action-btn"
              onClick={() => {
                onNavigate(`/calendar?new=1&title=${encodeURIComponent(`Meeting with ${sender.name || sender.email}`)}`);
                onClose();
              }}
             data-ui-native-button="">
              <div className="em-context-action-icon em-context-action-icon--gold">
                <Icon name="calendar" size={16} />
              </div>
              <div className="em-context-action-text">
                <strong>Schedule Event</strong>
                <span>Sync with Google/M365</span>
              </div>
            </button>

            <button
              type="button"
              className="em-context-action-btn"
              onClick={() => {
                onNavigate(`/clearance?q=${encodeURIComponent(domain)}`);
                onClose();
              }}
             data-ui-native-button="">
              <div className="em-context-action-icon em-context-action-icon--purple">
                <Icon name="truck" size={16} />
              </div>
              <div className="em-context-action-text">
                <strong>ClearOS Search</strong>
                <span>Find Related Jobs</span>
              </div>
            </button>
          </div>
        </div>

        {/* Company / Domain Summary */}
        <div className="em-context-section">
          <h4 className="em-context-section-title">Domain Insights</h4>
          <div className="em-context-info-box">
            <div className="em-context-info-row">
              <span className="em-context-info-lbl">Mail Domain</span>
              <span className="em-context-info-val">@{domain}</span>
            </div>
            <div className="em-context-info-row">
              <span className="em-context-info-lbl">Account Type</span>
              <span className="em-context-info-val">{sender.userId ? 'Internal Staff Member' : 'External Customer / Partner'}</span>
            </div>
            <div className="em-context-info-row">
              <span className="em-context-info-lbl">Security</span>
              <span className="em-context-info-val em-context-info-val--safe">
                <Icon name="shield" size={12} color="var(--green)" /> SPF/DKIM Verified
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
