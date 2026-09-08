import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { Icon } from '../../components/Icon.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { apiFetch, BASE_URL } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { MGMT_ROLES } from '../../lib/permissions.js';
import { showAlert } from '../../lib/alert.js';

interface Metrics {
  activeSessions: number;
  deliveredToday: number;
  readRate: number | null;
  configured: boolean;
}

interface Ticket {
  id: string;
  ref: string;
  subject: string;
  customer: string;
  customer_phone?: string;
  customer_wa?: string;
  status: string;
  updated_at?: string;
  created_at: string;
  channel?: string;
  description?: string;
}

interface WaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: any[];
}

interface KeywordRule {
  id: string;
  name: string;
  enabled: boolean;
  config: { keyword?: string; matchType?: 'contains' | 'exact' | 'starts_with'; replyText?: string } | string;
}

function parseConfig(rule: KeywordRule): { keyword: string; matchType: 'contains' | 'exact' | 'starts_with'; replyText: string } {
  try {
    const c: any = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config;
    return { keyword: c?.keyword || '', matchType: c?.matchType || 'contains', replyText: c?.replyText || '' };
  } catch {
    return { keyword: '', matchType: 'contains', replyText: '' };
  }
}

const MATCH_LABEL: Record<string, string> = {
  contains: 'Contains',
  exact: 'Exact match',
  starts_with: 'Starts with',
};

const PRESET_RULES = [
  {
    title: 'Shipment Tracking Bot',
    keyword: 'TRACK',
    matchType: 'starts_with' as const,
    replyText: 'To check live customs & delivery status, reply with your Reference ID (e.g. #SUP-5561 or BL-9921) or visit our tracking portal.',
    icon: 'compass',
  },
  {
    title: 'Business Working Hours',
    keyword: 'HOURS',
    matchType: 'contains' as const,
    replyText: 'Our customs & logistics operations run Mon–Fri 08:00–17:00 EAT and Sat 09:00–13:00. Urgent vessel inquiries are monitored 24/7.',
    icon: 'clock',
  },
  {
    title: 'Human Agent Escalation',
    keyword: 'AGENT',
    matchType: 'exact' as const,
    replyText: 'Connecting you with a dedicated support officer. Please hold while we review your account history.',
    icon: 'users',
  },
  {
    title: 'Tariff & Customs Rates',
    keyword: 'RATES',
    matchType: 'starts_with' as const,
    replyText: 'For duty estimates, landed cost calculation, and TRA compliance tariff codes, please share your HS code or cargo description.',
    icon: 'fileText',
  },
];

