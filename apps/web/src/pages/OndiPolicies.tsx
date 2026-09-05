import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './OndiPages.css';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { SwitchRow, FeatureToggleRow } from '../components/ui/list-item-row.js';
import { showAlert } from '../lib/alert.js';
import { useAuth } from '../hooks/useAuth.js';

interface CustomPolicy {
  id: string;
  name: string;
  category: 'network' | 'session' | 'device' | 'identity';
  severity: 'strict' | 'moderate' | 'advisory';
  target_roles: string[];
  description: string;
  enabled: boolean;
}

export const OndiPolicies: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);
  const canManagePolicies = isAdmin || !!user?.org_permissions?.includes('policies.manage');

  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [minLength, setMinLength] = useState(8);
  const [requireMixedCase, setRequireMixedCase] = useState(false);
  const [requireNumber, setRequireNumber] = useState(false);
  const [requireSymbol, setRequireSymbol] = useState(false);
  const [checkBreached, setCheckBreached] = useState(false);
  const [maxAgeDays, setMaxAgeDays] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Custom Policies State
  const [customPolicies, setCustomPolicies] = useState<CustomPolicy[]>([
    {
      id: 'pol-1',
      name: 'IP CIDR Access Restriction',
      category: 'network',
      severity: 'strict',
      target_roles: ['SUPER_ADMIN', 'TENANT_ADMIN'],
      description: 'Restrict administrative access to verified office IP subnets.',
      enabled: true,
    },
    {
      id: 'pol-2',
      name: 'Concurrent Session Guard',
      category: 'session',
      severity: 'moderate',
      target_roles: ['ALL'],
      description: 'Limit member accounts to a maximum of 3 concurrent active sessions.',
      enabled: true,
    },
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyCategory, setNewPolicyCategory] = useState<'network' | 'session' | 'device' | 'identity'>('identity');
  const [newPolicySeverity, setNewPolicySeverity] = useState<'strict' | 'moderate' | 'advisory'>('moderate');
  const [newPolicyRole, setNewPolicyRole] = useState('ALL');
  const [newPolicyDesc, setNewPolicyDesc] = useState('');

  useEffect(() => {
    apiFetch('/v1/ondi/org/policies').then(res => {
      setTimeoutMinutes(res.timeout_minutes ?? 60);
      setMfaRequired(!!res.mfa_required);
      setMinLength(res.password_min_length ?? 8);
      setRequireMixedCase(!!res.password_require_mixed_case);
      setRequireNumber(!!res.password_require_number);
      setRequireSymbol(!!res.password_require_symbol);
      setCheckBreached(!!res.password_check_breached);
      setMaxAgeDays(res.password_max_age_days ?? null);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function save() {
    if (!canManagePolicies) {
      showAlert('You do not have policy management privileges.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/v1/ondi/org/policies', {
        method: 'PATCH',
        body: JSON.stringify({
          timeout_minutes: timeoutMinutes, mfa_required: mfaRequired,
          password_min_length: minLength, password_require_mixed_case: requireMixedCase,
          password_require_number: requireNumber, password_require_symbol: requireSymbol,
          password_check_breached: checkBreached, password_max_age_days: maxAgeDays,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      showAlert(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCreatePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!newPolicyName.trim()) return;
    if (!canManagePolicies) {
      showAlert('You do not have policy creation privileges.');
      return;
    }

    const created: CustomPolicy = {
      id: `pol-${Date.now()}`,
      name: newPolicyName.trim(),
      category: newPolicyCategory,
      severity: newPolicySeverity,
      target_roles: [newPolicyRole],
      description: newPolicyDesc.trim() || 'Custom workspace security policy rule.',
      enabled: true,
    };

    setCustomPolicies(prev => [created, ...prev]);
    setShowCreateModal(false);
    setNewPolicyName('');
    setNewPolicyDesc('');
    showAlert(`Created policy "${created.name}".`, { variant: 'success' });
  }

  function toggleCustomPolicy(id: string) {
    if (!canManagePolicies) return;
    setCustomPolicies(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  }

  const activeRulesCount = [requireMixedCase, requireNumber, requireSymbol, checkBreached, maxAgeDays !== null].filter(Boolean).length;

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="Security"
        titleEm="policies"
        subtitle="Workspace-wide security parameters and custom access governance rules live enforced across all accounts."
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              disabled={!canManagePolicies}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--white)',
                color: 'var(--teal)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md, 12px)',
                padding: '10px 18px',
                fontFamily: 'var(--font)',
                fontWeight: 700,
                fontSize: 13,
                cursor: canManagePolicies ? 'pointer' : 'not-allowed',
                opacity: canManagePolicies ? 1 : 0.6,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              <Icon name="plusCircle" size={16} /> Create Custom Policy
            </button>

            <button
              type="button"
              onClick={save}
              disabled={saving || !loaded || !canManagePolicies}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--teal)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--r-md, 12px)',
                padding: '10px 20px',
                fontFamily: 'var(--font)',
                fontWeight: 700,
                fontSize: 13,
                cursor: canManagePolicies ? 'pointer' : 'not-allowed',
                opacity: (saving || !loaded || !canManagePolicies) ? 0.6 : 1,
                boxShadow: '0 2px 10px rgba(0, 181, 137, 0.3)'
              }}
            >
              <Icon name="check" size={16} />
              {saving ? 'Saving…' : saved ? 'Saved Policies ✓' : 'Save Policies'}
            </button>
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div className="ondi-kpi-grid">
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Session Timeout</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#ecfeff', color: 'var(--teal)' }}>
              <Icon name="clock" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{timeoutMinutes}m</span>
            <span className="ondi-kpi-sub">inactivity limit</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Two-Factor Requirement</span>
            <div className="ondi-kpi-icon-box" style={{
              background: mfaRequired ? '#ecfdf5' : '#fffbeb',
              color: mfaRequired ? '#047857' : '#b45309'
            }}>
              <Icon name="shield" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ fontSize: 22, color: mfaRequired ? '#047857' : '#b45309' }}>
              {mfaRequired ? 'Required' : 'Optional'}
            </span>
          </div>
          <div className="ondi-kpi-sub" style={{ marginTop: -4 }}>
            Tenant-wide 2FA status
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Password Complexity</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#eff6ff', color: '#1e40af' }}>
              <Icon name="lock" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{minLength} <span style={{ fontSize: 14, fontWeight: 600 }}>chars</span></span>
          </div>
          <div className="ondi-kpi-sub" style={{ marginTop: -4 }}>
            {activeRulesCount} active complexity rules
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Custom Policy Rules</span>
            <div className="ondi-kpi-icon-box" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <Icon name="fileText" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: '#7c3aed' }}>{customPolicies.filter(p => p.enabled).length}</span>
            <span className="ondi-kpi-sub">active custom rules</span>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Section 1: Session Inactivity Timeout */}
        <SectionCard title="Session Inactivity Timeout">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0, lineHeight: 1.5 }}>
              Signs members out automatically after this duration of inactivity. Enforced live on every API request across web &amp; mobile clients.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={timeoutMinutes}
                  disabled={!canManagePolicies}
                  onChange={e => setTimeoutMinutes(Number(e.target.value))}
                  style={{
                    width: 120,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    fontWeight: 700,
                    fontSize: 14
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>minutes</span>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[15, 30, 60, 120, 480].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    disabled={!canManagePolicies}
                    onClick={() => setTimeoutMinutes(mins)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: timeoutMinutes === mins ? '1px solid var(--teal)' : '1px solid var(--border)',
                      fontWeight: 700,
                      fontSize: 12.5,
                      cursor: canManagePolicies ? 'pointer' : 'not-allowed',
                      background: timeoutMinutes === mins ? 'var(--teal-l)' : 'var(--bg)',
                      color: timeoutMinutes === mins ? 'var(--teal)' : 'var(--ink3)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 2: Two-Factor Authentication */}
        <SectionCard title="Two-Factor Authentication Requirement">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FeatureToggleRow
              title="Require 2FA for everyone in this workspace"
              description="Enforces 2FA or passkey registration across all member accounts upon sign-in."
              icon={<Icon name="shield" size={18} />}
              checked={mfaRequired}
              onCheckedChange={val => { if (canManagePolicies) setMfaRequired(val); }}
            />

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 8,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1e40af',
              fontSize: 13
            }}>
              <Icon name="info" size={18} style={{ flexShrink: 0 }} />
              <div>
                Track user adoption rates under the{' '}
                <Link to="/ondi/compliance" style={{ color: '#1e40af', fontWeight: 800, textDecoration: 'underline' }}>
                  Compliance Posture
                </Link>{' '}
                analytics page.
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 3: Custom Governance Policies */}
        <SectionCard title="Custom Governance Policies">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0 }}>
                Configure role-targeted authorization policies, IP CIDR restrictions, and session bounds.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                disabled={!canManagePolicies}
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: 'var(--teal)',
                  background: 'var(--teal-l)',
                  border: '1px solid rgba(0,181,137,0.2)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  cursor: canManagePolicies ? 'pointer' : 'not-allowed',
                  opacity: canManagePolicies ? 1 : 0.6
                }}
              >
                + New Policy Rule
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              {customPolicies.map(pol => (
                <div key={pol.id} style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 10,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FeaturedIcon variant={pol.enabled ? 'brand' : 'gray'} size="sm" shape="square">
                        <Icon name={pol.category === 'network' ? 'globe' : pol.category === 'session' ? 'clock' : 'shield'} size={15} />
                      </FeaturedIcon>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{pol.name}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginTop: 2 }}>
                          {pol.category} · {pol.target_roles.join(', ')}
                        </div>
                      </div>
                    </div>

                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: canManagePolicies ? 'pointer' : 'default' }}>
                      <input
                        type="checkbox"
                        checked={pol.enabled}
                        disabled={!canManagePolicies}
                        onChange={() => toggleCustomPolicy(pol.id)}
                        style={{ width: 18, height: 18, accentColor: 'var(--teal)', cursor: 'pointer' }}
                      />
                    </label>
                  </div>

                  <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.4 }}>
                    {pol.description}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
                    <Badge variant={pol.severity === 'strict' ? 'error' : pol.severity === 'moderate' ? 'warning' : 'gray'}>
                      {pol.severity} Severity
                    </Badge>
                    <Badge variant={pol.enabled ? 'success' : 'gray'}>
                      {pol.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Section 4: Password Complexity & Rotation */}
        <SectionCard title="Password Complexity & Rotation">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0, lineHeight: 1.5 }}>
              Applied whenever anyone sets a password — onboarding, invitation acceptance, password resets, and self-service updates.
            </p>

            <div style={{
              padding: 16,
              borderRadius: 10,
              background: 'var(--bg)',
              border: '1px solid var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Minimum Password Length</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>We recommend at least 12 characters for administrator accounts.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={8}
                  max={128}
                  value={minLength}
                  disabled={!canManagePolicies}
                  onChange={e => setMinLength(Number(e.target.value))}
                  style={{
                    width: 80,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--white)',
                    color: 'var(--ink)',
                    fontWeight: 700,
                    fontSize: 13,
                    textAlign: 'center'
                  }}
                />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink3)' }}>chars</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-soft)' }}>
              <SwitchRow
                title="Require uppercase & lowercase letters"
                description="Requires at least one uppercase (A-Z) and one lowercase (a-z) character."
                checked={requireMixedCase}
                onCheckedChange={val => { if (canManagePolicies) setRequireMixedCase(val); }}
              />

              <SwitchRow
                title="Require numeric digits"
                description="Requires at least one numeric digit (0-9)."
                checked={requireNumber}
                onCheckedChange={val => { if (canManagePolicies) setRequireNumber(val); }}
              />

              <SwitchRow
                title="Require special symbols"
                description="Requires at least one special symbol character (@, #, $, !, %, etc.)."
                checked={requireSymbol}
                onCheckedChange={val => { if (canManagePolicies) setRequireSymbol(val); }}
              />

              <SwitchRow
                title="Check against compromised breach databases"
                description="Uses Have I Been Pwned's k-anonymity API to block known breached passwords."
                checked={checkBreached}
                onCheckedChange={val => { if (canManagePolicies) setCheckBreached(val); }}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Custom Policy Creation Modal */}
      {showCreateModal && (
        <div className="ondi-modal-backdrop">
          <div className="ondi-modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Create Custom Policy Rule</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Define target scopes, enforcement levels, and security requirements.</div>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePolicy} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Policy Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mandatory Admin IP Subnet Restriction"
                  value={newPolicyName}
                  onChange={e => setNewPolicyName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Category</label>
                  <select
                    value={newPolicyCategory}
                    onChange={e => setNewPolicyCategory(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13 }}
                  >
                    <option value="identity">Identity &amp; Auth</option>
                    <option value="network">Network &amp; IP</option>
                    <option value="session">Session &amp; Limits</option>
                    <option value="device">Device &amp; Endpoint</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Severity Level</label>
                  <select
                    value={newPolicySeverity}
                    onChange={e => setNewPolicySeverity(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13 }}
                  >
                    <option value="strict">Strict (Blocking)</option>
                    <option value="moderate">Moderate (Warning)</option>
                    <option value="advisory">Advisory (Audit Only)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Target Role Scope</label>
                <select
                  value={newPolicyRole}
                  onChange={e => setNewPolicyRole(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13 }}
                >
                  <option value="ALL">All Workspace Members</option>
                  <option value="SUPER_ADMIN">Super Admins Only</option>
                  <option value="TENANT_ADMIN">Tenant Admins Only</option>
                  <option value="STAFF">Staff &amp; Members Only</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Policy Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe the governance requirement and target parameters..."
                  value={newPolicyDesc}
                  onChange={e => setNewPolicyDesc(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink2)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPolicyName.trim()}
                  style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !newPolicyName.trim() ? 0.6 : 1 }}
                >
                  Create Policy Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OndiPolicies;

