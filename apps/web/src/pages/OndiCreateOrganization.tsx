// ─── OndiCreateOrganization.tsx — Ondi Personal · Create Organization ────
// Honest about a real platform limit rather than pretending around it: this
// codebase's whole multi-tenant model is one `users` row = one `tenant_id`
// (see the Ondi SSO program's own "Tenant model" decision) — one login
// cannot yet operate two organizations. So "create an organization" from
// an already-signed-in identity can't silently attach a second workspace
// to this same account; it starts a new one, same as any new customer
// would, through the platform's own real signup flow (/v1/onboarding/
// complete via OnboardingWizard.tsx) rather than a second, parallel
// tenant-creation form that would just duplicate that page's package/
// payment/subdomain steps. Opens in a new tab so this session — and
// whatever Ondi page led here — stays open.
import React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { useAuth } from '../hooks/useAuth.js';

export const OndiCreateOrganization: React.FC = () => {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader
        crumbs={['Ondi', 'Personal']}
        titlePlain="Create"
        titleEm="organization"
        subtitle="Start a brand new Hudumika workspace."
      />

      <div style={{ maxWidth: 620 }}>
        <SectionCard>
          <div style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="building" size={19} color="var(--teal)" />
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>
              A new organization is a completely separate Hudumika workspace, with its own data, billing, and sign-in — this platform doesn't yet support one login working across multiple organizations, so it needs its own account to own it (a different email address than {user?.email ?? 'your current one'} — your current login stays exactly as it is).
            </div>
          </div>

          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>What you'll set up</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.8 }}>
              <li>The new organization's name and industry</li>
              <li>A plan and billing method for it</li>
              <li>Its own subdomain and workspace settings</li>
            </ul>
          </div>

          <Link to="/signup" target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font)', textDecoration: 'none', minHeight: 'var(--ctl-h)', boxSizing: 'border-box' }}>
            Start setup <Icon name="arrowUpRight" size={15} />
          </Link>
        </SectionCard>
      </div>
    </div>
  );
};

export default OndiCreateOrganization;
