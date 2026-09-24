import React, { useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '../components/ui/dialog.js';
import { PageHeader } from '../components/PageHeader.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { PaginationBar } from '../components/PaginationBar.js';
import { Tip } from '../components/ui/tooltip.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Store.css';
import './StoreEmailTemplatesManager.css';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface MarketplaceTemplate {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  application: string | null;
  event_key: string | null;
  tags: string[];
  subject: string;
  preheader: string;
  body_html: string;
  available_vars: string[];
  version: string;
  downloads: number;
  is_featured: boolean;
  is_hudumika_official: boolean;
  author_name: string;
  status: string;
  published_at: string | null;
}

/* ── Helpers & Category Mapping ────────────────────────────────────────────── */

const CAT_CONFIG: Record<string, { label: string; variant: 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'; icon: IconName; bg: string; color: string }> = {
  finance: { label: 'Finance', variant: 'success', icon: 'invoice', bg: 'var(--green-l)', color: 'var(--green)' },
  auth: { label: 'Auth & Security', variant: 'gray', icon: 'lock', bg: 'var(--surface2)', color: 'var(--ink2)' },
  crm: { label: 'CRM', variant: 'warning', icon: 'users', bg: 'var(--gold-l)', color: 'var(--gold)' },
  hr: { label: 'HR & Payroll', variant: 'info', icon: 'userCheck', bg: 'var(--blue-l)', color: 'var(--blue)' },
  esign: { label: 'eSign', variant: 'info', icon: 'edit', bg: 'var(--blue-l)', color: 'var(--blue)' },
  support: { label: 'Support', variant: 'brand', icon: 'headphones', bg: 'var(--teal-l)', color: 'var(--teal)' },
  clearos: { label: 'ClearOS', variant: 'brand', icon: 'ship', bg: 'var(--purple-l)', color: 'var(--purple)' },
  commerce: { label: 'Commerce', variant: 'success', icon: 'package', bg: 'var(--green-l)', color: 'var(--green)' },
  general: { label: 'General', variant: 'gray', icon: 'mail', bg: 'var(--surface2)', color: 'var(--teal)' },
  projects: { label: 'Projects', variant: 'info', icon: 'folder', bg: 'var(--blue-l)', color: 'var(--blue)' },
  security: { label: 'Security', variant: 'gray', icon: 'lock', bg: 'var(--surface2)', color: 'var(--ink2)' },
};

const FILTER_CATS = [
  { key: 'all', label: 'All Categories' },
  { key: 'finance', label: 'Finance' },
  { key: 'auth', label: 'Auth & Security' },
  { key: 'crm', label: 'CRM' },
  { key: 'hr', label: 'HR & Payroll' },
  { key: 'esign', label: 'eSign' },
  { key: 'support', label: 'Support' },
  { key: 'clearos', label: 'ClearOS' },
  { key: 'commerce', label: 'Commerce' },
  { key: 'general', label: 'General' },
];

function getCategoryIcon(cat: string) {
  const cfg = CAT_CONFIG[cat.toLowerCase()];
  if (cfg) return { icon: cfg.icon, bg: cfg.bg, color: cfg.color, label: cfg.label, variant: cfg.variant };
  return { icon: 'mail' as IconName, bg: 'var(--surface2)', color: 'var(--teal)', label: cat, variant: 'gray' as const };
}

/* ── Helpers for Preview Iframe & Humanized Variables ──────────────────────── */

interface VariableInfo {
  label: string;
  icon: IconName;
  sample: string;
  desc: string;
}

const KNOWN_VARIABLES: Record<string, VariableInfo> = {
  // Customer & Users
  customer_name: { label: 'Customer Name', icon: 'user', sample: 'Sarah Jenkins', desc: 'Recipient / client primary name' },
  client_name: { label: 'Client Name', icon: 'user', sample: 'Acme Corporation', desc: 'Client or account entity name' },
  recipient_name: { label: 'Recipient Name', icon: 'user', sample: 'David Miller', desc: 'Target recipient contact name' },
  recipientName: { label: 'Recipient Name', icon: 'user', sample: 'David Miller', desc: 'Target recipient contact name' },
  user_name: { label: 'User Name', icon: 'user', sample: 'Alex Mercer', desc: 'User account name' },
  employee_name: { label: 'Employee Name', icon: 'userCheck', sample: 'Michael Chang', desc: 'New or active employee name' },
  manager_name: { label: 'Manager Name', icon: 'user', sample: 'Elena Vance', desc: 'Reporting manager name' },
  sender_name: { label: 'Sender Name', icon: 'user', sample: 'Hudumika Support', desc: 'Sender or sender rep name' },
  sharerName: { label: 'Sharer Name', icon: 'user', sample: 'Rachel Zane', desc: 'Person sharing the resource' },
  sharer_name: { label: 'Sharer Name', icon: 'user', sample: 'Rachel Zane', desc: 'Person sharing the resource' },
  author_name: { label: 'Author Name', icon: 'user', sample: 'Hudumika Team', desc: 'Template creator or sender' },

  // Organization & Company
  tenant_name: { label: 'Company Name', icon: 'building', sample: 'Acme Corp Ltd', desc: 'Your workspace or company name' },
  tenant_address: { label: 'Company Address', icon: 'mapPin', sample: '123 Business Tower, Dar es Salaam', desc: 'Physical company mailing address' },
  company_name: { label: 'Company Name', icon: 'building', sample: 'Acme Global Services', desc: 'Registered business name' },

  // Proposals & Documents
  proposal_title: { label: 'Proposal Title', icon: 'fileText', sample: 'Enterprise Cloud Solution', desc: 'Subject title of the business proposal' },
  proposal_url: { label: 'Proposal Link', icon: 'link', sample: 'https://hudumika.com/p/prop-102', desc: 'Direct URL to view the online proposal' },
  valid_until: { label: 'Valid Until Date', icon: 'calendar', sample: 'Oct 31, 2026', desc: 'Proposal or offer expiration deadline' },
  deadline: { label: 'Deadline Date', icon: 'calendar', sample: 'Nov 05, 2026', desc: 'Document signing deadline date' },
  document_title: { label: 'Document Title', icon: 'fileText', sample: 'Service Level Agreement', desc: 'Name of the attached document' },
  signing_url: { label: 'Signing Link', icon: 'link', sample: 'https://hudumika.com/esign/doc-98', desc: 'One-click eSign signing link' },

  // Financial & Invoicing
  invoice_number: { label: 'Invoice #', icon: 'invoice', sample: 'INV-2026-089', desc: 'Unique invoice reference number' },
  invoice_id: { label: 'Invoice ID', icon: 'invoice', sample: 'INV-089', desc: 'Internal invoice identifier' },
  total_value: { label: 'Total Value', icon: 'bankNote', sample: '24,500.00', desc: 'Total contract or proposal value' },
  amount_due: { label: 'Amount Due', icon: 'bankNote', sample: '1,450.00', desc: 'Outstanding amount due' },
  amount_paid: { label: 'Amount Paid', icon: 'bankNote', sample: '1,450.00', desc: 'Total amount received in payment' },
  currency: { label: 'Currency', icon: 'dollarSign', sample: '$', desc: 'Billing currency symbol or code' },
  due_date: { label: 'Due Date', icon: 'calendar', sample: 'Nov 15, 2026', desc: 'Payment settlement deadline' },
  payment_date: { label: 'Payment Date', icon: 'calendar', sample: 'Oct 24, 2026', desc: 'Date payment was processed' },
  payment_method: { label: 'Payment Method', icon: 'creditCard', sample: 'Credit Card (•••• 4242)', desc: 'Transaction payment method' },
  reference: { label: 'Reference Code', icon: 'hash', sample: 'TXN-984210', desc: 'Payment transaction reference' },
  days_overdue: { label: 'Days Overdue', icon: 'clock', sample: '14', desc: 'Count of days past original due date' },
  portal_url: { label: 'Portal Link', icon: 'link', sample: 'https://hudumika.com/portal', desc: 'Customer self-service portal link' },

  // System & Accounts
  setup_url: { label: 'Setup Link', icon: 'link', sample: 'https://hudumika.com/setup/usr-42', desc: 'New user onboarding setup link' },
  setup_link: { label: 'Setup Link', icon: 'link', sample: 'https://hudumika.com/setup/usr-42', desc: 'New user onboarding setup link' },
  reset_url: { label: 'Reset Link', icon: 'link', sample: 'https://hudumika.com/reset/tok-88', desc: 'Password reset link' },
  reset_link: { label: 'Reset Link', icon: 'link', sample: 'https://hudumika.com/reset/tok-88', desc: 'Password reset link' },
  first_day_date: { label: 'First Day Date', icon: 'calendar', sample: 'Nov 01, 2026', desc: 'Employee start date' },
  department: { label: 'Department', icon: 'layers', sample: 'Engineering', desc: 'Assigned business department' },
  role: { label: 'Role / Title', icon: 'badge', sample: 'Senior Consultant', desc: 'Designated role or title' },

  // Support & Operations
  ticket_id: { label: 'Ticket ID', icon: 'headphones', sample: 'TICK-4029', desc: 'Support incident reference code' },
  ticket_title: { label: 'Ticket Title', icon: 'headphones', sample: 'System Access Request', desc: 'Support issue summary' },
  ticket_status: { label: 'Ticket Status', icon: 'sparkle', sample: 'In Progress', desc: 'Current ticket lifecycle stage' },
  tracking_number: { label: 'Tracking #', icon: 'truck', sample: 'HDM-TRK-7712', desc: 'Shipment tracking identifier' },
  order_id: { label: 'Order ID', icon: 'package', sample: 'ORD-9932', desc: 'E-commerce purchase order ID' },
  fileName: { label: 'File Name', icon: 'fileText', sample: 'Q3_Financial_Summary.pdf', desc: 'Name of shared document' },
  file_name: { label: 'File Name', icon: 'fileText', sample: 'Q3_Financial_Summary.pdf', desc: 'Name of shared document' },
  fileUrl: { label: 'File Link', icon: 'link', sample: 'https://hudumika.com/drive/f-102', desc: 'Direct link to access file' },
  file_url: { label: 'File Link', icon: 'link', sample: 'https://hudumika.com/drive/f-102', desc: 'Direct link to access file' },
  permission: { label: 'Permission Level', icon: 'shield', sample: 'View & Download', desc: 'Access rights granted' },
};

function humanizeVariable(rawVar: string): VariableInfo {
  if (KNOWN_VARIABLES[rawVar]) {
    return KNOWN_VARIABLES[rawVar];
  }

  const formatted = rawVar
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());

  const lower = rawVar.toLowerCase();
  let icon: IconName = 'tag';
  let sample = `[${formatted}]`;

  if (lower.includes('name') || lower.includes('user') || lower.includes('author') || lower.includes('member')) {
    icon = 'user';
    sample = 'Alex Johnson';
  } else if (lower.includes('date') || lower.includes('until') || lower.includes('day') || lower.includes('time')) {
    icon = 'calendar';
    sample = 'Oct 31, 2026';
  } else if (lower.includes('url') || lower.includes('link') || lower.includes('portal') || lower.includes('href')) {
    icon = 'link';
    sample = 'https://hudumika.com';
  } else if (lower.includes('amount') || lower.includes('price') || lower.includes('total') || lower.includes('cost') || lower.includes('fee')) {
    icon = 'bankNote';
    sample = '1,200.00';
  } else if (lower.includes('curr')) {
    icon = 'dollarSign';
    sample = '$';
  } else if (lower.includes('file') || lower.includes('doc') || lower.includes('invoice') || lower.includes('title')) {
    icon = 'fileText';
    sample = 'Document Sample';
  } else if (lower.includes('company') || lower.includes('tenant') || lower.includes('org')) {
    icon = 'building';
    sample = 'Acme Corp';
  }

  return {
    label: formatted,
    icon,
    sample,
    desc: `Dynamic placeholder for ${formatted.toLowerCase()}`,
  };
}

