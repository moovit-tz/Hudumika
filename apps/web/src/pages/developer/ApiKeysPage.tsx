import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Switch } from '../../components/ui/switch.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import { apiFetch } from '../../lib/api.js';
import './ApiKeysPage.css';

interface ApiIntegrationItem {
  id: string;
  name: string;
  keyMasked: string;
  rawKey?: string;
  dailyCalls: number;
  active: boolean;
  category: string;
}

const INITIAL_INTEGRATIONS: ApiIntegrationItem[] = [
  { id: '1', name: 'User Auth System', keyMasked: 'f6g772hr9RDTfUaSclTf', dailyCalls: 15000, active: true, category: 'Auth' },
  { id: '2', name: 'Social Media Manager', keyMasked: 's1t2u3v4w5x6y7z8a9', dailyCalls: 12000, active: false, category: 'Marketing' },
  { id: '3', name: 'SMS Notification Service', keyMasked: 't2u3v4w5x6y7z8a9b1', dailyCalls: 19000, active: false, category: 'Messaging' },
  { id: '4', name: 'Shipping Coordinator', keyMasked: 't6u7v8w9x0CVBnNISc', dailyCalls: 14000, active: true, category: 'Logistics' },
  { id: '5', name: 'SEO Analyzer', keyMasked: 'b1c2d3e4f5g6h7i8j9', dailyCalls: 6000, active: false, category: 'Analytics' },
  { id: '6', name: 'Sales Forecasting', keyMasked: 'z9x8v1c2d3e4f5g6h7', dailyCalls: 11500, active: false, category: 'Finance' },
  { id: '7', name: 'Quick Pay Service', keyMasked: 'a1b7xc3dy47szQVk1Qp', dailyCalls: 10000, active: true, category: 'Payments' },
  { id: '8', name: 'Project Management', keyMasked: 'v9w0x5y7z8a9b1c2d3', dailyCalls: 14500, active: false, category: 'Productivity' },
  { id: '9', name: 'Payment Gateway', keyMasked: '1p2q3r4s5DfgHPgPy', dailyCalls: 25000, active: true, category: 'Payments' },
  { id: '10', name: 'Order Tracking Sys', keyMasked: 'e1E2gHGb84YrhJvOtS', dailyCalls: 9500, active: false, category: 'Operations' },
];

const FAQS = [
  {
    q: 'How is pricing determined for each plan ?',
    a: 'Pricing is based on your tier and monthly billable API calls. Each plan includes a generous monthly free allowance, after which tiered unit rates apply per endpoint invocation.',
  },
  {
    q: 'What payment methods are accepted for subscriptions ?',
    a: 'We accept all major credit cards (Visa, MasterCard, Amex), Mobile Money (M-Pesa, Airtel Money, Tigo Pesa), and automated corporate bank transfers via invoicing.',
  },
  {
    q: 'Are there any hidden fees in the pricing ?',
    a: 'No hidden fees. You only pay for what you use above your plan quotas with zero setup charges, zero maintenance surcharges, and clear real-time usage telemetry.',
  },
  {
    q: 'Is there a discount for annual subscriptions ?',
    a: 'Yes, annual subscriptions receive a 20% discount across all platform tiers, along with priority enterprise SLA and dedicated developer onboarding support.',
  },
  {
    q: 'Do you offer refunds on subscription cancellations ?',
    a: 'You can cancel anytime directly from Workspace Billing. Remaining prepaid balances and prorated unused periods are credited back to your account.',
  },
  {
    q: 'Can I add extra features to my current plan ?',
    a: 'Yes! Custom add-ons such as dedicated IP rate limits, custom webhook retention, and high-frequency webhook retries can be activated with a single click.',
  },
];