export const BlissWhatsApp: React.FC = () => {
  const { user } = useAuth();
  const canManage = MGMT_ROLES.includes(user?.role as any);
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');

  const tabParam = searchParams.get('tab') as 'overview' | 'simulator' | 'templates' | 'automation' | 'settings' | null;
  const activeTab = tabParam || 'overview';

  function setTab(tab: 'overview' | 'simulator' | 'templates' | 'automation' | 'settings') {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'overview') next.delete('tab');
      else next.set('tab', tab);
      return next;
    });
  }

  // Core Data State
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recent, setRecent] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template State
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatesConfigured, setTemplatesConfigured] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<string | null>(null);
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY');
  const [tplLanguage, setTplLanguage] = useState('en_US');
  const [tplBody, setTplBody] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);

  // Rules State
  const [rules, setRules] = useState<KeywordRule[]>([]);
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<'contains' | 'exact' | 'starts_with'>('contains');
  const [ruleReply, setRuleReply] = useState('');
  const [savingRule, setSavingRule] = useState(false);

  // Live Simulator / Test Send State
  const [testPhone, setTestPhone] = useState('+255 712 345 678');
  const [testMode, setTestMode] = useState<'text' | 'template'>('text');
  const [testText, setTestText] = useState('Hello! Your container MSCU7291823 has cleared customs inspection in Dar es Salaam port.');
  const [testTemplate, setTestTemplate] = useState('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({ '1': 'Customer', '2': 'MSCU7291823' });
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; simulated?: boolean; timestamp?: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [convSearch, setConvSearch] = useState('');

  const webhookUrl = useMemo(() => `${BASE_URL}/v1/webhooks/whatsapp`, []);

  function loadCore(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    Promise.all([
      apiFetch('/v1/support/whatsapp-metrics'),
      apiFetch('/v1/support/tickets'),
    ])
      .then(([m, tRes]: any) => {
        setMetrics(m);
        const all: Ticket[] = Array.isArray(tRes) ? tRes : (tRes?.data ?? []);
        const waList = all
          .filter(t => t.channel === 'WHATSAPP')
          .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
        setRecent(waList);
        setError(null);
      })
      .catch((e: any) => {
        setMetrics(null);
        setRecent([]);
        setError(e?.message || 'Could not load WhatsApp data.');
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }

  function loadTemplates() {
    apiFetch('/v1/support/whatsapp/templates')
      .then((res: any) => {
        setTemplates(res.templates || []);
        setTemplatesConfigured(!!res.configured);
        setTemplatesError(null);
        if (res.templates?.length > 0 && !testTemplate) {
          const firstApp = res.templates.find((t: any) => t.status === 'APPROVED');
          if (firstApp) setTestTemplate(firstApp.name);
        }
      })
      .catch((e: any) => {
        setTemplates(null);
        setTemplatesConfigured(false);
        setTemplatesError(e?.message || 'META_WABA_ID is not configured for this environment.');
      });
  }

  function loadRules() {
    apiFetch('/v1/support/rules')
      .then((all: any) => setRules((Array.isArray(all) ? all : []).filter((r: any) => r.type === 'whatsapp_keyword')))
      .catch(() => setRules([]));
  }

  useEffect(() => {
    loadCore();
    loadTemplates();
    loadRules();
  }, []);

  const approvedTemplates = useMemo(() => (templates || []).filter(t => t.status === 'APPROVED'), [templates]);

  // Extract variables when selected template changes
  useEffect(() => {
    if (!testTemplate || !templates) return;
    const tpl = templates.find(t => t.name === testTemplate);
    if (!tpl) return;
    const bodyObj = tpl.components?.find((c: any) => c.type === 'BODY');
    const bodyText = bodyObj?.text || '';
    const matches = Array.from(bodyText.matchAll(/\{\{(\d+)\}\}/g));
    const vars: Record<string, string> = {};
    matches.forEach((m: any) => {
      const key = m[1];
      vars[key] = templateVariables[key] || (key === '1' ? 'Mkwawa Cargo Ltd' : key === '2' ? 'MSCU-884920' : `Param ${key}`);
    });
    setTemplateVariables(vars);
  }, [testTemplate, templates]);

  const selectedTemplateObj = useMemo(() => {
    if (!testTemplate || !templates) return null;
    return templates.find(t => t.name === testTemplate) || null;
  }, [testTemplate, templates]);

  // Compute live preview text for selected template
  const computedTemplatePreview = useMemo(() => {
    if (!selectedTemplateObj) return 'Select a template to preview';
    const bodyObj = selectedTemplateObj.components?.find((c: any) => c.type === 'BODY');
    let text = bodyObj?.text || '';
    Object.entries(templateVariables).forEach(([key, val]) => {
      text = text.replaceAll(`{{${key}}}`, val || `[${key}]`);
    });
    return text;
  }, [selectedTemplateObj, templateVariables]);

  async function createTemplate() {
    if (!tplName.trim() || !tplBody.trim()) { showAlert('Template name and body text are required.'); return; }
    setSavingTpl(true);
    try {
      await apiFetch('/v1/support/whatsapp/templates', {
        method: 'POST',
        body: JSON.stringify({ name: tplName.trim().toLowerCase().replace(/\s+/g, '_'), category: tplCategory, language: tplLanguage, bodyText: tplBody.trim() }),
      });
      showAlert('Template submitted to Meta for review — it will show as Pending until approved.');
      setTplName(''); setTplBody(''); setShowNewTemplateModal(false);
      loadTemplates();
    } catch (e: any) {
      showAlert(e?.message || 'Could not submit template.');
    } finally {
      setSavingTpl(false);
    }
  }

  async function createRule(keyword?: string, matchType?: 'contains' | 'exact' | 'starts_with', reply?: string) {
    const kw = keyword || ruleKeyword;
    const mt = matchType || ruleMatchType;
    const rep = reply || ruleReply;

    if (!kw.trim() || !rep.trim()) { showAlert('Keyword and reply text are required.'); return; }
    setSavingRule(true);
    try {
      await apiFetch('/v1/support/rules', {
        method: 'POST',
        body: JSON.stringify({
          type: 'whatsapp_keyword',
          name: `WhatsApp keyword: ${kw.trim()}`,
          enabled: true,
          config: { keyword: kw.trim(), matchType: mt, replyText: rep.trim() },
        }),
      });
      setRuleKeyword(''); setRuleReply(''); setShowNewRuleModal(false);
      loadRules();
    } catch (e: any) {
      showAlert(e?.message || 'Could not create auto-reply rule.');
    } finally {
      setSavingRule(false);
    }
  }

  async function toggleRule(rule: KeywordRule) {
    try {
      await apiFetch(`/v1/support/rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) });
      loadRules();
    } catch (e: any) {
      showAlert(e?.message || 'Could not update rule.');
    }
  }

  async function deleteRule(rule: KeywordRule) {
    try {
      await apiFetch(`/v1/support/rules/${rule.id}`, { method: 'DELETE' });
      loadRules();
    } catch (e: any) {
      showAlert(e?.message || 'Could not delete rule.');
    }
  }

  async function sendTest() {
    if (!testPhone.trim()) { showAlert('Enter a destination phone number.'); return; }
    if (testMode === 'template' && !testTemplate) { showAlert('Select an approved template.'); return; }
    setSendingTest(true);
    setTestResult(null);
    try {
      const res: any = await apiFetch('/v1/support/whatsapp/test-send', {
        method: 'POST',
        body: JSON.stringify(
          testMode === 'template'
            ? { phone: testPhone.trim(), templateName: testTemplate, languageCode: approvedTemplates.find(t => t.name === testTemplate)?.language || 'en_US' }
            : { phone: testPhone.trim(), text: testText.trim() }
        ),
      });
      setTestResult({
        ok: true,
        simulated: res.simulated,
        msg: res.simulated
          ? 'Message sent via sandbox simulation (no production Meta Cloud credentials configured).'
          : `Delivered via Meta Cloud API. Message ID: ${res.messageId || 'wamid.HBgLMTE...'}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || 'Send failed.' });
    } finally {
      setSendingTest(false);
    }
  }

  function handleCopyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 3000);
  }

  const filteredTemplates = useMemo(() => {
    return (templates || []).filter(t => {
      if (templateFilter && templateFilter !== 'ALL' && t.status !== templateFilter) return false;
      if (templateCategoryFilter && templateCategoryFilter !== 'ALL' && t.category !== templateCategoryFilter) return false;
      if (templateSearch.trim()) {
        const q = templateSearch.toLowerCase();
        const bodyText = t.components?.find((c: any) => c.type === 'BODY')?.text || '';
        return t.name.toLowerCase().includes(q) || bodyText.toLowerCase().includes(q);
      }
      return true;
    });
  }, [templates, templateFilter, templateCategoryFilter, templateSearch]);

  const filteredRecent = useMemo(() => {
    if (!convSearch.trim()) return recent;
    const q = convSearch.toLowerCase();
    return recent.filter(t => t.customer.toLowerCase().includes(q) || (t.customer_phone || '').includes(q) || t.subject.toLowerCase().includes(q) || t.ref.toLowerCase().includes(q));
  }, [recent, convSearch]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, color: 'var(--ink2)' }}>
        <FeaturedIcon variant="brand" size="xl">
          <Icon name="refresh" size={28} style={{ animation: 'spin 1s linear infinite' }} />
        </FeaturedIcon>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Connecting to WhatsApp Business Hub…</div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: isMobile ? 14 : 20,
      padding: isMobile ? '14px 16px' : '22px 28px',
      background: 'var(--bg)',
      minHeight: '100%',
    }}>
      {/* ── Standard Hudumika PageHeader ── */}
      <PageHeader
        crumbs={['Bliss', 'WhatsApp']}
        titlePlain="WhatsApp"
        titleEm="hub"
        subtitle="Meta WhatsApp Cloud API integration — inbound tickets, HSM template dispatch, and keyword automations."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Badge variant={metrics?.configured ? 'success' : 'warning'}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              {metrics?.configured ? 'Meta Cloud API Live' : 'Simulation Mode'}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => loadCore(true)} disabled={refreshing}>
              <Icon name="refresh" size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              {refreshing ? 'Syncing…' : 'Sync Meta Data'}
            </Button>
            <Link to="/bliss/inbox" style={{ textDecoration: 'none' }}>
              <Button variant="default" size="sm">
                <Icon name="inbox" size={14} /> Open Support Center
              </Button>
            </Link>
          </div>
        }
      />

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--red-l)',
          color: 'var(--red)',
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 'var(--r)',
          border: '1px solid var(--red)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Icon name="alertTriangle" size={16} /> {error}
        </div>
      )}

      {/* ── KPI Metric Cards Ribbon (Responsive Grid) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: 14,
      }}>
        {/* Metric 1 */}
        <div style={{
          background: 'var(--card-bg, var(--white))',
          padding: '16px 18px',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <FeaturedIcon variant="success" size="md">
            <Icon name="clock" size={20} strokeWidth={2} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ink)', lineHeight: 1.1 }}>{metrics?.activeSessions ?? 0}</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600, marginTop: 2 }}>24h Active Windows</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Free-form reply session</div>
          </div>
        </div>

        {/* Metric 2 */}
        <div style={{
          background: 'var(--card-bg, var(--white))',
          padding: '16px 18px',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <FeaturedIcon variant="brand" size="md">
            <Icon name="messageSquare" size={20} strokeWidth={2} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ink)', lineHeight: 1.1 }}>{metrics?.deliveredToday ?? 0}</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600, marginTop: 2 }}>Dispatched Today</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Outbound HSM &amp; replies</div>
          </div>
        </div>

        {/* Metric 3 */}
        <div style={{
          background: 'var(--card-bg, var(--white))',
          padding: '16px 18px',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <FeaturedIcon variant="info" size="md">
            <Icon name="checkCircle" size={20} strokeWidth={2} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ink)', lineHeight: 1.1 }}>{metrics?.readRate != null ? `${metrics.readRate}%` : '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600, marginTop: 2 }}>Read Rate (Receipts)</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{metrics?.readRate != null ? 'Blue double-check rate' : 'No receipts logged yet'}</div>
          </div>
        </div>

        {/* Metric 4 */}
        <div style={{
          background: 'var(--card-bg, var(--white))',
          padding: '16px 18px',
          borderRadius: 'var(--r)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--elev-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <FeaturedIcon variant={metrics?.configured ? 'success' : 'warning'} size="md">
            <Icon name="globe" size={20} strokeWidth={2} />
          </FeaturedIcon>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Meta Cloud API
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: metrics?.configured ? 'var(--green)' : 'var(--gold)' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600, marginTop: 2 }}>
              {metrics?.configured ? 'Credentials Verified' : 'Unset Credentials'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{metrics?.configured ? 'WABA Account Ready' : 'Simulated Environment'}</div>
          </div>
        </div>
      </div>

      {/* ── Main Tabbed Navigation (Hudumika Design System Outline Tabs) ── */}
      <Tabs value={activeTab} onValueChange={v => setTab(v as any)} variant="outline" style={{ flexShrink: 0 }}>
        <TabsList>
          <TabsTrigger value="overview">
            <Icon name="activity" size={14} />
            <span className="ds-tabs-trigger-label" style={{ display: isMobile ? 'none' : undefined }}>Overview &amp; Activity</span>
          </TabsTrigger>
          <TabsTrigger value="simulator">
            <Icon name="send" size={14} />
            <span className="ds-tabs-trigger-label" style={{ display: isMobile ? 'none' : undefined }}>Live Simulator &amp; Test Send</span>
          </TabsTrigger>
          <TabsTrigger value="templates">
            <Icon name="fileText" size={14} />
            <span className="ds-tabs-trigger-label" style={{ display: isMobile ? 'none' : undefined }}>Message Templates ({approvedTemplates.length})</span>
          </TabsTrigger>
          <TabsTrigger value="automation">
            <Icon name="sliders" size={14} />
            <span className="ds-tabs-trigger-label" style={{ display: isMobile ? 'none' : undefined }}>Keyword Rules ({rules.length})</span>
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Icon name="settings" size={14} />
            <span className="ds-tabs-trigger-label" style={{ display: isMobile ? 'none' : undefined }}>API &amp; Webhook Setup</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── TAB 1: OVERVIEW & ACTIVITY ── */}
      {activeTab === 'overview' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1.3fr) minmax(0, 1fr)',
          gap: 18,
        }}>
          {/* Recent WhatsApp Conversations */}
          <div style={{
            background: 'var(--card-bg, var(--white))',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--elev-sm)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}>
              <div>
                <h2 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Recent WhatsApp Conversations</h2>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Incoming customer threads connected to Support Center</span>
              </div>
              <div style={{ position: 'relative', width: isMobile ? '100%' : 200 }}>
                <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--ink3)' }} />
                <input
                  className="input-field"
                  value={convSearch}
                  onChange={e => setConvSearch(e.target.value)}
                  placeholder="Filter conversations…"
                  style={{
                    width: '100%',
                    height: 32,
                    paddingLeft: 28,
                    paddingRight: 8,
                    fontSize: 12,
                  }}
                />
              </div>
            </div>

            {filteredRecent.length === 0 ? (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                <FeaturedIcon variant="brand" size="lg" className="mx-auto mb-3">
                  <Icon name="messageSquare" size={24} />
                </FeaturedIcon>
                <div style={{ fontWeight: 700, color: 'var(--ink)' }}>No WhatsApp customer conversations found</div>
                <div style={{ fontSize: 11.5, marginTop: 4 }}>When customers message your WhatsApp number, they will appear here.</div>
              </div>
            ) : (
              <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                {filteredRecent.map(t => (
                  <Link key={t.id} to={`/bliss/inbox?id=${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'background 0.15s ease',
                      cursor: 'pointer',
                    }} className="hover:bg-[var(--card-sunken)]">
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <PersonAvatar name={t.customer} size={36} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{t.customer}</span>
                          <span style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                            {new Date(t.updated_at || t.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                          {t.subject || 'Customer inquiry via WhatsApp'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 600 }}>
                            {t.customer_wa || t.customer_phone || `Ticket #${t.ref}`}
                          </span>
                          <Badge variant={t.status === 'OPEN' ? 'error' : t.status === 'RESOLVED' ? 'success' : 'gray'} style={{ fontSize: 10, padding: '0 6px' }}>
                            {t.status}
                          </Badge>
                        </div>
                      </div>
                      <Icon name="chevronRight" size={14} color="var(--ink3)" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* WhatsApp Channel Guidelines & Health Guard */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              background: 'var(--card-bg, var(--white))',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              padding: '18px 20px',
              boxShadow: 'var(--elev-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <FeaturedIcon variant="brand" size="sm">
                  <Icon name="shield" size={16} />
                </FeaturedIcon>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>24-Hour Policy &amp; Service Window Guard</h3>
                  <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Meta WhatsApp Business Platform Rules</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5 }}>
                <div style={{ display: 'flex', gap: 10, background: 'var(--card-sunken)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                  <Icon name="checkCircle" size={15} color="var(--green)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: 'var(--ink)' }}>Customer-Initiated 24h Window:</strong> Agents can send free-form messages, file attachments, and internal notes within 24 hours of the customer's last message.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, background: 'var(--card-sunken)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                  <Icon name="alertTriangle" size={15} color="var(--gold)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: 'var(--ink)' }}>Outside the 24h Window:</strong> Business-initiated conversations or re-engagement require an approved <strong>Meta HSM Template</strong> (Utility or Marketing).
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <Button variant="outline" size="sm" onClick={() => setTab('simulator')}>
                  <Icon name="send" size={13} /> Open Live Simulator
                </Button>
                <Button variant="outline" size="sm" onClick={() => setTab('templates')}>
                  <Icon name="fileText" size={13} /> Manage HSM Templates
                </Button>
              </div>
            </div>

            {/* Quick Automation Presets Preview */}
            <div style={{
              background: 'var(--card-bg, var(--white))',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              padding: '18px 20px',
              boxShadow: 'var(--elev-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Active Keyword Automations</div>
                <Button variant="ghost" size="sm" onClick={() => setTab('automation')} style={{ fontSize: 11.5 }}>
                  View all ({rules.length}) →
                </Button>
              </div>

              {rules.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No keyword auto-replies configured yet. Add keyword rules in the Keyword Rules tab.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rules.slice(0, 3).map(r => {
                    const cfg = parseConfig(r);
                    return (
                      <div key={r.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '8px 12px',
                        background: 'var(--card-sunken)',
                        borderRadius: 'var(--r-sm)',
                        fontSize: 12,
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--teal)', background: 'var(--teal-l)', padding: '1px 6px', borderRadius: 'var(--r-sm)' }}>
                            {cfg.keyword}
                          </span>
                          <span style={{ color: 'var(--ink2)' }}>{MATCH_LABEL[cfg.matchType]}</span>
                        </div>
                        <Badge variant={r.enabled ? 'success' : 'gray'} style={{ fontSize: 10 }}>{r.enabled ? 'Active' : 'Off'}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: LIVE SIMULATOR & TEST SANDBOX ── */}
      {activeTab === 'simulator' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : 'minmax(340px, 480px) minmax(300px, 380px)',
          gap: 24,
          alignItems: 'start',
          justifyContent: 'center',
        }}>
          {/* Dispatcher Form */}
          <div style={{
            background: 'var(--card-bg, var(--white))',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            padding: isMobile ? '16px' : '22px 24px',
            boxShadow: 'var(--elev-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FeaturedIcon variant="brand" size="md">
                <Icon name="send" size={18} />
              </FeaturedIcon>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 900, color: 'var(--ink)', margin: 0 }}>WhatsApp Test Sender</h2>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Send real Meta Cloud API or simulated WhatsApp tests</span>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <Tabs value={testMode} onValueChange={v => setTestMode(v as any)} variant="outline">
              <TabsList style={{ width: '100%' }}>
                <TabsTrigger value="text" style={{ flex: 1, fontSize: 12 }}>Free-form Text</TabsTrigger>
                <TabsTrigger value="template" style={{ flex: 1, fontSize: 12 }}>Approved HSM</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Destination Phone */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>
                Recipient Phone Number
              </label>
              <div style={{ position: 'relative' }}>
                <Icon name="phone" size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink3)' }} />
                <input
                  className="input-field"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="+255 712 345 678"
                  style={{ paddingLeft: 30, fontFamily: 'var(--mono)', fontSize: 13, height: 34 }}
                />
              </div>
              <span style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3, display: 'block' }}>
                International format with country code (e.g. +255 for Tanzania, +254 for Kenya).
              </span>
            </div>

            {/* Free-form Text Mode */}
            {testMode === 'text' ? (
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>
                  Message Content
                </label>
                <textarea
                  className="input-field"
                  rows={4}
                  value={testText}
                  onChange={e => setTestText(e.target.value)}
                  placeholder="Enter message text…"
                  style={{ fontSize: 13, lineHeight: 1.4, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                  <span>Simulates live agent broadcast</span>
                  <span>{testText.length} chars</span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>
                    Select Approved Meta Template
                  </label>
                  {approvedTemplates.length === 0 ? (
                    <div style={{ padding: '10px 12px', background: 'var(--card-sunken)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--ink3)' }}>
                      No approved templates found. Create one in the Message Templates tab.
                    </div>
                  ) : (
                    <Select value={testTemplate} onValueChange={setTestTemplate}>
                      <SelectTrigger className="input-field" style={{ fontFamily: 'var(--mono)' }}>
                        <SelectValue placeholder="Choose template…" />
                      </SelectTrigger>
                      <SelectContent>
                        {approvedTemplates.map(t => (
                          <SelectItem key={t.id} value={t.name}>
                            {t.name} ({t.category} · {t.language})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Dynamic Variable Inputs */}
                {Object.keys(templateVariables).length > 0 && (
                  <div style={{ background: 'var(--card-sunken)', padding: '12px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>
                      Template Parameters (Variables)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Object.keys(templateVariables).map(num => (
                        <div key={num} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', fontFamily: 'var(--mono)', width: 34 }}>
                            {`{{${num}}}`}
                          </span>
                          <input
                            className="input-field"
                            style={{ height: 28, fontSize: 12 }}
                            value={templateVariables[num]}
                            onChange={e => setTemplateVariables(prev => ({ ...prev, [num]: e.target.value }))}
                            placeholder={`Value for {{${num}}}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button
              variant="default"
              size="default"
              onClick={sendTest}
              disabled={sendingTest}
              style={{ fontWeight: 800, height: 40, fontSize: 13 }}
            >
              <Icon name="send" size={15} />
              {sendingTest ? 'Dispatching over Meta API…' : 'Send Test Message'}
            </Button>

            {testResult && (
              <div style={{
                padding: '12px 14px',
                borderRadius: 'var(--r-sm)',
                background: testResult.ok ? 'var(--green-l)' : 'var(--red-l)',
                border: testResult.ok ? '1px solid var(--green)' : '1px solid var(--red)',
                fontSize: 12.5,
                color: testResult.ok ? 'var(--green)' : 'var(--red)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <Icon name={testResult.ok ? 'checkCircle' : 'alertTriangle'} size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div>{testResult.msg}</div>
                  {testResult.timestamp && (
                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>Logged at {testResult.timestamp}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Interactive WhatsApp Device Preview Mockup */}
          <div style={{
            background: 'var(--card-sunken)',
            borderRadius: 'var(--r)',
            border: '2px solid var(--border)',
            boxShadow: 'var(--elev-sm)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: 520,
            maxWidth: 380,
            width: '100%',
            position: 'relative',
          }}>
            {/* Phone Top Header */}
            <div style={{
              background: 'var(--ink)',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: 'var(--white)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--teal)', color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>
                  H
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Hudumika Logistics
                    <Icon name="checkCircle" size={12} color="var(--teal)" />
                  </div>
                  <div style={{ fontSize: 10.5, opacity: 0.8 }}>WhatsApp Official Business</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, opacity: 0.8 }}>
                <Icon name="phone" size={15} />
                <Icon name="moreVertical" size={15} />
              </div>
            </div>

            {/* Chat Body Wallpaper */}
            <div style={{
              flex: 1,
              padding: 16,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: 'var(--bg)',
            }}>
              <div style={{ alignSelf: 'center', background: 'var(--card-bg, var(--white))', padding: '3px 10px', borderRadius: 'var(--r-sm)', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', border: '1px solid var(--border)' }}>
                Today
              </div>

              {/* Customer Simulated Inquiry */}
              <div style={{
                alignSelf: 'flex-start',
                maxWidth: '82%',
                background: 'var(--card-bg, var(--white))',
                padding: '8px 12px',
                borderRadius: '0 10px 10px 10px',
                boxShadow: 'var(--elev-sm)',
                fontSize: 12.5,
                color: 'var(--ink)',
                lineHeight: 1.35,
                border: '1px solid var(--border)',
              }}>
                <div>Hello, please confirm if container MSCU7291823 has been released by TRA.</div>
                <div style={{ textAlign: 'right', fontSize: 9.5, color: 'var(--ink3)', marginTop: 3 }}>10:42 AM</div>
              </div>

              {/* Live Preview Outgoing Bubble */}
              <div style={{
                alignSelf: 'flex-end',
                maxWidth: '85%',
                background: 'var(--teal-l)',
                padding: '10px 12px',
                borderRadius: '10px 0 10px 10px',
                boxShadow: 'var(--elev-sm)',
                fontSize: 12.5,
                color: 'var(--ink)',
                lineHeight: 1.35,
                border: '1px solid var(--teal)',
              }}>
                {testMode === 'template' && selectedTemplateObj && (
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    {selectedTemplateObj.category} TEMPLATE: {selectedTemplateObj.name}
                  </div>
                )}
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {testMode === 'text' ? (testText || 'Type a message to preview…') : computedTemplatePreview}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4, fontSize: 9.5, color: 'var(--ink3)' }}>
                  <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ color: 'var(--teal)', fontWeight: 900 }}>✓✓</span>
                </div>
              </div>
            </div>

            {/* Bottom Fake Input Bar */}
            <div style={{ background: 'var(--card-bg, var(--white))', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, background: 'var(--card-sunken)', borderRadius: 20, padding: '6px 14px', fontSize: 12, color: 'var(--ink3)', border: '1px solid var(--border)' }}>
                Message
              </div>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--teal)', color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="send" size={13} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: MESSAGE TEMPLATES (HSM) ── */}
      {activeTab === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Top Filter & Search Toolbar */}
          <div style={{
            background: 'var(--card-bg, var(--white))',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--elev-sm)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: isMobile ? 'wrap' : 'nowrap',
            overflowX: isMobile ? 'visible' : 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              <SingleSelectFilter
                label="Status"
                icon={<Icon name="filter" size={13} />}
                value={templateFilter}
                onChange={setTemplateFilter}
                allLabel="All Statuses"
                options={[
                  { value: 'APPROVED', label: 'Approved' },
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'REJECTED', label: 'Rejected' },
                ]}
              />

              <SingleSelectFilter
                label="Category"
                icon={<Icon name="layers" size={13} />}
                value={templateCategoryFilter}
                onChange={setTemplateCategoryFilter}
                allLabel="All Categories"
                options={[
                  { value: 'UTILITY', label: 'Utility' },
                  { value: 'MARKETING', label: 'Marketing' },
                  { value: 'AUTHENTICATION', label: 'Authentication' },
                ]}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: isMobile ? '100%' : 'auto' }}>
              <div style={{ position: 'relative', width: isMobile ? '100%' : 220 }}>
                <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--ink3)' }} />
                <input
                  className="input-field"
                  value={templateSearch}
                  onChange={e => setTemplateSearch(e.target.value)}
                  placeholder="Search templates…"
                  style={{ width: '100%', height: 32, paddingLeft: 28, paddingRight: 8, fontSize: 12 }}
                />
              </div>

              {canManage && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowNewTemplateModal(true)}
                  style={{ flexShrink: 0 }}
                >
                  <Icon name="plus" size={13} /> New HSM Template
                </Button>
              )}
            </div>
          </div>

          {!templatesConfigured && (
            <div style={{
              padding: '14px 18px',
              background: 'var(--gold-l)',
              color: 'var(--gold)',
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--gold)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <Icon name="alertTriangle" size={16} />
              {templatesError || 'META_WABA_ID is not configured in this environment — template management communicates with Meta WhatsApp Business Account Graph API.'}
            </div>
          )}

          {filteredTemplates.length === 0 ? (
            <div style={{
              background: 'var(--card-bg, var(--white))',
              padding: 40,
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              textAlign: 'center',
              color: 'var(--ink3)',
              boxShadow: 'var(--elev-sm)',
            }}>
              <FeaturedIcon variant="brand" size="lg" className="mx-auto mb-3">
                <Icon name="fileText" size={24} />
              </FeaturedIcon>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>No message templates found</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Submit utility or marketing templates to Meta for approval.</div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}>
              {filteredTemplates.map(t => {
                const bodyObj = t.components?.find((c: any) => c.type === 'BODY');
                const bodyText = bodyObj?.text || '';
                return (
                  <div key={t.id} style={{
                    background: 'var(--card-bg, var(--white))',
                    borderRadius: 'var(--r)',
                    border: '1px solid var(--border)',
                    padding: 18,
                    boxShadow: 'var(--elev-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{t.name}</span>
                        <Badge variant={t.status === 'APPROVED' ? 'success' : t.status === 'REJECTED' ? 'error' : 'warning'}>
                          {t.status}
                        </Badge>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink3)', marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{t.category}</span>
                        <span>·</span>
                        <span>{t.language}</span>
                      </div>
                      <div style={{
                        background: 'var(--card-sunken)',
                        padding: '10px 12px',
                        borderRadius: 'var(--r-sm)',
                        fontSize: 12.5,
                        color: 'var(--ink2)',
                        lineHeight: 1.45,
                        minHeight: 64,
                        whiteSpace: 'pre-wrap',
                        border: '1px solid var(--border)',
                      }}>
                        {bodyText || 'No body component configured.'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--ink3)' }}>Meta Verified</span>
                      {t.status === 'APPROVED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setTestTemplate(t.name);
                            setTestMode('template');
                            setTab('simulator');
                          }}
                          style={{ fontSize: 11.5, color: 'var(--teal)', fontWeight: 700 }}
                        >
                          <Icon name="send" size={12} /> Test in Simulator
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: KEYWORD AUTO-REPLY RULES ── */}
      {activeTab === 'automation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Preset Quick Add Library */}
          <div style={{
            background: 'var(--card-bg, var(--white))',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            padding: '18px 20px',
            boxShadow: 'var(--elev-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Recommended Preset Automations</h3>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>One-click auto-reply templates for logistics and customer support</span>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}>
              {PRESET_RULES.map(p => (
                <div key={p.keyword} style={{
                  background: 'var(--card-sunken)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 10,
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 900, color: 'var(--teal)', background: 'var(--teal-l)', padding: '1px 6px', borderRadius: 'var(--r-sm)' }}>
                        {p.keyword}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>{p.title}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.35 }}>{p.replyText}</div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createRule(p.keyword, p.matchType, p.replyText)}
                    disabled={savingRule || rules.some(r => parseConfig(r).keyword.toUpperCase() === p.keyword)}
                    style={{ fontSize: 11.5 }}
                  >
                    {rules.some(r => parseConfig(r).keyword.toUpperCase() === p.keyword) ? 'Already Added' : '+ Add Auto-Reply'}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Active Custom Rules List */}
          <div style={{
            background: 'var(--card-bg, var(--white))',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            padding: '18px 20px',
            boxShadow: 'var(--elev-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Configured Keyword Auto-Replies ({rules.length})</h3>
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Evaluated in real-time on every inbound WhatsApp webhook event</span>
              </div>
              {canManage && (
                <Button variant="default" size="sm" onClick={() => setShowNewRuleModal(true)}>
                  <Icon name="plus" size={13} /> New Custom Rule
                </Button>
              )}
            </div>

            {rules.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                No active auto-reply rules. Choose a preset above or create a custom keyword rule.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rules.map(r => {
                  const cfg = parseConfig(r);
                  return (
                    <div key={r.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 14,
                      padding: '12px 16px',
                      background: 'var(--card-sunken)',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border)',
                      flexDirection: isMobile ? 'column' : 'row',
                      alignItems: isMobile ? 'flex-start' : 'center',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 900, color: 'var(--teal)', background: 'var(--teal-l)', padding: '2px 8px', borderRadius: 'var(--r-sm)' }}>
                            "{cfg.keyword}"
                          </span>
                          <Badge variant="outline" style={{ fontSize: 11 }}>{MATCH_LABEL[cfg.matchType] || cfg.matchType}</Badge>
                          <Badge variant={r.enabled ? 'success' : 'gray'} style={{ fontSize: 10 }}>{r.enabled ? 'Active' : 'Disabled'}</Badge>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4, lineHeight: 1.4 }}>
                          Replies: "{cfg.replyText}"
                        </div>
                      </div>

                      {canManage && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                          <Button variant="outline" size="sm" onClick={() => toggleRule(r)}>
                            {r.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => deleteRule(r)}>
                            <Icon name="trash2" size={13} color="var(--red)" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: API & WEBHOOK SETUP ── */}
      {activeTab === 'settings' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 20,
        }}>
          {/* Callback Webhook Details */}
          <div style={{
            background: 'var(--card-bg, var(--white))',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            padding: '20px 22px',
            boxShadow: 'var(--elev-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Meta Inbound Webhook Configuration</h3>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Copy this endpoint into your Meta Developer WhatsApp App Dashboard</span>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                Callback URL (Inbound Messages &amp; Status Receipts)
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  readOnly
                  className="input-field"
                  value={webhookUrl}
                  style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--card-sunken)', flex: 1, height: 34 }}
                />
                <Button variant="outline" size="sm" onClick={handleCopyWebhook} style={{ flexShrink: 0 }}>
                  <Icon name={copiedWebhook ? 'check' : 'copy'} size={13} />
                  {copiedWebhook ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>

            <div style={{
              background: 'var(--card-sunken)',
              padding: '12px 14px',
              borderRadius: 'var(--r-sm)',
              fontSize: 12,
              color: 'var(--ink2)',
              lineHeight: 1.5,
              border: '1px solid var(--border)',
            }}>
              <strong>Signature Verification (HMAC-SHA256):</strong> Every inbound payload is authenticated using the server's <code>META_APP_SECRET</code> against the <code>X-Hub-Signature-256</code> header to reject spoofed webhooks.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>Meta App Event Subscriptions Required:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['messages', 'message_status', 'template_category_update', 'message_template_status_update'].map(ev => (
                  <span key={ev} style={{ background: 'var(--card-sunken)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 'var(--r-sm)', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Architecture Pipeline Flow */}
          <div style={{
            background: 'var(--card-bg, var(--white))',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            padding: '20px 22px',
            boxShadow: 'var(--elev-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>WhatsApp Event Pipeline</h3>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>End-to-end routing flow for inbound customer messages</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { step: '1', title: 'Customer messages WhatsApp number', desc: 'Customer initiates message via WhatsApp on mobile or web' },
                { step: '2', title: 'Meta Cloud API delivers webhook', desc: 'Inbound POST /v1/webhooks/whatsapp with HMAC verification' },
                { step: '3', title: 'Keyword Automation Evaluator', desc: 'Checks match rules; dispatches instant bot reply if triggered' },
                { step: '4', title: 'Support Center Ticket Assignment', desc: 'Matches customer profile by phone number, opens/updates ticket in Bliss' },
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--teal-l)',
                    color: 'var(--teal)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}>
                    {item.step}
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{item.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE HSM TEMPLATE ── */}
      {showNewTemplateModal && (
        <Dialog open onOpenChange={setShowNewTemplateModal}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Submit New WhatsApp HSM Template</DialogTitle>
            </DialogHeader>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '12px 0' }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>TEMPLATE NAME (lowercase_underscore)</label>
                <input
                  className="input-field"
                  value={tplName}
                  onChange={e => setTplName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  placeholder="e.g. shipment_clearance_notice"
                  style={{ fontFamily: 'var(--mono)', marginTop: 4 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>CATEGORY</label>
                  <Select value={tplCategory} onValueChange={v => setTplCategory(v as any)}>
                    <SelectTrigger className="input-field" style={{ marginTop: 4 }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTILITY">Utility (Transactional)</SelectItem>
                      <SelectItem value="MARKETING">Marketing (Promotional)</SelectItem>
                      <SelectItem value="AUTHENTICATION">Authentication (OTP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>LANGUAGE</label>
                  <input className="input-field" value={tplLanguage} onChange={e => setTplLanguage(e.target.value)} placeholder="en_US" style={{ marginTop: 4 }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>BODY TEXT (Variables format: {'{{1}}'}, {'{{2}}'})</label>
                  <button
                    type="button"
                    onClick={() => setTplBody(prev => `${prev} {{${(prev.match(/\{\{\d+\}\}/g) || []).length + 1}}}`)}
                    style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Insert Variable
                  </button>
                </div>
                <textarea
                  className="input-field"
                  rows={4}
                  value={tplBody}
                  onChange={e => setTplBody(e.target.value)}
                  placeholder="Hi {{1}}, your container {{2}} has departed from Dar port."
                  style={{ lineHeight: 1.4, resize: 'vertical' }}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowNewTemplateModal(false)}>Cancel</Button>
              <Button variant="default" size="sm" onClick={createTemplate} disabled={savingTpl}>
                {savingTpl ? 'Submitting to Meta…' : 'Submit for Review'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── MODAL: CREATE AUTO-REPLY RULE ── */}
      {showNewRuleModal && (
        <Dialog open onOpenChange={setShowNewRuleModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create WhatsApp Keyword Auto-Reply</DialogTitle>
            </DialogHeader>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '12px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>KEYWORD / TRIGGER</label>
                  <input
                    className="input-field"
                    value={ruleKeyword}
                    onChange={e => setRuleKeyword(e.target.value.toUpperCase())}
                    placeholder="e.g. HELP"
                    style={{ fontFamily: 'var(--mono)', marginTop: 4 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>MATCH CONDITION</label>
                  <Select value={ruleMatchType} onValueChange={v => setRuleMatchType(v as any)}>
                    <SelectTrigger className="input-field" style={{ marginTop: 4 }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains Keyword</SelectItem>
                      <SelectItem value="starts_with">Starts With Keyword</SelectItem>
                      <SelectItem value="exact">Exact Match</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>AUTO-REPLY MESSAGE</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={ruleReply}
                  onChange={e => setRuleReply(e.target.value)}
                  placeholder="Enter auto-response sent to customer…"
                  style={{ marginTop: 4, lineHeight: 1.4, resize: 'vertical' }}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowNewRuleModal(false)}>Cancel</Button>
              <Button variant="default" size="sm" onClick={() => createRule()} disabled={savingRule}>
                {savingRule ? 'Saving…' : 'Create Auto-Reply'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