function populateSampleData(text: string): string {
  if (!text) return '';
  return text.replace(/{{\s*([\w]+)\s*}}/g, (match, varName) => {
    const meta = humanizeVariable(varName);
    return meta.sample || match;
  });
}

function preparePreviewHtml(rawHtml: string): string {
  const customStyles = `
<style id="setm-preview-injected">
  *, *::before, *::after {
    box-sizing: border-box;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
    width: 100% !important;
    min-height: 100% !important;
  }
  ::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }
  body > table {
    margin: 0 auto !important;
    width: 100% !important;
    max-width: 100% !important;
    background: transparent !important;
  }
  body > table > tbody > tr > td,
  body > table > tr > td {
    padding: 24px 16px !important;
    width: 100% !important;
    box-sizing: border-box !important;
    text-align: center !important;
  }
  table {
    margin-left: auto !important;
    margin-right: auto !important;
    border-collapse: separate !important;
    border-spacing: 0 !important;
  }
  /* Card container table — ensure symmetrical rounded corners and responsive width */
  table[style*="box-shadow"],
  table[style*="border-radius"],
  table[width="560"],
  table table {
    max-width: 100% !important;
    width: 560px !important;
    border-radius: 10px !important;
    overflow: hidden !important;
    margin: 0 auto !important;
    text-align: left !important;
  }
  /* Force top banner row and cells to have symmetrical rounded corners */
  table tr:first-child > td,
  table tr:first-child > th {
    border-top-left-radius: 10px !important;
    border-top-right-radius: 10px !important;
  }
  table tr:first-child > td:first-child,
  table tr:first-child > th:first-child {
    border-top-left-radius: 10px !important;
  }
  table tr:first-child > td:last-child,
  table tr:first-child > th:last-child {
    border-top-right-radius: 10px !important;
  }
  table tr:last-child > td:first-child {
    border-bottom-left-radius: 10px !important;
  }
  table tr:last-child > td:last-child {
    border-bottom-right-radius: 10px !important;
  }
  img {
    max-width: 100% !important;
    height: auto !important;
  }
</style>
`;
  if (rawHtml.includes('</head>')) {
    return rawHtml.replace('</head>', `${customStyles}</head>`);
  }
  if (rawHtml.includes('<body')) {
    return rawHtml.replace(/<body[^>]*>/, `$&${customStyles}`);
  }
  return `${customStyles}${rawHtml}`;
}