export const ApiKeysPage: React.FC = () => {
  const navigate = useNavigate();

  // Public Master Key State
  const [publicApiKey, setPublicApiKey] = useState('abc123xyz456sample789key000');
  const [isPublicPaused, setIsPublicPaused] = useState(false);
  const [copiedMaster, setCopiedMaster] = useState(false);

  // Integrations List State
  const [integrations, setIntegrations] = useState<ApiIntegrationItem[]>(INITIAL_INTEGRATIONS);
  const [isPauseAll, setIsPauseAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newIntegrationName, setNewIntegrationName] = useState('');
  const [newIntegrationCategory, setNewIntegrationCategory] = useState('Logistics');

  // Webhook State
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookName, setWebhookName] = useState('CosFactorHook');
  const [webhookEventType, setWebhookEventType] = useState('All Events');
  const [savingWebhook, setSavingWebhook] = useState(false);

  // FAQ Accordion State
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // Copy to Clipboard Helper
  const handleCopy = (text: string, isMaster: boolean, id?: string) => {
    navigator.clipboard.writeText(text);
    if (isMaster) {
      setCopiedMaster(true);
      setTimeout(() => setCopiedMaster(false), 2000);
    } else if (id) {
      setCopiedKeyId(id);
      setTimeout(() => setCopiedKeyId(null), 2000);
    }
    showAlert('API Key copied to clipboard.');
  };

  // Toggle Single Integration Status
  const handleToggleIntegration = (id: string) => {
    setIntegrations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, active: !item.active } : item))
    );
  };

  // Toggle Pause All
  const handleTogglePauseAll = () => {
    const nextState = !isPauseAll;
    setIsPauseAll(nextState);
    setIntegrations((prev) => prev.map((item) => ({ ...item, active: !nextState })));
  };

  // Checkbox Select Toggle
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === integrations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(integrations.map((i) => i.id)));
    }
  };

  // Add New Integration
  const handleAddIntegration = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIntegrationName.trim()) return;

    const randomKey = `hud_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    const newItem: ApiIntegrationItem = {
      id: String(Date.now()),
      name: newIntegrationName.trim(),
      keyMasked: `${randomKey.slice(0, 10)}...${randomKey.slice(-4)}`,
      rawKey: randomKey,
      dailyCalls: 0,
      active: true,
      category: newIntegrationCategory,
    };

    setIntegrations((prev) => [newItem, ...prev]);
    setIsAddModalOpen(false);
    setNewIntegrationName('');
    showAlert(`API Integration "${newItem.name}" registered successfully.`);
  };

  // Save Webhook Settings
  const handleSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      await apiFetch('/v1/developer/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          name: webhookName,
          url: webhookUrl,
          event_type: webhookEventType,
        }),
      });
      showAlert('Webhook configuration saved successfully.');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Webhook settings could not be saved.');
    } finally {
      setSavingWebhook(false);
    }
  };

  return (
    <div className="api-keys-root">
      {/* ── Top Header ── */}
      <div className="api-keys-header">
        <div className="api-keys-title-group">
          <h1>API Keys</h1>
          <p>Central Hub for Personal Customization</p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="api-keys-privacy-btn"
        >
          Privacy Settings
        </button>
      </div>

      {/* ── Main Two-Column Grid ── */}
      <div className="api-keys-main-grid">
        {/* Left Column Stack */}
        <div className="api-keys-left-stack">
          {/* 1. Public API Key Card */}
          <div className="api-card">
            <div className="api-card-hdr">
              <span className="api-card-title">Public API Key</span>
              <label className="api-toggle-label">
                <span>Pause</span>
                <div>
                  <Switch
                    checked={isPublicPaused}
                    onCheckedChange={setIsPublicPaused}
                    aria-label="Pause public API key"
                  />
                </div>
              </label>
            </div>

            <div className="api-key-input-row">
              <span className="api-key-label">API Key</span>
              <div className="api-key-field-wrap">
                <input
                  type="text"
                  readOnly
                  value={publicApiKey}
                  className="api-key-field-input"
                />
                <button
                  type="button"
                  title="Copy API Key"
                  onClick={() => handleCopy(publicApiKey, true)}
                  className="api-key-copy-btn"
                >
                  <Icon name={copiedMaster ? 'check' : 'copy'} size={15} />
                </button>
              </div>
            </div>

            {/* User Access Hero Banner */}
            <div className="api-access-banner">
              <div className="api-access-left">
                <div className="api-access-avatar">
                  <Icon name="user" size={20} />
                </div>
                <div className="api-access-info">
                  <div className="api-access-title-row">
                    <span className="api-access-title">User Access</span>
                    <span className="api-access-badge">16 days left</span>
                  </div>
                  <div className="api-access-scope">
                    This API key can only access <strong>@keenthemes</strong>
                  </div>
                  <div className="api-access-sub">
                    Secure access with a unique API key for enhanced functionality.
                  </div>
                </div>
              </div>

              <div className="api-access-actions">
                <button
                  type="button"
                  onClick={() => navigate('/workspace/billing')}
                  className="api-btn-renew"
                >
                  Renew Plan
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/developer?tab=marketplace')}
                  className="api-btn-docs"
                >
                  Docs
                </button>
              </div>
            </div>

            <p className="api-card-desc">
              Use the API to connect your application to Hudumika services and
              build workflows around your operational data.
            </p>
          </div>

          {/* 2. API Integrations Card & Table */}
          <div className="api-card">
            <div className="api-card-hdr">
              <span className="api-card-title">API Integrations</span>
              <div className="api-integrations-hdr-actions">
                <label className="api-toggle-label">
                  <span>Pause all</span>
                  <div>
                    <Switch
                      checked={isPauseAll}
                      onCheckedChange={handleTogglePauseAll}
                      aria-label="Pause all integrations"
                    />
                  </div>
                </label>

                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="api-btn-add"
                >
                  <Icon name="plus" size={13} />
                  Add New
                </button>

                <button type="button" className="api-btn-filter">
                  <Icon name="sliders" size={13} />
                  Columns
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="api-table-wrap">
              <table className="api-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <Checkbox
                        checked={selectedIds.size === integrations.length && integrations.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all integrations"
                      />
                    </th>
                    <th>Integration ⇕</th>
                    <th>API Key</th>
                    <th>Daily Calls ⇕</th>
                    <th>Status ⇕</th>
                    <th style={{ width: 40, textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {integrations.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => handleToggleSelect(item.id)}
                          aria-label={`Select ${item.name}`}
                        />
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{item.name}</td>
                      <td>
                        <div className="api-table-key-cell">
                          <span>{item.keyMasked}</span>
                          <button
                            type="button"
                            title="Copy API Key"
                            onClick={() => handleCopy(item.keyMasked, false, item.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer' }}
                          >
                            <Icon name={copiedKeyId === item.id ? 'check' : 'copy'} size={13} color={copiedKeyId === item.id ? 'var(--teal)' : 'currentColor'} />
                          </button>
                        </div>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--ink2)' }}>
                        {item.dailyCalls.toLocaleString()}
                      </td>
                      <td>
                        <div>
                          <Switch
                            checked={item.active}
                            onCheckedChange={() => handleToggleIntegration(item.id)}
                            aria-label={`${item.active ? 'Disable' : 'Enable'} ${item.name}`}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          title="Edit Settings"
                          onClick={() => showAlert(`Managing configuration for ${item.name}`)}
                          style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 4 }}
                        >
                          <Icon name="edit" size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>

          {/* 3. Webhooks Card */}
          <div className="api-card">
            <div className="api-card-hdr" style={{ marginBottom: 6 }}>
              <span className="api-card-title">Webhooks</span>
            </div>
            <p className="api-card-desc" style={{ marginBottom: 16 }}>
              Set up webhooks to notify external services when records or statuses change.
            </p>

            <div className="api-webhook-form">
              <div className="api-webhook-field-row">
                <label className="api-webhook-label">Webhook URL</label>
                <input
                  type="text"
                  placeholder="Enter URL e.g. https://api.client.com/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="api-webhook-input"
                />
              </div>

              <div className="api-webhook-field-row">
                <label className="api-webhook-label">Webhook Name</label>
                <input
                  type="text"
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  className="api-webhook-input"
                />
              </div>

              <div className="api-webhook-field-row">
                <label className="api-webhook-label">Event Type</label>
                <Select value={webhookEventType} onValueChange={setWebhookEventType}>
                  <SelectTrigger className="w-full font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Events">All Events</SelectItem>
                    <SelectItem value="Shipment Events">Shipment &amp; Milestone Events</SelectItem>
                    <SelectItem value="Container Events">Container Tracking &amp; Demurrage Events</SelectItem>
                    <SelectItem value="Invoice Events">Invoice &amp; Payment Events</SelectItem>
                    <SelectItem value="Auth Events">Authentication &amp; User Events</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="api-webhook-footer-bar">
              <span className="api-breadcrumb-crumb">My Account › API Keys</span>
              <button
                type="button"
                disabled={savingWebhook}
                onClick={handleSaveWebhook}
                className="api-btn-add"
              >
                <Icon name="save" size={13} />
                {savingWebhook ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar Stack */}
        <div className="api-sidebar-stack">
          {/* Card 1: Project API keys */}
          <div className="api-sidebar-card">
            <span className="api-sidebar-title">Project API keys</span>
            <p className="api-sidebar-desc">
              Activate 'Do Not Disturb' to silence all notifications and focus without interruptions
              during specified hours or tasks.
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="api-sidebar-link">Learn more</span>
              <button
                type="button"
                onClick={() => navigate('/developer?tab=marketplace')}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold bg-[var(--bg)] border border-[var(--border)] text-[var(--ink)] hover:border-teal-500 transition-colors"
              >
                <Icon name="fileText" size={12} color="var(--teal)" />
                Client Docs
              </button>
            </div>
          </div>

          {/* Card 2: Streamlined Alerts Setup */}
          <div className="api-sidebar-card">
            <div className="api-sidebar-icon">
              <Icon name="zap" size={17} />
            </div>
            <span className="api-sidebar-title">
              Streamlined Alerts Setup: Custom Notification Preferences
            </span>
            <p className="api-sidebar-desc">
              Easily integrate and manage your APIs with our suite of configuration tools. Gain
              access to extensive instructions, expert support, and in-depth documentation to keep
              your API interactions efficient and up-to-date.
            </p>
            <span className="api-sidebar-link">Learn more</span>
          </div>

          {/* Card 3: Enhancing Connectivity */}
          <div className="api-sidebar-card">
            <div className="api-sidebar-icon">
              <Icon name="share" size={17} />
            </div>
            <span className="api-sidebar-title">
              Enhancing Connectivity: Tools for API Expansion
            </span>
            <p className="api-sidebar-desc">
              Leverage the full potential of your APIs with our advanced expansion tools. We provide
              all the necessary resources for easy setup, information exchange, and maintaining
              high-performance API connectivity.
            </p>
            <span className="api-sidebar-link">Learn more</span>
          </div>

          {/* Card 4: Organizing Team Data */}
          <div className="api-sidebar-card">
            <div className="api-sidebar-icon">
              <Icon name="users" size={17} />
            </div>
            <span className="api-sidebar-title">
              Organizing Team Data: Efficient Roster Solutions
            </span>
            <p className="api-sidebar-desc">
              Organize your API data more with our detailed interface solutions. From quick setup
              guides to management, our tools are designed to streamline every step of your API data
              organization.
            </p>
            <span className="api-sidebar-link">Learn more</span>
          </div>
        </div>
      </div>

      {/* ── Lower Full-Width Section 1: FAQ Accordion ── */}
      <div className="api-card">
        <div className="api-card-hdr" style={{ marginBottom: 12 }}>
          <span className="api-card-title">FAQ</span>
        </div>

        <div className="divide-y divide-[var(--border)]">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={idx} className="api-faq-item">
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="api-faq-trigger"
                >
                  <span>{faq.q}</span>
                  <Icon
                    name="chevronDown"
                    size={14}
                    className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-[var(--teal)]' : 'text-[var(--ink3)]'}`}
                  />
                </button>
                {isOpen && (
                  <div className="api-faq-body">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Lower Full-Width Section 2: Contact Support Banner ── */}
      <div className="api-support-card">
        <div className="api-support-left">
          <h3>Contact Support</h3>
          <p>
            Need assistance? Contact our support team for prompt, personalized help for your queries
            &amp; concerns.
          </p>
          <a
            href="/support"
            onClick={(e) => {
              e.preventDefault();
              navigate('/support');
            }}
            className="api-support-btn"
          >
            Contact Support →
          </a>
        </div>

        {/* Line art support illustration */}
        <div className="flex items-center justify-center p-2 opacity-90">
          <svg width="120" height="90" viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="70" height="50" rx="8" stroke="var(--ink3)" strokeWidth="1.5" strokeDasharray="3 3" fill="var(--bg)" />
            <circle cx="32" cy="30" r="10" stroke="var(--teal)" strokeWidth="1.5" />
            <path d="M22 48 C22 40, 42 40, 42 48" stroke="var(--teal)" strokeWidth="1.5" />
            <rect x="50" y="25" width="22" height="4" rx="2" fill="var(--ink3)" />
            <rect x="50" y="33" width="16" height="4" rx="2" fill="var(--ink3)" opacity="0.6" />
            {/* Dialogue Bubble */}
            <path d="M65 45 L95 45 C100 45, 105 50, 105 55 L105 75 C105 80, 100 85, 95 85 L75 85 L65 92 L68 85 L65 85 C60 85, 55 80, 55 75 L55 55 C55 50, 60 45, 65 45 Z" fill="var(--teal)" fillOpacity="0.12" stroke="var(--teal)" strokeWidth="1.5" />
            <circle cx="75" cy="65" r="2" fill="var(--teal)" />
            <circle cx="82" cy="65" r="2" fill="var(--teal)" />
            <circle cx="89" cy="65" r="2" fill="var(--teal)" />
          </svg>
        </div>
      </div>

      {/* Add New Integration Modal Form */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--white)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-black text-[var(--ink)]">Register API Integration</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-[var(--ink3)] hover:text-[var(--ink)]"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleAddIntegration} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-[var(--ink2)] block mb-1">Integration Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ERP Connector, CRM Sync Service"
                  value={newIntegrationName}
                  onChange={(e) => setNewIntegrationName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] font-bold text-[var(--ink)] focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-[var(--ink2)] block mb-1">Category / Domain</label>
                <Select value={newIntegrationCategory} onValueChange={setNewIntegrationCategory}>
                  <SelectTrigger className="w-full font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Logistics">Logistics &amp; Cargo</SelectItem>
                    <SelectItem value="Payments">Payments &amp; Billing</SelectItem>
                    <SelectItem value="Auth">User Authentication</SelectItem>
                    <SelectItem value="Operations">Operations &amp; Customs</SelectItem>
                    <SelectItem value="Analytics">Analytics &amp; Forecasting</SelectItem>
                    <SelectItem value="Marketing">Marketing &amp; Messaging</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink2)] font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[var(--teal)] text-white font-bold hover:opacity-90"
                >
                  Create Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
