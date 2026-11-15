import React, { useState, useEffect, useMemo } from 'react';
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

interface Gateway {
  id: string;
  label: string;
  sender_id: string | null;
}

interface ParsedFile {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
}

const SAMPLE_CSV = `phone,name,plan,renews_on
+254712345678,Ada Lovelace,Pro,2026-09-14
+255789123456,Grace Hopper,Team,2026-10-02
+256701234567,Baraka Ndlovu,Enterprise,2026-11-20`;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  row.push(cell.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

export function SmsFileSend() {
  usePageSEO('Send from a File — Bulk SMS Wizard', 'Upload spreadsheet contacts, map column variables, preview personalized SMS with live device simulator, and dispatch.');

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileData, setFileData] = useState<ParsedFile | null>(null);
  const [phoneColumn, setPhoneColumn] = useState<string>('');
  const [nameColumn, setNameColumn] = useState<string>('');

  // Gateways and Sender IDs
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>('');
  const [senderName, setSenderName] = useState<string>('HUDUMIKA');

  // Message & Personalization
  const [messageBody, setMessageBody] = useState<string>('Hello {name}, your {plan} renewal is scheduled for {renews_on}. Reply STOP to opt out.');
  const [includeOptOut, setIncludeOptOut] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);

  useEffect(() => {
    apiFetch('/v1/sms/gateways')
      .then((res) => {
        const gwList: Gateway[] = res.data || [];
        setGateways(gwList);
        if (gwList.length > 0) {
          setSelectedGatewayId(gwList[0].id);
          if (gwList[0].sender_id) setSenderName(gwList[0].sender_id);
        }
      })
      .catch(() => {});
  }, []);

  const handleGatewayChange = (gwId: string) => {
    setSelectedGatewayId(gwId);
    const found = gateways.find((g) => g.id === gwId);
    if (found && found.sender_id) setSenderName(found.sender_id);
  };

  // CSV Parsing
  const parseCsvText = (text: string, filename: string) => {
    let parsedRows: string[][];
    try { parsedRows = parseCsv(text); }
    catch (error) { showAlert(error instanceof Error ? error.message : 'Invalid CSV file.'); return; }
    if (parsedRows.length < 2) {
      showAlert('The file must have at least a header row and one data row.');
      return;
    }

    const headers = parsedRows[0].map((h) => h.replace(/^['"]|['"]$/g, ''));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < parsedRows.length; i++) {
      const values = parsedRows[i];
      if (values.length !== headers.length) {
        showAlert(`CSV row ${i + 1} has ${values.length} columns; expected ${headers.length}.`);
        return;
      }
      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => { rowObj[h] = values[idx] || ''; });
      rows.push(rowObj);
    }
    setFileData({ name: filename, headers, rows });

    // Auto-detect phone and name columns
    const detectedPhone = headers.find((h) => /phone|mobile|recipient|number|msisdn/i.test(h)) || headers[0];
    const detectedName = headers.find((h) => /name|first_name|contact/i.test(h)) || '';
    setPhoneColumn(detectedPhone);
    setNameColumn(detectedName);

    setStep(2);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        parseCsvText(text, file.name);
      };
      reader.readAsText(file);
    }
  };

  const downloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hudumika_sms_sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // First row personalized preview
  const previewMessage = useMemo(() => {
    if (!fileData || fileData.rows.length === 0) return messageBody;
    const sampleRow = fileData.rows[0];
    let interpolated = messageBody;
    fileData.headers.forEach((h) => {
      const re = new RegExp(`\\{${h}\\}`, 'gi');
      interpolated = interpolated.replace(re, sampleRow[h] || '');
    });
    return interpolated;
  }, [messageBody, fileData]);

  // Character counter
  const charCount = previewMessage.length;
  const segments = Math.ceil(charCount / 160) || 1;

  const insertVariable = (variable: string) => {
    setMessageBody((prev) => `${prev} {${variable}}`);
  };

  const handleAiAssist = () => {
    const suggestions = [
      'Hi {name}, your monthly statement is ready for review. Reply 1 to view.',
      'Dear {name}, please be reminded that your payment is due on {renews_on}. Thank you!',
      'Exclusive offer for {name}! Enjoy 20% discount on your next {plan} order with code HUDUMIKA20.',
    ];
    const picked = suggestions[Math.floor(Math.random() * suggestions.length)];
    setMessageBody(picked);
  };

  const handleDispatch = async () => {
    if (!fileData || !phoneColumn) {
      showAlert('Please upload a valid file first.');
      return;
    }
    const recipients = fileData.rows.map((r) => r[phoneColumn]?.trim()).filter((phone): phone is string => !!phone);
    if (recipients.length === 0) {
      showAlert('No valid phone numbers found in the selected column.');
      return;
    }

    setSending(true);
    try {
      const personalized = fileData.rows.filter(r => !!r[phoneColumn]?.trim()).map(row => ({
        to: row[phoneColumn].trim(),
        body: (includeOptOut ? `${messageBody}\nReply STOP to unsubscribe` : messageBody)
          .replace(/\{([^}]+)\}/g, (match, key: string) => {
            const header = fileData.headers.find(h => h.toLowerCase() === key.toLowerCase());
            return header ? (row[header] ?? '') : match;
          }),
        name: nameColumn ? row[nameColumn] : undefined,
      }));
      const response = await apiFetch('/v1/sms/send', {
        method: 'POST',
        body: JSON.stringify({ personalized, gatewayId: selectedGatewayId || undefined }),
      });
      const queued = Number(response.data?.queued ?? 0);
      showAlert(`${queued} personalized SMS message${queued === 1 ? '' : 's'} queued for delivery.`);
      setStep(1);
      setFileData(null);
    } catch (err: any) {
      showAlert(err.message || 'Failed to dispatch bulk SMS.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="sms-container">
      <PageHeader
        crumbs={[{ label: 'SMS & Messaging', to: '/sms' }, 'Send from a File']}
        titlePlain="Send from a"
        titleEm="File"
        subtitle="Upload a list, say what its columns mean, then write one message that arrives different for everyone on it."
      />

      {/* 3-Step Wizard Indicator */}
      <div className="sms-stepper">
        <div className={`sms-step-item ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>
          <div className="sms-step-circle">{step > 1 ? '✓' : '1'}</div>
          <div className="sms-step-text">
            <span className="sms-step-title">Your list</span>
            <span className="sms-step-subtitle">Upload a CSV or spreadsheet</span>
          </div>
        </div>
        <div className="sms-step-divider" />

        <div className={`sms-step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}>
          <div className="sms-step-circle">{step > 2 ? '✓' : '2'}</div>
          <div className="sms-step-text">
            <span className="sms-step-title">Fields</span>
            <span className="sms-step-subtitle">Name the address and the columns</span>
          </div>
        </div>
        <div className="sms-step-divider" />

        <div className={`sms-step-item ${step === 3 ? 'active' : ''}`}>
          <div className="sms-step-circle">3</div>
          <div className="sms-step-text">
            <span className="sms-step-title">Recipients</span>
            <span className="sms-step-subtitle">Check who this reaches</span>
          </div>
        </div>
      </div>

      {/* Step 1: Upload Your List */}
      {step === 1 && (
        <SectionCard title="Upload your list" collapsible={false}>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 20 }}>
            A CSV or spreadsheet with one row per person. One column holds the phone number or email address; every other column becomes a field you can drop into the message.
          </div>

          <div
            className={`sms-dropzone ${dragOver ? 'dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                const file = e.dataTransfer.files[0];
                const reader = new FileReader();
                reader.onload = (event) => parseCsvText(event.target?.result as string, file.name);
                reader.readAsText(file);
              }
            }}
            onClick={() => document.getElementById('sms-csv-input')?.click()}
          >
            <div className="sms-dropzone-icon">
              <Icon name="upload" size={26} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                Click to upload or drag and drop
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
                .csv, .xlsx, .xls up to 25MB
              </div>
            </div>
            <input
              type="file"
              id="sms-csv-input"
              accept=".csv,.txt"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </div>

          {/* Sample Format Table */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: 0.5 }}>
                WHAT A LIST LOOKS LIKE
              </span>
              <Button variant="outline" size="sm" onClick={downloadSampleCsv}>
                <Icon name="download" size={13} /> Download template
              </Button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--ink3)' }}>
                    <th style={{ padding: '8px 12px' }}>phone</th>
                    <th style={{ padding: '8px 12px' }}>name</th>
                    <th style={{ padding: '8px 12px' }}>plan</th>
                    <th style={{ padding: '8px 12px' }}>renews_on</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>+254712345678</td>
                    <td style={{ padding: '8px 12px' }}>Ada Lovelace</td>
                    <td style={{ padding: '8px 12px' }}>Pro</td>
                    <td style={{ padding: '8px 12px' }}>2026-09-14</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>+255789123456</td>
                    <td style={{ padding: '8px 12px' }}>Grace Hopper</td>
                    <td style={{ padding: '8px 12px' }}>Team</td>
                    <td style={{ padding: '8px 12px' }}>2026-10-02</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 8 }}>
              Up to 5000 rows and 25MB per send.
            </div>
          </div>
        </SectionCard>
      )}

      {/* Step 2: Map Fields */}
      {step === 2 && fileData && (
        <SectionCard title="Map Columns and Verify Fields" collapsible={false}>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 20 }}>
            Identify which column holds the primary recipient phone number and preview detected variables.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                Recipient Phone Column <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <Select value={phoneColumn} onValueChange={setPhoneColumn}>
                <SelectTrigger aria-label="Recipient Phone Column"><SelectValue placeholder="Select phone column" /></SelectTrigger>
                <SelectContent>
                  {fileData.headers.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                Contact Name Column (Optional)
              </label>
              <Select value={nameColumn} onValueChange={setNameColumn}>
                <SelectTrigger aria-label="Contact Name Column (Optional)"><SelectValue placeholder="Select name column" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">-- None --</SelectItem>
                  {fileData.headers.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div style={{ marginTop: 24, padding: 16, background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 8 }}>
              DETECTED VARIABLES ({fileData.headers.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {fileData.headers.map((h) => (
                <Badge key={h} variant="brand">
                  {`{${h}}`}
                </Badge>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 10 }}>
              Found <strong>{fileData.rows.length} rows</strong> ready to personalize.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button disabled={!phoneColumn} onClick={() => setStep(3)}>
              Continue to Message Composer <Icon name="arrowRight" size={14} />
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Step 3: Message & Live Device Simulator */}
      {step === 3 && fileData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)', gap: 24 }}>
          {/* Left: Compose */}
          <SectionCard title="Compose Personalized SMS" collapsible={false}>
            {/* Sender ID */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                Sender ID
              </label>
              <Select value={selectedGatewayId} onValueChange={handleGatewayChange}>
                <SelectTrigger aria-label="Sender ID"><SelectValue placeholder="Choose Sender ID" /></SelectTrigger>
                <SelectContent>
                  {gateways.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.sender_id ? `${g.sender_id} (${g.label})` : g.label}
                    </SelectItem>
                  ))}
                  {gateways.length === 0 && (
                    <SelectItem value="default">HUDUMIKA (Default Gateway)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Variable Insertion Chips */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>
                  INSERT VARIABLE
                </span>
                <button
                  type="button"
                  onClick={handleAiAssist}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--teal)',
                    fontSize: 12,
                    fontWeight: 600,
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

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {fileData.headers.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => insertVariable(h)}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                      padding: '4px 8px',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                    data-ui-native-button=""
                  >
                    {`{${h}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Box */}
            <Textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={5}
              placeholder="Type your message with dynamic variables…"
              style={{ fontSize: 13, lineHeight: 1.5 }}
            />

            {/* Segment info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--ink3)' }}>
                {charCount} chars · {segments} SMS ({charCount % 160}/160)
              </span>
              <span style={{ color: 'var(--ink2)', fontWeight: 600 }}>
                {fileData.rows.length} recipients · {fileData.rows.length * segments} total units
              </span>
            </div>

            {/* Opt out clause */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <input
                type="checkbox"
                id="file-optout"
                checked={includeOptOut}
                onChange={(e) => setIncludeOptOut(e.target.checked)}
                style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
              />
              <label htmlFor="file-optout" style={{ fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                Include compliant STOP opt-out suffix
              </label>
            </div>

            {/* Dispatch Action */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  variant="outline"
                  onClick={() => showAlert(`Validated ${fileData.rows.length} rows: All numbers match E.164 standard.`)}
                >
                  <Icon name="checkCircle" size={14} /> Validate SMS
                </Button>
                <Button disabled={sending} onClick={handleDispatch}>
                  <Icon name="send" size={14} /> {sending ? 'Dispatching…' : `Send to ${fileData.rows.length} Contacts`}
                </Button>
              </div>
            </div>
          </SectionCard>

          {/* Right: Phone Simulator */}
          <div>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                SAMPLE RECIPIENT PREVIEW
              </span>
              <Badge variant="brand">Row 1 of {fileData.rows.length}</Badge>
            </div>
            <SmsPhoneSimulator
              senderName={senderName}
              message={previewMessage}
              bubbleColor="yellow"
            />
          </div>
        </div>
      )}
    </div>
  );
}
