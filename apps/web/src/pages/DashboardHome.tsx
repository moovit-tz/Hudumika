import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

/* ── Module definitions ── */
interface Module {
  id: string;
  title: string;
  description: string;
  path: string;
  linkLabel: string;
  color: string;
  icon: React.ReactNode;
}

/* Large illustrative icons per module */
const CFA_ICON = (
  <svg width="38" height="38" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 36 L6 28 L24 18 L42 28 L42 36"/>
    <path d="M12 28 L12 36"/>
    <path d="M24 18 L24 36"/>
    <path d="M36 28 L36 36"/>
    <rect x="4" y="36" width="40" height="5" rx="1"/>
    <path d="M20 36 L20 28 L28 28 L28 36"/>
    <circle cx="24" cy="12" r="4"/>
    <path d="M24 8 L24 5 M20.5 9.5 L18 7 M27.5 9.5 L30 7"/>
  </svg>
);

const FIN_ICON = (
  <svg width="38" height="38" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="8" width="36" height="32" rx="3"/>
    <line x1="6" y1="16" x2="42" y2="16"/>
    <line x1="16" y1="8" x2="16" y2="40"/>
    <circle cx="29" cy="28" r="6"/>
    <path d="M29 24 L29 32 M25 28 L33 28"/>
    <rect x="10" y="20" width="4" height="3" rx="1"/>
    <rect x="10" y="26" width="4" height="3" rx="1"/>
    <rect x="10" y="32" width="4" height="3" rx="1"/>
  </svg>
);

const CRM_ICON = (
  <svg width="38" height="38" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="16" r="7"/>
    <path d="M6 40 C6 32 10 28 18 28 C26 28 30 32 30 40"/>
    <circle cx="34" cy="14" r="5"/>
    <path d="M30 40 C30 34 32 30 37 30 L42 30 C44 30 44 32 44 34 L44 40"/>
    <path d="M20 22 L24 26"/>
  </svg>
);

const TOOLS_ICON = (
  <svg width="38" height="38" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="6" width="14" height="14" rx="2"/>
    <rect x="28" y="6" width="14" height="14" rx="2"/>
    <rect x="6" y="28" width="14" height="14" rx="2"/>
    <rect x="28" y="28" width="14" height="14" rx="2"/>
    <line x1="13" y1="10" x2="13" y2="18"/>
    <line x1="9" y1="14" x2="17" y2="14"/>
    <circle cx="35" cy="13" r="3"/>
    <path d="M9 34 L17 42 M17 34 L9 42"/>
    <path d="M31 32 L39 32 M31 35 L37 35 M31 38 L35 38"/>
  </svg>
);

const MODULES: Module[] = [
  {
    id: 'cfa',
    title: 'Clearance & Freight',
    description:
      'Manage the full lifecycle of customs clearance — from document receipt and declarations through duty payments, demurrage tracking, and final delivery. Sea, air and road freight in one view.',
    path: '/ops',
    linkLabel: 'Open Operations Module',
    color: 'teal',
    icon: CFA_ICON,
  },
  {
    id: 'finance',
    title: 'Finance & Accounts',
    description:
      'Handle invoicing, supplier bills, purchase orders, and expense management. Run profit & loss statements, balance sheets, aged receivables, cash flow, and tax reports from a single unified module.',
    path: '/finance',
    linkLabel: 'Open Finance Module',
    color: 'gold',
    icon: FIN_ICON,
  },
  {
    id: 'crm',
    title: 'CRM & Sales',
    description:
      'Manage your consignee accounts, track sales leads from first contact to closed deal, generate quotations, and maintain full client communication history — all linked to their active shipments.',
    path: '/customers',
    linkLabel: 'Open CRM Module',
    color: 'purple',
    icon: CRM_ICON,
  },
  {
    id: 'tools',
    title: 'Tools & Utilities',
    description:
      'Access the document file manager, internal team chat, and support ticket system. Manage staff records, HR, payroll, and configure system settings — all in one place for day-to-day operations.',
    path: '/documents',
    linkLabel: 'Open Tools',
    color: 'blue',
    icon: TOOLS_ICON,
  },
];

/* ── Module card ── */
function ModuleCard({ mod }: { mod: Module }) {
  const navigate = useNavigate();

  return (
    <div className="hub2-card" data-color={mod.color}
      onClick={() => navigate(mod.path)} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(mod.path)}>

      {/* Icon + text */}
      <div className="hub2-card-body">
        <div className="hub2-card-icon">{mod.icon}</div>
        <div className="hub2-card-text">
          <h3 className="hub2-card-title">{mod.title}</h3>
          <p className="hub2-card-desc">{mod.description}</p>
        </div>
      </div>

      {/* Link row */}
      <div className="hub2-card-foot">
        <span className="hub2-card-link">{mod.linkLabel}</span>
        <svg className="hub2-card-chevron"
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </div>
  );
}

/* ── Page ── */
export const DashboardHome: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const name = user?.name ?? 'there';

  return (
    <div className="hub2-page">

      {/* ── Welcome band ── */}
      <div className="hub2-welcome-band">
        <div className="page-header-crumb">
          <span>ClearOS</span>
          <span className="page-header-crumb-sep">·</span>
          <span>Home</span>
        </div>
        <h1 className="hub2-welcome-title">
          Welcome, <em className="hub2-welcome-em">{name}</em>.
        </h1>
        <p className="hub2-welcome-sub">
          Access and manage your operations from the modules below.
        </p>
      </div>

      {/* ── 2×2 module cards ── */}
      <div className="hub2-grid">
        {MODULES.map(mod => <ModuleCard key={mod.id} mod={mod} />)}
      </div>

      {/* ── Plan card ── */}
      <div className="hub2-plan-card">
        <div className="hub2-plan-text">
          <span className="hub2-plan-name">ClearOS — Enterprise Platform</span>
          <span className="hub2-plan-desc">
            Full access to clearance, finance, CRM, HR and all integrations.
          </span>
        </div>
        <button
          type="button"
          className="hub2-plan-btn"
          onClick={() => navigate('/subscription')}
        >
          Manage Subscription
        </button>
      </div>

      {/* ── Support card ── */}
      <div className="hub2-support-card">
        <div className="hub2-support-icon">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="10" width="40" height="30" rx="3"/>
            <path d="M4 18 L24 28 L44 18"/>
            <line x1="14" y1="34" x2="22" y2="34"/>
            <line x1="14" y1="38" x2="19" y2="38"/>
          </svg>
        </div>
        <div className="hub2-support-text">
          <strong className="hub2-support-title">We're here to help you!</strong>
          <span className="hub2-support-desc">
            Raise a support ticket or chat with our team. We'll get back to you promptly.
          </span>
        </div>
        <button
          type="button"
          className="hub2-support-btn"
          onClick={() => navigate('/support/tickets')}
        >
          Get Support Now
        </button>
      </div>

    </div>
  );
};
