import React, { useState } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Icon } from '../components/Icon.js';

type Tab = 'general' | 'notifications' | 'stages' | 'users' | 'integrations';

const STAGES = [
  'DOCS_RECEIVED','VALIDATION','PERMITS','ENTRY_PREP','TANCIS_REG',
  'ASSESSMENT','TAX_PAYMENT','DO_APPLICATION','INSPECTION_BOOKING','INSPECTION',
  'GOV_REMARKS','RELEASE','ICD_PAYMENT','GATE_PASS','TRANSPORT',
  'DELIVERY','EMPTY_RETURN','INVOICING','CLOSED',
];

const SLA_DEFAULTS: Record<string, number> = {
  DOCS_RECEIVED: 1, VALIDATION: 2, PERMITS: 3, ENTRY_PREP: 1,
  TANCIS_REG: 2, ASSESSMENT: 3, TAX_PAYMENT: 1, DO_APPLICATION: 2,
  INSPECTION_BOOKING: 1, INSPECTION: 2, GOV_REMARKS: 3, RELEASE: 1,
  ICD_PAYMENT: 1, GATE_PASS: 1, TRANSPORT: 2, DELIVERY: 1,
  EMPTY_RETURN: 5, INVOICING: 3, CLOSED: 1,
};

function TabBtn({ id, label, active, onClick }: { id: Tab; label: string; active: boolean; onClick: (t: Tab) => void }) {
  return (
    <button type="button" className={`dpt${active ? ' on' : ''}`} onClick={() => onClick(id)}>{label}</button>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 'var(--r)', border: 'none', cursor: 'pointer',
        background: value ? 'var(--teal)' : 'var(--border2)', position: 'relative',
        transition: 'background 0.2s',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 22 : 3,
        width: 18, height: 18, borderRadius: '50%', background: 'var(--white)',
        transition: 'left 0.2s', boxShadow: 'var(--elev-sm)',
      }} />
    </button>
  );
}

export const Setup: React.FC = () => {
  const [tab, setTab] = useState<Tab>('general');
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState({
    company_name: 'ClearOS Freight Solutions',
    country: 'Tanzania',
    currency: 'TZS',
    free_time_days: 7,
    whatsapp_enabled: true,
    email_enabled: false,
    auto_risk_flags: true,
    demurrage_alert_days: 3,
    sla_reminder_hours: 24,
    sla_days: { ...SLA_DEFAULTS },
  });

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleCfg = (key: keyof typeof config) => setConfig(p => ({ ...p, [key]: !p[key] }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Setup</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>System configuration and preferences</div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={save}>
          {saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>

      <div className="dp-tabs" style={{ borderRadius: 0, flexShrink: 0 }}>
        <TabBtn id="general"      label="General"       active={tab==='general'}       onClick={setTab} />
        <TabBtn id="notifications" label="Notifications" active={tab==='notifications'} onClick={setTab} />
        <TabBtn id="stages"       label="SLA / Stages"  active={tab==='stages'}        onClick={setTab} />
        <TabBtn id="users"        label="Users"         active={tab==='users'}         onClick={setTab} />
        <TabBtn id="integrations" label="Integrations"  active={tab==='integrations'}  onClick={setTab} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {tab === 'general' && (
          <>
            <Row label="Company Name" desc="Your company or brokerage trading name">
              <input className="input-field" style={{ width: 240 }} value={config.company_name} onChange={e => setConfig(p => ({ ...p, company_name: e.target.value }))} />
            </Row>
            <Row label="Operating Country">
              <input className="input-field" style={{ width: 160 }} value={config.country} onChange={e => setConfig(p => ({ ...p, country: e.target.value }))} />
            </Row>
            <Row label="Primary Currency">
              <Select value={config.currency} onValueChange={v => setConfig(p => ({ ...p, currency: v }))}>
                <SelectTrigger style={{ width: 120 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TZS">TZS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Default Container Free Time" desc="Days before demurrage charges begin">
              <input type="number" className="input-field" style={{ width: 80 }} value={config.free_time_days} onChange={e => setConfig(p => ({ ...p, free_time_days: Number(e.target.value) }))} />
            </Row>
            <Row label="Auto Risk Flagging" desc="Automatically flag shipments that breach demurrage or SLA thresholds">
              <Toggle value={config.auto_risk_flags} onChange={v => setConfig(p => ({ ...p, auto_risk_flags: v }))} />
            </Row>
          </>
        )}

        {tab === 'notifications' && (
          <>
            <Row label="WhatsApp Notifications" desc="Send stage updates to customers via WhatsApp">
              <Toggle value={config.whatsapp_enabled} onChange={() => toggleCfg('whatsapp_enabled')} />
            </Row>
            <Row label="Email Notifications" desc="Send update emails (requires SMTP configuration)">
              <Toggle value={config.email_enabled} onChange={() => toggleCfg('email_enabled')} />
            </Row>
            <Row label="Demurrage Alert Lead Time" desc="Days before free time ends to trigger alert">
              <input type="number" className="input-field" style={{ width: 80 }} value={config.demurrage_alert_days} onChange={e => setConfig(p => ({ ...p, demurrage_alert_days: Number(e.target.value) }))} />
            </Row>
            <Row label="SLA Reminder" desc="Hours before SLA breach to send reminder">
              <input type="number" className="input-field" style={{ width: 80 }} value={config.sla_reminder_hours} onChange={e => setConfig(p => ({ ...p, sla_reminder_hours: Number(e.target.value) }))} />
            </Row>
          </>
        )}

        {tab === 'stages' && (
          <>
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--ink3)' }}>
              Set the maximum number of working days allowed per stage before an SLA breach is flagged.
            </div>
            {STAGES.map(stage => (
              <Row key={stage} label={stage.replace(/_/g, ' ')} >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" min={1} max={30}
                    className="input-field"
                    style={{ width: 70 }}
                    value={config.sla_days[stage] ?? 2}
                    onChange={e => setConfig(p => ({ ...p, sla_days: { ...p.sla_days, [stage]: Number(e.target.value) } }))}
                  />
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>days</span>
                </div>
              </Row>
            ))}
          </>
        )}

        {tab === 'users' && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink3)' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Icon name="users" size={32} strokeWidth={1.25} /></div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>User Management</div>
            <div style={{ fontSize: 13 }}>Manage users via Tenant Administration.</div>
          </div>
        )}

        {tab === 'integrations' && (
          <>
            <Row label="WhatsApp Business API" desc="Meta Cloud API for customer notifications (via phone_wa field)">
              <span className="badge badge-teal">Connected</span>
            </Row>
            <Row label="TANCIS / TRA Portal" desc="Tanzania Customs Information System integration">
              <span className="badge badge-grey">Manual</span>
            </Row>
            <Row label="TPA Port Authority" desc="Tanzania Ports Authority container status API">
              <span className="badge badge-grey">Not configured</span>
            </Row>
            <Row label="MinIO Document Storage" desc="S3-compatible object storage for shipment documents">
              <span className="badge badge-teal">Connected</span>
            </Row>
            <Row label="Redis / BullMQ" desc="Background job processing and real-time queues">
              <span className="badge badge-teal">Connected</span>
            </Row>
          </>
        )}
      </div>
    </div>
  );
};
