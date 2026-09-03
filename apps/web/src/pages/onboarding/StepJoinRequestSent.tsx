import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';

/**
 * Auto-join-by-domain's terminal screen when a request was sent instead of
 * a workspace being created. Deliberately its own small component rather
 * than reusing StepSuccess — that one auto-logs the visitor in after its
 * checklist animation, which is wrong here: nothing has been provisioned,
 * and there's no session to start until a tenant admin approves the request
 * (ondi.routes.ts POST /org/join-requests/:id/approve).
 */
export const StepJoinRequestSent: React.FC<{ tenantName: string }> = ({ tenantName }) => (
  <div className="ob-success">
    <div className="ob-success-icon"><Icon name="mail" size={40} /></div>
    <h1 className="login-headline">Request sent</h1>
    <p className="login-subtext">
      An admin at <strong>{tenantName}</strong> needs to approve your request before you can sign in. You'll get an
      email once they do.
    </p>
    <Link to="/login" className="login-back-btn" style={{ marginTop: 20 }}>Back to sign in</Link>
  </div>
);

export default StepJoinRequestSent;
