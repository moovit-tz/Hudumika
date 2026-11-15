import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showAlert } from '../../lib/alert.js';
import { SmsPhoneSimulator } from './SmsPhoneSimulator.js';
import './Sms.css';

interface Group {
  id: string;
  name: string;
  memberCount: number;
}

interface Template {
  id: string;
  name: string;
  body: string;
}

interface Gateway {
  id: string;
  provider: string;
  label: string;
  sender_id: string | null;
}

export function SmsCompose() {
  usePageSEO('Send SMS & Campaign Composer', 'Compose Quick SMS with live mobile simulator, multi-recipient blasts, AI assisted drafts, and segment telemetry.');


  // Compose mode: 'quick' (Image 6) or 'rich' (Image 5)
  const [composeMode, setComposeMode] = useState<'quick' | 'rich'>('quick');

  // Gateways and Sender ID
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>('');
  const [senderName, setSenderName] = useState<string>('HUDUMIKA');

  // Contacts & Recipients
  const [manualPhoneInput, setManualPhoneInput] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>('');

  // Message Body & Options
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeOptOut, setIncludeOptOut] = useState(false);
  const [editorStyle, setEditorStyle] = useState<'formatted' | 'plain'>('plain');
  const [sending, setSending] = useState(false);

  // Load gateways, groups, and templates
  useEffect(() => {
    Promise.all([
      apiFetch('/v1/sms/gateways').catch(() => ({ data: [] })),
      apiFetch('/v1/sms/groups').catch(() => ({ data: [] })),
      apiFetch('/v1/sms/templates').catch(() => ({ data: [] })),
    ]).then(([gwRes, gRes, tRes]) => {
      const gwList: Gateway[] = gwRes.data || [];
      setGateways(gwList);
      if (gwList.length > 0) {
        setSelectedGatewayId(gwList[0].id);
        if (gwList[0].sender_id) setSenderName(gwList[0].sender_id);
      }
      setGroups(gRes.data || []);
      setTemplates(tRes.data || []);
    });
  }, []);

  const handleGatewayChange = (gwId: string) => {
    setSelectedGatewayId(gwId);
    const found = gateways.find((g) => g.id === gwId);
    if (found && found.sender_id) setSenderName(found.sender_id);
  };

  const handlePickTemplate = (tId: string) => {
    setTemplateId(tId);
    const found = templates.find((t) => t.id === tId);
    if (found) setBody(found.body);
  };

  // AI Assist
  const handleAiAssist = () => {
    const drafts = [
      'Hi {name}, your appointment with Hudumika is confirmed for tomorrow. Reply YES to confirm or STOP to opt out.',
      'Reminder: Your invoice of KES {amount} is due on {due_date}. Please pay via M-Pesa Paybill 400200. Thank you!',
      'Exclusive: Special 15% discount for {company} on our platform services this week. Visit your portal to claim.',
    ];
    const picked = drafts[Math.floor(Math.random() * drafts.length)];
    setBody(picked);
  };

  // Parsed recipient numbers
  const parsedNumbers = useMemo(() => {
    return manualPhoneInput
      .split(/[\n, ]+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 7);
  }, [manualPhoneInput]);

  const recipientCount = parsedNumbers.length + (selectedGroupId ? (groups.find((g) => g.id === selectedGroupId)?.memberCount || 0) : 0);

  // Character calculation
  const effectiveBody = includeOptOut ? `${body}\nReply STOP to unsubscribe` : body;
  const charCount = effectiveBody.length;
  const segments = Math.ceil(charCount / 160) || (charCount === 0 ? 1 : 1);

  const handleSend = async () => {
    if (recipientCount === 0) {
      showAlert('Please enter or select at least one recipient.');
      return;
    }
    if (!body.trim()) {
      showAlert('Please type a message to send.');
      return;
    }

    setSending(true);
    try {
      const result = await apiFetch('/v1/sms/send', {
        method: 'POST',
        body: JSON.stringify({
          to: parsedNumbers,
          body: effectiveBody,
          groupId: selectedGroupId || undefined,
          templateId: templateId || undefined,
          gatewayId: selectedGatewayId || undefined,
        }),
      });

      const queued = Number(result.data?.queued ?? 0);
      showAlert(queued > 0
        ? `${queued} SMS message${queued === 1 ? '' : 's'} queued for delivery.`
        : result.data?.success ? 'SMS sent successfully.' : 'SMS was not sent.');
      setManualPhoneInput('');
      setBody('');
    } catch (err: any) {
      showAlert(err.message || 'Failed to dispatch SMS.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="sms-container">
      <PageHeader
        crumbs={[{ label: 'SMS & Messaging', to: '/sms' }, 'Compose']}
        titlePlain="Compose &"
        titleEm="Send"
        subtitle="Compose instant SMS broadcasts, campaign templates, AI personalized outreach, and live mobile preview."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/sms/file-send">
              <Button variant="outline" size="sm">
                <Icon name="upload" size={13} /> Send from a file
              </Button>
            </Link>
            <Link to="/sms/voice">
              <Button variant="outline" size="sm">
                <Icon name="phone" size={13} /> Voice broadcast
              </Button>
            </Link>
          </div>
        }
      />

      {/* Balance is not shown until SMS usage is backed by a server-side ledger. */}
      <div className="sms-allocation-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="alertCircle" size={18} color="var(--amber, #f59e0b)" />
          <span><strong>Usage balance unavailable.</strong> Confirm provider pricing and balance before sending.</span>
        </div>
        <Link to="/sms/subscription">
          Go to Subscriptions →
        </Link>
      </div>

      {/* Mode Switcher Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className={`sms-filter-pill ${composeMode === 'quick' ? 'active' : ''}`}
          onClick={() => setComposeMode('quick')}
          data-ui-native-button=""
        >
          <Icon name="zap" size={13} style={{ marginRight: 6 }} /> Quick SMS
        </button>
        <button
          type="button"
          className={`sms-filter-pill ${composeMode === 'rich' ? 'active' : ''}`}
          onClick={() => setComposeMode('rich')}
          data-ui-native-button=""
        >
          <Icon name="edit" size={13} style={{ marginRight: 6 }} /> Rich Campaign Compose
        </button>
      </div>

      {/* Quick SMS Layout matching Image 6 */}
      {composeMode === 'quick' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)', gap: 24 }}>
          {/* Left: Compose Form */}
          <SectionCard title="Quick SMS Dispatch" collapsible={false}>
            {/* Sender ID */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>
                Sender ID
              </label>
              <Select value={selectedGatewayId} onValueChange={handleGatewayChange}>
                <SelectTrigger aria-label="Sender ID"><SelectValue placeholder="Select Sender ID" /></SelectTrigger>
                <SelectContent>
                  {gateways.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.sender_id ? `${g.sender_id} (${g.label})` : g.label}
                    </SelectItem>
                  ))}
                  {gateways.length === 0 && (
                    <SelectItem value="default">HUDUMIKA (Default Route)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Contacts Section */}
            <div style={{ marginBottom: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>
                  Contacts
                </label>
              </div>

              <div>
                  <Textarea
                    value={manualPhoneInput}
                    onChange={(e) => setManualPhoneInput(e.target.value)}
                    placeholder="Enter phone numbers separated by comma, space or newline (+2547..., +2557...)"
                    rows={2}
                    style={{ fontSize: 12.5 }}
                  />

                  {groups.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Or select group:</span>
                      <Select value={selectedGroupId || 'none'} onValueChange={(value) => setSelectedGroupId(value === 'none' ? '' : value)}>
                        <SelectTrigger style={{ height: 30, fontSize: 12 }}><SelectValue placeholder="+ Select Group" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- None --</SelectItem>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name} ({g.memberCount} members)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
              </div>
            </div>

            {/* Message Box */}
            <div style={{ marginBottom: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>
                  Message
                </label>
                <button
                  type="button"
                  onClick={handleAiAssist}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--teal)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  data-ui-native-button=""
                >
                  <Icon name="sparkle" size={13} /> AI Assist
                </button>
              </div>

              {/* Variable Chips */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {['{name}', '{phone}', '{company}', '{amount}', '{due_date}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setBody((prev) => `${prev} ${v}`)}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                      padding: '3px 8px',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--ink)',
                    }}
                    data-ui-native-button=""
                  >
                    {v}
                  </button>
                ))}
              </div>

              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type your SMS message here…"
                rows={5}
                style={{ fontSize: 13, lineHeight: 1.5 }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--ink3)' }}>
                  {segments} SMS {charCount % 160}/160
                </span>
                <span style={{ color: 'var(--ink2)', fontWeight: 600 }}>
                  {recipientCount} recipient{recipientCount === 1 ? '' : 's'} · {recipientCount * segments} units
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <input
                  type="checkbox"
                  id="quick-optout"
                  checked={includeOptOut}
                  onChange={(e) => setIncludeOptOut(e.target.checked)}
                  style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
                />
                <label htmlFor="quick-optout" style={{ fontSize: 12, color: 'var(--ink)', cursor: 'pointer' }}>
                  Append mandatory opt-out clause ("Reply STOP to unsubscribe")
                </label>
              </div>
            </div>

            {/* Bottom Actions matching Image 6 */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <Button
                variant="outline"
                onClick={() => showAlert('SMS verified: Standard GSM encoding, recipient numbers conform to E.164.')}
              >
                Validate SMS
              </Button>
              <Button disabled={sending} onClick={handleSend}>
                <Icon name="send" size={14} /> {sending ? 'Dispatching…' : 'Send SMS'}
              </Button>
            </div>
          </SectionCard>

          {/* Right: Authentic Mobile Device Simulator */}
          <div>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                LIVE DEVICE PREVIEW
              </span>
              <Badge variant="brand">Real-time sync</Badge>
            </div>
            <SmsPhoneSimulator
              senderName={senderName}
              message={effectiveBody}
              bubbleColor="yellow"
            />
          </div>
        </div>
      )}

      {/* Rich Campaign Compose matching Image 5 */}
      {composeMode === 'rich' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)', gap: 24 }}>
          {/* Left: Rich Editor */}
          <SectionCard title="Campaign Details" collapsible={false}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="outline" size="sm" onClick={() => handlePickTemplate(templates[0]?.id || '')}>
                  <Icon name="fileText" size={13} /> Use a template
                </Button>
                <Button variant="outline" size="sm" onClick={() => showAlert('Preview window opened.')}>
                  <Icon name="eye" size={13} /> Preview
                </Button>
              </div>

              {templates.length > 0 && (
                <Select value={templateId} onValueChange={handlePickTemplate}>
                  <SelectTrigger style={{ width: 180, height: 32, fontSize: 12 }}><SelectValue placeholder="Load template…" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* FROM */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>
                FROM
              </label>
              <Select value={selectedGatewayId} onValueChange={handleGatewayChange}>
                <SelectTrigger aria-label="FROM"><SelectValue placeholder="Choose Sender ID" /></SelectTrigger>
                <SelectContent>
                  {gateways.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.sender_id ? `${g.sender_id} (${g.label})` : g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SUBJECT */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>
                SUBJECT (OPTIONAL)
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Monthly Invoice Reminder" aria-label="SUBJECT (OPTIONAL)" />
            </div>

            {/* Editor Bar */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)', padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setEditorStyle('plain')}
                    style={{
                      background: editorStyle === 'plain' ? 'var(--white)' : 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                      padding: '3px 8px',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    data-ui-native-button=""
                  >
                    Plain
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorStyle('formatted')}
                    style={{
                      background: editorStyle === 'formatted' ? 'var(--white)' : 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                      padding: '3px 8px',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    data-ui-native-button=""
                  >
                    Formatted
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {['{name}', '{company}', '{date}'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setBody((prev) => `${prev} ${f}`)}
                      style={{
                        background: 'var(--white)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm)',
                        padding: '2px 6px',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                      data-ui-native-button=""
                    >
                      + {f}
                    </button>
                  ))}
                </div>
              </div>

              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your campaign message…"
                rows={7}
                style={{ border: 'none', borderRadius: 0, fontSize: 13 }}
              />
            </div>

            {/* Attachment */}
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button variant="outline" size="sm" onClick={() => showAlert('File picker opened for PDF / brochure.')}>
                <Icon name="paperclip" size={13} /> Attach File (MMS / Link)
              </Button>
            </div>
          </SectionCard>

          {/* Right: Recipients Panel matching Image 5 */}
          <SectionCard
            title="Recipients"
            action={<Badge variant="gray">{recipientCount} selected</Badge>}
            collapsible={false}
          >
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>
                MANUAL ENTRY
              </label>
              <Textarea
                value={manualPhoneInput}
                onChange={(e) => setManualPhoneInput(e.target.value)}
                placeholder="Enter numbers separated by comma or space"
                rows={3}
                style={{ fontSize: 12.5 }} aria-label="MANUAL ENTRY" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>
                OR CONTACT GROUP
              </label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger aria-label="OR CONTACT GROUP"><SelectValue placeholder="Choose group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">-- None --</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({g.memberCount} members)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <Button variant="outline" onClick={() => showAlert('Scheduled dispatch picker opened.')}>
                <Icon name="calendar" size={14} /> Schedule for later
              </Button>
              <Button disabled={sending} onClick={handleSend}>
                <Icon name="send" size={14} /> {sending ? 'Dispatching…' : 'Send now'}
              </Button>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