/* ── Detail Dialog Component ─────────────────────────────────────────────────── */

function DetailDialog({
  template,
  imported,
  importing,
  onImport,
  onClose,
}: {
  template: MarketplaceTemplate;
  imported: boolean;
  importing: boolean;
  onImport: (t: MarketplaceTemplate) => void;
  onClose: () => void;
}) {
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewDataMode, setPreviewDataMode] = useState<'sample' | 'raw'>('sample');
  const [varMode, setVarMode] = useState<'human' | 'code'>('human');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  // 2D Pan & Zoom state (replaces native scrollbars with smooth 2D canvas interaction)
  const [zoom, setZoom] = useState(100);
  const [autoFit, setAutoFit] = useState(true);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [contentHeight, setContentHeight] = useState(820);
  const [viewportSize, setViewportSize] = useState({ width: 520, height: 500 });

  const viewportRef = React.useRef<HTMLDivElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const cat = getCategoryIcon(template.category);

  const copyVar = (v: string) => {
    navigator.clipboard.writeText(`{{${v}}}`);
    setCopiedVar(v);
    setTimeout(() => setCopiedVar(null), 1800);
  };

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(100);
    setAutoFit(true);
  }, []);

  useEffect(() => {
    resetView();
  }, [previewMode, template.id, resetView]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const updateSize = () => {
      if (viewportRef.current) {
        setViewportSize({
          width: viewportRef.current.clientWidth || 520,
          height: viewportRef.current.clientHeight || 500,
        });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, []);

  const handleIframeLoad = () => {
    try {
      if (iframeRef.current?.contentDocument?.body) {
        const h = iframeRef.current.contentDocument.body.scrollHeight;
        if (h && h > 150) {
          setContentHeight(Math.min(h + 30, 2400));
        }
      }
    } catch {
      // Safe fallback
    }
  };

  const baseWidth = previewMode === 'mobile' ? 375 : 620;
  const baseHeight = previewMode === 'mobile' ? 680 : contentHeight;

  // Auto-fit scale factor calculation with equal 48px padding on all sides
  const fitScale = Math.min(
    1,
    (viewportSize.width - 48) / baseWidth,
    (viewportSize.height - 48) / Math.min(baseHeight, 720)
  );

  const activeScale = autoFit ? fitScale : (zoom / 100) * fitScale;

  const handleZoomIn = () => {
    setAutoFit(false);
    setZoom(prev => Math.min(220, Math.round(prev * 1.15)));
  };

  const handleZoomOut = () => {
    setAutoFit(false);
    setZoom(prev => Math.max(35, Math.round(prev * 0.85)));
  };

  const handleToggleFit = () => {
    if (autoFit) {
      setAutoFit(false);
      setZoom(100);
    } else {
      resetView();
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Safe capture
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPan({
      x: Math.round(e.clientX - dragStart.x),
      y: Math.round(e.clientY - dragStart.y),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe release
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setAutoFit(false);
      setZoom(prev => {
        const delta = e.deltaY > 0 ? -10 : 10;
        return Math.max(35, Math.min(220, prev + delta));
      });
    } else {
      setPan(prev => ({
        x: Math.round(prev.x - e.deltaX),
        y: Math.round(prev.y - e.deltaY),
      }));
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent size="xl" className="setm-dlg-content">
        <DialogHeader className="setm-modal-header">
          <div className="setm-modal-header-inner">
            <div
              className="setm-modal-icon-box"
              style={{ background: cat.bg, color: cat.color }}
            >
              <Icon name={cat.icon} size={22} color={cat.color} />
            </div>
            <div className="setm-modal-title-col">
              <div className="setm-modal-title-row">
                <DialogTitle className="setm-modal-title">{template.title}</DialogTitle>
                {template.is_hudumika_official && (
                  <Badge variant="brand" className="inline-flex items-center gap-1">
                    <Icon name="sparkle" size={10} /> Official
                  </Badge>
                )}
                <Badge variant={CAT_CONFIG[template.category]?.variant ?? 'gray'}>
                  {cat.label}
                </Badge>
              </div>
              <DialogDescription className="setm-modal-meta">
                <span className="setm-meta-item">
                  <span className="setm-meta-muted">By</span>
                  <strong className="setm-meta-author">{template.author_name}</strong>
                </span>

                {template.application && template.application.toLowerCase() !== cat.label.toLowerCase() && (
                  <>
                    <span className="setm-meta-sep" aria-hidden="true">•</span>
                    <span className="setm-meta-item">
                      <Icon name="layers" size={12} color="var(--ink3)" />
                      <span>{template.application}</span>
                    </span>
                  </>
                )}

                {template.downloads > 0 && (
                  <>
                    <span className="setm-meta-sep" aria-hidden="true">•</span>
                    <span className="setm-meta-item">
                      <Icon name="download" size={12} color="var(--ink3)" />
                      <span>{template.downloads.toLocaleString()} {template.downloads === 1 ? 'import' : 'imports'}</span>
                    </span>
                  </>
                )}

                <span className="setm-meta-sep" aria-hidden="true">•</span>
                <span className="setm-meta-item">
                  <span className="setm-meta-version">v{template.version || '1.0.0'}</span>
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="setm-modal-body">
          <div className="setm-modal-split">
            {/* ── Left Column: Live Email Client Preview (2D Pan/Zoom Canvas) ── */}
            <div className="setm-preview-col">
              <div className="setm-preview-controls-bar">
                <div className="setm-preview-mode-toggle">
                  <button
                    type="button"
                    className={`setm-mode-btn${previewMode === 'desktop' ? ' is-active' : ''}`}
                    onClick={() => setPreviewMode('desktop')}
                  >
                    <Icon name="monitor" size={13} /> Desktop
                  </button>
                  <button
                    type="button"
                    className={`setm-mode-btn${previewMode === 'mobile' ? ' is-active' : ''}`}
                    onClick={() => setPreviewMode('mobile')}
                  >
                    <Icon name="smartphone" size={13} /> Mobile
                  </button>
                </div>

                {/* Sample Data vs Raw Tags Toggle */}
                <div className="setm-preview-data-toggle">
                  <Tip label="Show email with realistic sample values filled in">
                    <button
                      type="button"
                      className={`setm-data-btn${previewDataMode === 'sample' ? ' is-active' : ''}`}
                      onClick={() => setPreviewDataMode('sample')}
                    >
                      <Icon name="sparkle" size={12} /> Sample Data
                    </button>
                  </Tip>
                  <Tip label="Show raw template merge tags {{tag}}">
                    <button
                      type="button"
                      className={`setm-data-btn${previewDataMode === 'raw' ? ' is-active' : ''}`}
                      onClick={() => setPreviewDataMode('raw')}
                    >
                      <Icon name="tag" size={12} /> Raw Tags
                    </button>
                  </Tip>
                </div>

                {/* 2D Zoom & Reset View Toolbar */}
                <div className="setm-zoom-toolbar">
                  <Tip label="Zoom out">
                    <button
                      type="button"
                      className="setm-zoom-btn"
                      onClick={handleZoomOut}
                      aria-label="Zoom out"
                    >
                      <Icon name="minus" size={12} />
                    </button>
                  </Tip>

                  <Tip label={autoFit ? 'Auto-fitted to view (Click for 100%)' : 'Click to Auto-Fit'}>
                    <button
                      type="button"
                      className="setm-zoom-btn setm-zoom-value"
                      onClick={handleToggleFit}
                    >
                      {autoFit ? 'Fit' : `${zoom}%`}
                    </button>
                  </Tip>

                  <Tip label="Zoom in">
                    <button
                      type="button"
                      className="setm-zoom-btn"
                      onClick={handleZoomIn}
                      aria-label="Zoom in"
                    >
                      <Icon name="plus" size={12} />
                    </button>
                  </Tip>

                  <Tip label="Reset pan position">
                    <button
                      type="button"
                      className="setm-zoom-btn"
                      onClick={resetView}
                      aria-label="Reset pan position"
                      style={{ borderLeft: '1px solid var(--border)', marginLeft: 2, paddingLeft: 6 }}
                    >
                      <Icon name="refresh" size={12} />
                    </button>
                  </Tip>

                  <Tip label="Drag canvas to pan (2D movement)">
                    <div
                      className={`setm-zoom-btn setm-pan-icon-tool${isDragging ? ' is-dragging' : ''}`}
                      style={{ borderLeft: '1px solid var(--border)', marginLeft: 2, paddingLeft: 6 }}
                    >
                      <Icon name="hand" size={12} />
                    </div>
                  </Tip>
                </div>
              </div>

              {/* Envelope Subject Header */}
              <div className="setm-preview-envelope">
                <div className="setm-preview-subject-line">
                  <span className="setm-preview-label">Subject</span>
                  <span className="setm-preview-subject-val">
                    {previewDataMode === 'sample'
                      ? populateSampleData(template.subject) || 'No subject'
                      : template.subject || 'No subject'}
                  </span>
                </div>
                {template.preheader && (
                  <div className="setm-preview-snippet-line">
                    <span className="setm-preview-label">Snippet</span>
                    <span className="setm-preview-snippet-val">
                      {previewDataMode === 'sample'
                        ? populateSampleData(template.preheader)
                        : template.preheader}
                    </span>
                  </div>
                )}
              </div>

              {/* Interactive 2D Canvas Viewport (Zero Scrollbars) */}
              <div
                ref={viewportRef}
                className={`setm-canvas-viewport${isDragging ? ' is-dragging' : ''}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
              >
                <div
                  className={`setm-canvas-card setm-canvas-card--${previewMode}`}
                  style={{
                    width: baseWidth,
                    height: baseHeight,
                    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${activeScale})`,
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    title={`Preview: ${template.title}`}
                    sandbox="allow-same-origin"
                    className="setm-preview-iframe"
                    srcDoc={preparePreviewHtml(
                      previewDataMode === 'sample'
                        ? populateSampleData(template.body_html)
                        : template.body_html
                    )}
                    onLoad={handleIframeLoad}
                  />
                </div>
              </div>
            </div>

            {/* ── Right Column: Specs, Variables & Metadata Sidebar ── */}
            <div className="setm-sidebar-col">
              {/* Description */}
              <div className="setm-side-section">
                <h5 className="setm-side-heading">Description</h5>
                <p className="setm-side-desc">{template.description}</p>
              </div>

              {/* Integration / Trigger Specs */}
              <div className="setm-side-section">
                <h5 className="setm-side-heading">Trigger & Event</h5>
                {template.event_key ? (
                  <div className="setm-event-card">
                    <div className="setm-event-label">Event Key</div>
                    <code className="setm-event-code">
                      <Icon name="zap" size={12} color="var(--teal)" />
                      {template.event_key}
                    </code>
                  </div>
                ) : (
                  <div className="setm-event-card">
                    <div className="setm-event-label">Trigger</div>
                    <span className="text-xs text-muted-foreground">Manual compose & automated workflows</span>
                  </div>
                )}
              </div>

              {/* Dynamic Placeholders / Variables */}
              {template.available_vars.length > 0 && (
                <div className="setm-side-section">
                  <div className="setm-vars-heading-row">
                    <h5 className="setm-side-heading">
                      Dynamic Placeholders <span className="setm-side-count">({template.available_vars.length})</span>
                    </h5>
                    <div className="setm-vars-mode-toggle" role="group" aria-label="Field display format">
                      <button
                        type="button"
                        className={`setm-vars-mode-btn${varMode === 'human' ? ' is-active' : ''}`}
                        onClick={() => setVarMode('human')}
                        title="Display friendly field names"
                      >
                        Friendly
                      </button>
                      <button
                        type="button"
                        className={`setm-vars-mode-btn${varMode === 'code' ? ' is-active' : ''}`}
                        onClick={() => setVarMode('code')}
                        title="Display raw Handlebars tags"
                      >
                        Code
                      </button>
                    </div>
                  </div>

                  <div className="setm-vars-chips">
                    {template.available_vars.map(v => {
                      const info = humanizeVariable(v);
                      const isCopied = copiedVar === v;
                      return (
                        <Tip
                          key={v}
                          label={
                            isCopied
                              ? `Copied {{${v}}} to clipboard!`
                              : `Click to copy {{${v}}}${info.desc ? ` · ${info.desc}` : ''}`
                          }
                        >
                          <button
                            type="button"
                            className={`setm-var-btn${isCopied ? ' is-copied' : ''}`}
                            onClick={() => copyVar(v)}
                          >
                            <Icon
                              name={isCopied ? 'check' : varMode === 'human' ? info.icon : 'tag'}
                              size={12}
                              color={isCopied ? 'var(--green)' : 'var(--teal)'}
                            />
                            <span className="setm-var-btn-label">
                              {varMode === 'human' ? info.label : `{{${v}}}`}
                            </span>
                            {isCopied && <span className="setm-var-copied-tag">Copied!</span>}
                          </button>
                        </Tip>
                      );
                    })}
                  </div>

                  <div className="setm-vars-footer-hint">
                    <Icon name="copy" size={11} color="var(--ink3)" />
                    <span>Click any placeholder to copy its merge tag</span>
                  </div>
                </div>
              )}

              {/* Tags */}
              {template.tags.length > 0 && (
                <div className="setm-side-section">
                  <h5 className="setm-side-heading">Tags</h5>
                  <div className="setm-tags-wrap">
                    {template.tags.map(t => (
                      <span key={t} className="setm-side-tag">#{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="setm-modal-footer">
          <div className="setm-modal-footer-note">
            <Icon name="info" size={14} color="var(--ink3)" />
            <span>Importing creates an editable copy in your workspace's My Templates.</span>
          </div>

          <div className="setm-modal-footer-actions">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button
              disabled={imported || importing}
              onClick={() => onImport(template)}
            >
              {importing ? (
                'Importing…'
              ) : imported ? (
                <><Icon name="check" size={14} /> In Workspace</>
              ) : (
                <><Icon name="download" size={14} /> Import to My Templates</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────────── */

export function StoreEmailTemplatesManager({ embedded = false }: { embedded?: boolean } = {}) {
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'official' | 'third-party'>('all');
  const [detail, setDetail] = useState<MarketplaceTemplate | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/marketplace/email-templates?limit=500'),
      apiFetch('/v1/marketplace/email-templates/imported'),
    ])
      .then(([tpls, imported]: [MarketplaceTemplate[], Array<{ id: string }>]) => {
        setTemplates(Array.isArray(tpls) ? tpls : []);
        setImportedIds(new Set(imported.map(i => i.id)));
      })
      .catch((err: any) => showAlert(err?.message ?? 'Could not load templates.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const importTemplate = useCallback(async (tpl: MarketplaceTemplate) => {
    setImportingId(tpl.id);
    try {
      await apiFetch(`/v1/marketplace/email-templates/${tpl.id}/import`, { method: 'POST' });
      setImportedIds(prev => new Set([...prev, tpl.id]));
      setTemplates(prev => prev.map(t => t.id === tpl.id ? { ...t, downloads: t.downloads + 1 } : t));
      if (detail?.id === tpl.id) {
        setDetail(prev => prev ? { ...prev, downloads: prev.downloads + 1 } : prev);
      }
      showAlert(`"${tpl.title}" imported to My Templates successfully!`, { variant: 'success' });
    } catch (err: any) {
      showAlert(err?.message ?? 'Could not import template.');
    } finally {
      setImportingId(null);
    }
  }, [detail]);

  const q = search.trim().toLowerCase();
  const visible = templates.filter(t => {
    if (filterCat !== 'all' && t.category !== filterCat) return false;
    if (sourceFilter === 'official' && !t.is_hudumika_official) return false;
    if (sourceFilter === 'third-party' && t.is_hudumika_official) return false;
    if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q) && !t.subject.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setPage(1); }, [search, filterCat, sourceFilter, pageSize]);

  const sectionTitle = filterCat === 'all'
    ? sourceFilter === 'official'
      ? 'Official Email Templates'
      : sourceFilter === 'third-party'
        ? 'Community & Partner Templates'
        : 'Recommended Email Templates'
    : `${CAT_CONFIG[filterCat]?.label || filterCat} Templates`;

  return (
    <div className={`setm-page${embedded ? ' setm-page--embedded' : ''}`}>
      <div className="setm-page-inner">
        {!embedded && (
          <PageHeader
            crumbs={['Store', 'Email Templates']}
            titlePlain="Email "
            titleEm="templates"
            subtitle="Browse and import ready-made email templates into your workspace."
          />
        )}

        {/* ── Single-Row Unified Filter Toolbar ── */}
        <div className="setm-single-toolbar">
          {/* Search Box */}
          <div className="setm-search-box">
            <Icon name="search" size={15} className="setm-search-icon" />
            <input
              className="setm-search-input"
              placeholder="Search templates, subjects or keywords…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search email templates"
            />
            {search && (
              <button
                type="button"
                className="setm-search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>

          {/* Source Tabs */}
          <div className="setm-source-tabs" role="tablist" aria-label="Filter by source">
            {(['all', 'official', 'third-party'] as const).map(s => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={sourceFilter === s}
                className={`setm-source-btn${sourceFilter === s ? ' is-active' : ''}`}
                onClick={() => setSourceFilter(s)}
              >
                {s === 'all' ? 'All sources' : s === 'official' ? 'Official' : 'Third Party'}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <div className="setm-cat-select-wrap">
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="setm-cat-select-trigger" aria-label="Filter by category">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                {FILTER_CATS.map(c => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* View Switch & Count */}
          <div className="setm-toolbar-actions">
            <div className="setm-view-switch" role="group" aria-label="View mode">
              <Tip label="Grid view">
                <button
                  type="button"
                  className={`setm-view-btn${view === 'grid' ? ' is-active' : ''}`}
                  onClick={() => setView('grid')}
                  aria-label="Grid view"
                >
                  <Icon name="grid" size={15} />
                </button>
              </Tip>
              <Tip label="List view">
                <button
                  type="button"
                  className={`setm-view-btn${view === 'list' ? ' is-active' : ''}`}
                  onClick={() => setView('list')}
                  aria-label="List view"
                >
                  <Icon name="list" size={15} />
                </button>
              </Tip>
            </div>

          </div>
        </div>

        {/* ── Section Title (Store design pattern) ── */}
        <div className="setm-section-header">
          <h3 className="setm-section-title">{sectionTitle}</h3>
          <span className="setm-section-count">{visible.length} results</span>
        </div>

        {/* ── Main Content Presentation ── */}
        {loading ? (
          <div className="p-12">
            <SectionLoading />
          </div>
        ) : visible.length === 0 ? (
          <div className="setm-empty">
            <div className="setm-empty-icon-wrap">
              <Icon name="mail" size={24} />
            </div>
            <h3>No templates found</h3>
            <p>
              {q
                ? `No templates match "${search}". Try checking for typos or searching a different term.`
                : 'No templates match the selected category or source filter.'}
            </p>
            {(search || filterCat !== 'all' || sourceFilter !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearch(''); setFilterCat('all'); setSourceFilter('all'); }}
              >
                Reset filters
              </Button>
            )}
          </div>
        ) : view === 'grid' ? (
          /* ── Grid View (Matches Store / App Marketplace card presentation) ── */
          <div className="setm-grid">
            {paged.map(t => {
              const isImported = importedIds.has(t.id);
              const isImporting = importingId === t.id;
              const iconStyle = getCategoryIcon(t.category);

              return (
                <div
                  key={t.id}
                  className={`setm-app-card${isImported ? ' is-imported' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetail(t)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(t); } }}
                >
                  <div>
                    {/* Top Row: Category Icon + Verified Badge */}
                    <div className="store-app-card-top">
                      <div
                        className="store-app-icon-wrap"
                        style={{ background: iconStyle.bg, display: 'grid', placeItems: 'center' }}
                      >
                        <Icon name={iconStyle.icon} size={22} color={iconStyle.color} />
                      </div>
                      <span className={`store-badge ${isImported ? 'store-badge-installed' : 'store-badge-verified'}`}>
                        {isImported ? 'In Workspace' : t.is_hudumika_official ? 'Official' : 'Verified'}
                      </span>
                    </div>

                    {/* App Name & Dev */}
                    <h4 className="store-app-name">{t.title}</h4>
                    <div className="store-app-dev">By {t.author_name}</div>

                    {/* Meta Row: Rating, Installs, Category */}
                    <div className="store-app-meta">
                      <span className="store-app-installs">{t.downloads > 0 ? `${t.downloads.toLocaleString()} imports` : 'New'}</span>
                      <span className="store-app-sep">|</span>
                      <span className="store-app-installs">{iconStyle.label}</span>
                    </div>

                    {/* Description */}
                    <p className="store-app-desc">{t.description}</p>
                  </div>

                  {/* Card Action Footer */}
                  <div className="setm-card-action-row">
                    <Button
                      size="sm"
                      variant={isImported ? 'outline' : 'default'}
                      disabled={isImported || isImporting}
                      onClick={e => {
                        e.stopPropagation();
                        importTemplate(t);
                      }}
                    >
                      {isImporting ? (
                        'Importing…'
                      ) : isImported ? (
                        <><Icon name="check" size={12} /> Imported</>
                      ) : (
                        'Import'
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── List View ── */
          <div className="setm-list-view">
            {paged.map(t => {
              const isImported = importedIds.has(t.id);
              const isImporting = importingId === t.id;
              const iconStyle = getCategoryIcon(t.category);

              return (
                <div
                  key={t.id}
                  className={`setm-list-item${isImported ? ' is-imported' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetail(t)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(t); } }}
                >
                  <FeaturedIcon size="lg" variant={iconStyle.variant}>
                    <Icon name={iconStyle.icon} size={20} />
                  </FeaturedIcon>

                  <div className="setm-list-main">
                    <div className="setm-list-title-row">
                      <h4 className="setm-list-title">{t.title}</h4>
                    </div>
                    <div className="setm-list-byline">
                      By {t.author_name} · <span className="text-muted-foreground">{iconStyle.label}</span>
                    </div>
                  </div>

                  <div className="setm-list-desc">
                    <p className="store-app-desc">{t.description}</p>
                  </div>

                  <div className="setm-list-status">
                    <Badge variant={isImported ? 'success' : t.is_hudumika_official ? 'brand' : 'gray'}>
                      {isImported ? 'In workspace' : t.is_hudumika_official ? 'Official' : 'Verified'}
                    </Badge>
                    <span className="store-app-installs">
                      {t.downloads > 0 ? `${t.downloads.toLocaleString()} imports` : 'New'}
                    </span>
                  </div>

                  <div className="setm-list-action">
                    <Button
                      size="sm"
                      variant={isImported ? 'outline' : 'default'}
                      disabled={isImported || isImporting}
                      onClick={e => {
                        e.stopPropagation();
                        importTemplate(t);
                      }}
                    >
                      {isImporting ? 'Importing…' : isImported ? 'Imported' : 'Import'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Canonical Pagination Bar (with page numbers, jump controls, rows per page) ── */}
        {visible.length > 0 && (
          <PaginationBar
            page={currentPage}
            pageSize={pageSize}
            total={visible.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[8, 12, 24, 48]}
            itemLabel="template"
            bordered={true}
          />
        )}

        {/* ── Detail Dialog ── */}
        {detail && (
          <DetailDialog
            template={detail}
            imported={importedIds.has(detail.id)}
            importing={importingId === detail.id}
            onImport={importTemplate}
            onClose={() => setDetail(null)}
          />
        )}
      </div>
    </div>
  );
}
