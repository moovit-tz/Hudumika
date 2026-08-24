import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';
import { Badge } from './ui/badge.js';
import { FeaturedIcon } from './ui/featured-icon.js';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion.js';

type PhaseKey = 'foundation' | 'finance' | 'crm' | 'operations' | 'people' | 'compliance' | 'automate';

interface ChecklistItem {
  title: string;
  desc: string;
  to: string;
}

interface Phase {
  key: PhaseKey;
  name: string;
  blurb: string;
  items: ChecklistItem[];
}

const PHASES: Phase[] = [
  {
    key: 'foundation', name: 'Foundation', blurb: 'Before any department, get the workspace itself right',
    items: [
      { title: 'Invite your team', desc: 'Every teammate gets their own identity and a role.', to: '/ondi' },
      { title: 'Company information & localization', desc: 'Legal name, timezone, currency.', to: '/workspace/settings?s=company' },
      { title: 'Branding', desc: 'Logo and accent colour, applied across every app.', to: '/workspace/settings?s=branding' },
      { title: 'Modules & extensions', desc: 'Turn on the departments this workspace needs.', to: '/workspace/settings?s=modules' },
    ],
  },
  {
    key: 'finance', name: 'Finance', blurb: 'FinOps — the backbone every other department bills through',
    items: [
      { title: 'Tax codes', desc: 'VAT and other rates, reused on every quotation and invoice.', to: '/finance/tax-codes' },
      { title: 'Chart of accounts', desc: 'Review the seeded ledger structure and adjust it to fit.', to: '/finance/accounts/chart-of-accounts' },
      { title: 'Payment gateways', desc: 'Connect what this business actually collects through.', to: '/workspace/settings?s=integrations' },
    ],
  },
  {
    key: 'crm', name: 'CRM', blurb: 'Bring in who you already sell to and sell toward',
    items: [
      { title: 'Import customers', desc: 'Bring an existing customer list in as one batch.', to: '/crm/customers/bulk-upload' },
      { title: 'Build your pipeline', desc: 'Leads carry a stage, priority and source out of the box.', to: '/crm/leads' },
    ],
  },
  {
    key: 'operations', name: 'Operations', blurb: 'ClearOS, CargoTracker & HuduFreight — where the freight moves',
    items: [
      { title: 'Review default workflows', desc: 'Sea/Air/Road/Rail/Multimodal defaults are pre-installed — customize per Import/Export/Transit as needed.', to: '/studio/clearance' },
      { title: 'Create your first shipment', desc: 'Operations is really set up once a real case is moving through it.', to: '/clearos' },
    ],
  },
  {
    key: 'people', name: 'People', blurb: 'NexusHR — everyone on the team, formally',
    items: [
      { title: 'Departments', desc: 'The structure employee records and approvals hang off.', to: '/nexushr/departments' },
      { title: 'Employees', desc: 'Each teammate’s HR record — role, department, employment details.', to: '/nexushr/employees' },
      { title: 'Leave policies', desc: 'Leave types and entitlements, set before the first request comes in.', to: '/nexushr/leaves' },
      { title: 'Payroll', desc: 'The last HR step, once everyone above is in the system correctly.', to: '/nexushr/payroll' },
    ],
  },
  {
    key: 'compliance', name: 'Compliance', blurb: 'ComplyOS — the regulatory side of the same business',
    items: [
      { title: 'Obligations calendar', desc: 'Recurring regulatory deadlines this business is on the hook for.', to: '/complyos/obligations' },
      { title: 'Licence catalogue', desc: 'Every licence this business needs to hold.', to: '/complyos/license-catalog' },
    ],
  },
  {
    key: 'automate', name: 'Automate', blurb: 'Studio — once every department above is real, connect them',
    items: [
      { title: 'Build a workflow automation', desc: 'ClearOS, SEAL, FinOps, Bliss, HuduFreight, CargoTracker and NexusHR each have their own automation surface.', to: '/studio/templates' },
    ],
  },
];

type Checklist = Record<PhaseKey, boolean>;

const DISMISS_KEY = 'hudumika_setup_guide_dismissed';

export function SetupGuideWidget() {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');

  useEffect(() => {
    let cancelled = false;
    apiFetch('/v1/setup-guide/checklist')
      .then(res => { if (!cancelled) setChecklist(res.data); })
      .catch(err => console.error('Failed to load setup guide checklist:', err));
    return () => { cancelled = true; };
  }, []);

  if (!checklist || dismissed) return null;

  const doneCount = PHASES.filter(p => checklist[p.key]).length;
  if (doneCount === PHASES.length) return null; // fully set up — nothing left to guide

  const firstIncomplete = PHASES.find(p => !checklist[p.key])?.key;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  return (
    <section className="wh-new-section" style={{ marginBottom: 24 }}>
      <div className="wh-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 className="wh-section-title">Getting started</h2>
          <Badge variant="brand">{doneCount}/{PHASES.length} set up</Badge>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          title="Hide this guide"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, padding: 4 }}
        >
          <Icon name="x" size={14} /> Hide
        </button>
      </div>
      <div style={{ background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginTop: 10 }}>
        <Accordion type="single" collapsible defaultValue={firstIncomplete} className="flex flex-col gap-2 p-2">
          {PHASES.map(phase => {
            const done = checklist[phase.key];
            return (
              <AccordionItem key={phase.key} value={phase.key}>
                <AccordionTrigger>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <FeaturedIcon variant={done ? 'success' : 'gray'} size="sm" shape="circle">
                      <Icon name={done ? 'checkCircle' : 'circle'} size={16} />
                    </FeaturedIcon>
                    <div style={{ textAlign: 'left' }}>
                      <div>{phase.name}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--ink3)' }}>{phase.blurb}</div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {phase.items.map(item => (
                      <Link
                        key={item.title}
                        to={item.to}
                        style={{
                          display: 'block', padding: '10px 12px', borderRadius: 8,
                          border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{item.desc}</div>
                      </Link>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </section>
  );
}

export default SetupGuideWidget;
