import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Icon } from '../../components/Icon.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { apiFetch, BASE_URL } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
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

function parseConfig(rule: KeywordRule): { keyword: string; matchType: string; replyText: string } {
  const c: any = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config;
  return { keyword: c?.keyword || '', matchType: c?.matchType || 'contains', replyText: c?.replyText || '' };
}

const MATCH_LABEL: Record<string, string> = { contains: 'Contains', exact: 'Exact match', starts_with: 'Starts with' };

/** Real, backend-connected replacements for what this page used to fake:
 *  templates come from Meta's own message_templates list (WABA-scoped,
 *  /v1/support/whatsapp/templates); the auto-reply bot is the real
 *  `whatsapp_keyword` support_rules type the inbound webhook actually
 *  evaluates (webhooks.routes.ts); Send Test Message calls the real
 *  WhatsAppIntegration.sendMessage/sendTemplateMessage path, honestly
 *  reporting `simulated: true` when no Meta credentials are configured.
 *  Actual customer conversations still happen in Support Center — that's
 *  the one real thread UI (broadcast composer, notes, agent assignment),
 *  not duplicated here. */
export const BlissWhatsApp: React.FC = () => {
  const { user } = useAuth();
  const canManage = MGMT_ROLES.includes(user?.role as any);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recent, setRecent] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<WaTemplate[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatesConfigured, setTemplatesConfigured] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY');
  const [tplLanguage, setTplLanguage] = useState('en_US');
  const [tplBody, setTplBody] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);

  const [rules, setRules] = useState<KeywordRule[]>([]);
  const [showNewRule, setShowNewRule] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<'contains' | 'exact' | 'starts_with'>('contains');
  const [ruleReply, setRuleReply] = useState('');
  const [savingRule, setSavingRule] = useState(false);

  const [testPhone, setTestPhone] = useState('');
  const [testMode, setTestMode] = useState<'text' | 'template'>('text');
  const [testText, setTestText] = useState('Hudumika Bliss test message.');
  const [testTemplate, setTestTemplate] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function loadCore() {
    setLoading(true);
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
      })
      .catch((e: any) => {
        setMetrics(null);
        setRecent([]);
        setError(e?.message || 'Could not load WhatsApp data.');
      })
      .finally(() => setLoading(false));
  }

  function loadTemplates() {
    apiFetch('/v1/support/whatsapp/templates')
      .then((res: any) => {
        setTemplates(res.templates || []);
        setTemplatesConfigured(!!res.configured);
        setTemplatesError(null);
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

  useEffect(() => { loadCore(); loadTemplates(); loadRules(); }, []);

  const webhookUrl = useMemo(() => `${BASE_URL}/v1/webhooks/whatsapp`, []);
  const approvedTemplates = useMemo(() => (templates || []).filter(t => t.status === 'APPROVED'), [templates]);

  async function createTemplate() {
    if (!tplName.trim() || !tplBody.trim()) { showAlert('Template name and body text are required.'); return; }
    setSavingTpl(true);
    try {
      await apiFetch('/v1/support/whatsapp/templates', {
        method: 'POST',
        body: JSON.stringify({ name: tplName.trim(), category: tplCategory, language: tplLanguage, bodyText: tplBody.trim() }),
      });
      showAlert('Template submitted to Meta for review — it will show as Pending until approved.');
      setTplName(''); setTplBody(''); setShowNewTemplate(false);
      loadTemplates();
    } catch (e: any) {
      showAlert(e?.message || 'Could not submit template.');
    } finally {
      setSavingTpl(false);
    }
  }

  async function createRule() {
    if (!ruleKeyword.trim() || !ruleReply.trim()) { showAlert('Keyword and reply text are required.'); return; }
    setSavingRule(true);
    try {
      await apiFetch('/v1/support/rules', {
        method: 'POST',
        body: JSON.stringify({
          type: 'whatsapp_keyword',
          name: `WhatsApp keyword: ${ruleKeyword.trim()}`,
          enabled: true,
          config: { keyword: ruleKeyword.trim(), matchType: ruleMatchType, replyText: ruleReply.trim() },
        }),
      });
      setRuleKeyword(''); setRuleReply(''); setShowNewRule(false);
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
      setTestResult({ ok: true, msg: res.simulated ? 'Sent (simulated — no Meta credentials configured in this environment).' : `Sent. Message ID: ${res.messageId || '—'}` });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || 'Send failed.' });
    } finally {
      setSendingTest(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
        <Icon name="refresh" size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
        <div>Loading WhatsApp channel data…</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 24px', background: 'var(--bg)', minHeight: '100%' }}>
      <PageHeader
        crumbs={['Bliss', 'Channels', 'WhatsApp']}
        titlePlain="WhatsApp"
        titleEm="Business"
        subtitle="Meta WhatsApp Cloud API — real sessions, templates and auto-reply rules. Conversations happen in Support Center."
        actions={
          <Link to="/bliss/inbox" style={{ textDecoration: 'none' }}>
            <Button variant="default" size="sm">
              <Icon name="inbox" size={14} /> Open Support Center
            </Button>
          </Link>
        }
      />

      {error && (
        <div style={{ padding: '10px 16px', background: 'var(--red-l)', color: 'var(--red)', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r)' }}>{error}</div>
      )}

      {!metrics?.configured && (
        <div style={{ padding: '12px 16px', background: 'var(--gold-l)', color: 'var(--gold)', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="alertTriangle" size={15} />
          No Meta WhatsApp credentials are configured for this environment yet — outbound sends fall back to a logged simulation. See Send Test Message below.
        </div>
      )}

      {/* Real metrics — GET /v1/support/whatsapp-metrics, no fabricated fallback numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }}>
            <Icon name="clock" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{metrics?.activeSessions ?? 0}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Active 24h Service Windows</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            <Icon name="messageSquare" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{metrics?.deliveredToday ?? 0}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Outbound Messages Today</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
            <Icon name="checkCircle" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{metrics?.readRate != null ? `${metrics.readRate}%` : '—'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{metrics?.readRate != null ? 'Read Rate Today' : 'No delivery receipts yet today'}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: metrics?.configured ? 'var(--green-l)' : 'var(--red-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: metrics?.configured ? 'var(--green)' : 'var(--red)' }}>
            <Icon name="globe" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Meta Cloud API
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: metrics?.configured ? 'var(--green)' : 'var(--red)' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
              {metrics?.configured ? 'Credentials configured' : 'Not configured — simulated sends'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        <SectionCard padded={false} title={`Recent WhatsApp Conversations (${recent.length})`}>
          {recent.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No WhatsApp conversations yet.</div>
          ) : (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {recent.map(t => (
                <Link key={t.id} to={`/bliss/inbox?id=${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <PersonAvatar name={t.customer} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{t.customer}</span>
                        <Badge variant={t.status === 'OPEN' ? 'error' : t.status === 'RESOLVED' ? 'success' : 'warning'}>{t.status}</Badge>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</div>
                      {(t.customer_wa || t.customer_phone) && (
                        <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)', marginTop: 2 }}>{t.customer_wa || t.customer_phone}</div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Webhook Configuration">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>CALLBACK URL (set in Meta App Dashboard)</label>
              <input value={webhookUrl} readOnly className="input-field" style={{ fontFamily: 'var(--mono)', background: 'var(--bg)', fontSize: 12 }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5 }}>
              WhatsApp Business credentials (access token, phone number ID, app secret, verify token) are configured server-side for this platform, not per tenant — there is currently no per-tenant WABA number. Real Meta signature verification (X-Hub-Signature-256) is enforced on every inbound webhook call, and inbound messages are matched to a customer and turned into a Support Center ticket automatically.
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Message Templates — real Meta WABA template list + submission */}
      <SectionCard
        title="Message Templates"
        action={canManage && templatesConfigured ? (
          <Button variant="outline" size="sm" onClick={() => setShowNewTemplate(v => !v)}>
            <Icon name="plus" size={13} /> New Template
          </Button>
        ) : undefined}
      >
        {!templatesConfigured ? (
          <div style={{ padding: 16, fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.6 }}>
            {templatesError || 'META_WABA_ID is not configured for this environment — template management requires a WhatsApp Business Account ID in addition to the phone number credentials used for free-form sends.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {showNewTemplate && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>NAME (lowercase_underscore)</label>
                    <input className="input-field" style={{ marginTop: 4 }} value={tplName} onChange={e => setTplName(e.target.value)} placeholder="shipment_update" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>CATEGORY</label>
                    <Select value={tplCategory} onValueChange={v => setTplCategory(v as any)}>
                      <SelectTrigger className="input-field" style={{ marginTop: 4 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTILITY">Utility</SelectItem>
                        <SelectItem value="MARKETING">Marketing</SelectItem>
                        <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>LANGUAGE</label>
                    <input className="input-field" style={{ marginTop: 4 }} value={tplLanguage} onChange={e => setTplLanguage(e.target.value)} placeholder="en_US" />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>BODY TEXT (use {'{{1}}'}, {'{{2}}'}… for variables)</label>
                  <textarea className="input-field" style={{ marginTop: 4, minHeight: 70, resize: 'vertical' }} value={tplBody} onChange={e => setTplBody(e.target.value)} placeholder="Hi {{1}}, your shipment {{2}} has cleared customs." />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="default" size="sm" onClick={createTemplate} disabled={savingTpl}>{savingTpl ? 'Submitting…' : 'Submit for Review'}</Button>
                  <Button variant="outline" size="sm" onClick={() => setShowNewTemplate(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {templates && templates.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No templates submitted yet for this WhatsApp Business Account.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                {(templates || []).map(t => (
                  <div key={t.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{t.name}</span>
                      <Badge variant={t.status === 'APPROVED' ? 'success' : t.status === 'REJECTED' ? 'error' : 'warning'}>{t.status}</Badge>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>{t.category} · {t.language}</div>
                    {t.components?.find((c: any) => c.type === 'BODY')?.text && (
                      <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 6, lineHeight: 1.4 }}>{t.components.find((c: any) => c.type === 'BODY').text}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Auto-Reply Bot — real whatsapp_keyword support_rules, actually
          evaluated by the inbound webhook handler */}
      <SectionCard
        title="Auto-Reply Keywords"
        action={canManage ? (
          <Button variant="outline" size="sm" onClick={() => setShowNewRule(v => !v)}>
            <Icon name="plus" size={13} /> New Rule
          </Button>
        ) : undefined}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {showNewRule && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>KEYWORD</label>
                  <input className="input-field" style={{ marginTop: 4 }} value={ruleKeyword} onChange={e => setRuleKeyword(e.target.value)} placeholder="HELP" />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>MATCH TYPE</label>
                  <Select value={ruleMatchType} onValueChange={v => setRuleMatchType(v as any)}>
                    <SelectTrigger className="input-field" style={{ marginTop: 4 }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="starts_with">Starts with</SelectItem>
                      <SelectItem value="exact">Exact match</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>AUTO-REPLY TEXT</label>
                <textarea className="input-field" style={{ marginTop: 4, minHeight: 60, resize: 'vertical' }} value={ruleReply} onChange={e => setRuleReply(e.target.value)} placeholder="Thanks for reaching out — an agent will respond shortly. For urgent shipment queries call +255…" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="default" size="sm" onClick={createRule} disabled={savingRule}>{savingRule ? 'Saving…' : 'Create Rule'}</Button>
                <Button variant="outline" size="sm" onClick={() => setShowNewRule(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {rules.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No keyword auto-replies configured yet — inbound WhatsApp messages are only ever routed to Support Center agents.</div>
          ) : (
            rules.map(r => {
              const cfg = parseConfig(r);
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>"{cfg.keyword}"</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{MATCH_LABEL[cfg.matchType] || cfg.matchType} · replies: "{cfg.replyText.slice(0, 60)}{cfg.replyText.length > 60 ? '…' : ''}"</div>
                  </div>
                  <Badge variant={r.enabled ? 'success' : 'gray'}>{r.enabled ? 'Active' : 'Disabled'}</Badge>
                  {canManage && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => toggleRule(r)}>{r.enabled ? 'Disable' : 'Enable'}</Button>
                      <Button variant="outline" size="sm" onClick={() => deleteRule(r)}><Icon name="trash2" size={13} /></Button>
                    </>
                  )}
                </div>
              );
            })
          )}
          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
            Other automation types (auto-assignment, SLA escalation, status changes) live in <Link to="/bliss/operational-mode" style={{ color: 'var(--teal)', fontWeight: 600 }}>Operational Mode</Link>.
          </div>
        </div>
      </SectionCard>

      {/* Send Test Message — real WhatsAppIntegration.sendMessage/sendTemplateMessage call */}
      <SectionCard title="Send Test Message">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant={testMode === 'text' ? 'default' : 'outline'} size="sm" onClick={() => setTestMode('text')}>Free text</Button>
            <Button variant={testMode === 'template' ? 'default' : 'outline'} size="sm" onClick={() => setTestMode('template')} disabled={approvedTemplates.length === 0}>Approved template</Button>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>DESTINATION PHONE NUMBER</label>
            <input className="input-field" style={{ marginTop: 4, fontFamily: 'var(--mono)' }} value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="0712345678" />
          </div>
          {testMode === 'text' ? (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>MESSAGE TEXT</label>
              <textarea className="input-field" style={{ marginTop: 4, minHeight: 60, resize: 'vertical' }} value={testText} onChange={e => setTestText(e.target.value)} />
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>TEMPLATE</label>
              <Select value={testTemplate} onValueChange={setTestTemplate}>
                <SelectTrigger className="input-field" style={{ marginTop: 4 }}><SelectValue placeholder="Select an approved template" /></SelectTrigger>
                <SelectContent>
                  {approvedTemplates.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="default" size="sm" onClick={sendTest} disabled={sendingTest}>
            <Icon name="send" size={13} /> {sendingTest ? 'Sending…' : 'Send Test Message'}
          </Button>
          {testResult && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>{testResult.msg}</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};
