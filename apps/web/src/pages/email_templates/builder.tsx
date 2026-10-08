import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Input } from '../../components/ui/input.js';
import { Button } from '../../components/ui/button.js';
import { Dialog, DialogContent } from '../../components/ui/dialog.js';
import { EmailBlockBuilder, blocksToEmailHtml, type EmailBlock } from '../../components/EmailBlockBuilder.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { MY_MERGE_VARS, evaluateSampleMergeTags, htmlToBuilderBlocks, DEFAULT_SAMPLE_DATA } from './shared.js';

// ═════════════════════════════════════════════════════════════════════════════
// 2. ADVANCED BUILDER STUDIO DIALOG (Requirement 2)
// ═════════════════════════════════════════════════════════════════════════════

interface AdvancedBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subject: string;
  category: string;
  bodyHtml: string;
  isImported?: boolean;
  importedKey?: string;
  onSave: (data: { name: string; subject: string; bodyHtml: string; category: string }) => Promise<void>;
}

export function AdvancedBuilderDialog({
  open,
  onOpenChange,
  title: initialTitle,
  subject: initialSubject,
  category: initialCategory,
  bodyHtml: initialHtml,
  isImported,
  importedKey,
  onSave,
}: AdvancedBuilderDialogProps) {
  const [activeTab, setActiveTab] = useState<'blocks' | 'html' | 'css' | 'import' | 'simulator' | 'export'>('blocks');
  const [title, setTitle] = useState(initialTitle);
  const [subject, setSubject] = useState(initialSubject);
  const [category, setCategory] = useState(initialCategory);
  const [htmlCode, setHtmlCode] = useState(initialHtml);
  const [customCss, setCustomCss] = useState(`/* Custom Email Responsive Styles */
@media only screen and (max-width: 600px) {
  .email-container { width: 100% !important; max-width: 100% !important; }
  .email-stack { display: block !important; width: 100% !important; }
  .email-hero-title { font-size: 22px !important; }
  .email-btn { width: 100% !important; text-align: center !important; }
}

@media (prefers-color-scheme: dark) {
  .email-dark-bg { background-color: #0f172a !important; color: #f8fafc !important; }
}`);
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => htmlToBuilderBlocks(initialHtml));
  const [sampleData, setSampleData] = useState<Record<string, string>>(DEFAULT_SAMPLE_DATA);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [simDevice, setSimDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync when initialHtml changes
  useEffect(() => {
    setTitle(initialTitle);
    setSubject(initialSubject);
    setCategory(initialCategory);
    setHtmlCode(initialHtml);
    setBlocks(htmlToBuilderBlocks(initialHtml));
  }, [initialTitle, initialSubject, initialCategory, initialHtml]);

  function handleBlocksChange(nextBlocks: EmailBlock[]) {
    setBlocks(nextBlocks);
    const generatedHtml = blocksToEmailHtml(nextBlocks);
    setHtmlCode(generatedHtml);
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.match(/\.(html|htm|eml)$/i)) {
      showAlert('Please select a valid .html or .htm file.');
      return;
    }

    setImporting(true);
    try {
      const rawText = await file.text();
      const res: { html: string } = await apiFetch('/v1/email/quick-templates/import-html', {
        method: 'POST',
        body: JSON.stringify({ html: rawText }),
      });
      setHtmlCode(res.html);
      setBlocks(htmlToBuilderBlocks(res.html));
      showAlert('HTML imported and sanitized successfully!', { variant: 'success' });
    } catch (err: any) {
      showAlert(err?.message ?? 'Failed to import file.');
    } finally {
      setImporting(false);
    }
  }

  function formatHtml() {
    try {
      const doc = new DOMParser().parseFromString(htmlCode, 'text/html');
      setHtmlCode(doc.documentElement.outerHTML);
      showAlert('HTML formatted.', { variant: 'success' });
    } catch {
      showAlert('Unable to parse HTML for formatting.');
    }
  }

  function handleCopyHtml() {
    navigator.clipboard.writeText(htmlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showAlert('Clean email HTML copied to clipboard!', { variant: 'success' });
  }

  function handleDownloadHtml() {
    const blob = new Blob([htmlCode], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'email-template'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleStudioSave() {
    setSaving(true);
    try {
      // If custom CSS is present and not already embedded, inject into <head>
      let finalHtml = htmlCode;
      if (customCss.trim() && !finalHtml.includes(customCss.trim())) {
        if (finalHtml.includes('</head>')) {
          finalHtml = finalHtml.replace('</head>', `<style type="text/css">\n${customCss}\n</style>\n</head>`);
        } else {
          finalHtml = `<style type="text/css">\n${customCss}\n</style>\n${finalHtml}`;
        }
      }

      await onSave({
        name: title.trim(),
        subject: subject.trim(),
        category,
        bodyHtml: finalHtml,
      });
      showAlert('Template saved to library successfully!', { variant: 'success' });
      onOpenChange(false);
    } catch (err: any) {
      showAlert(err?.message ?? 'Could not save template');
    } finally {
      setSaving(false);
    }
  }

  const simulatedHtml = useMemo(() => {
    return evaluateSampleMergeTags(htmlCode, sampleData);
  }, [htmlCode, sampleData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="adv-builder-dialog-content">
        {/* ── Studio Header ── */}
        <div className="adv-builder-header">
          <div className="adv-builder-header-left">
            <FeaturedIcon size="md" variant="brand">
              <Icon name="terminal" size={18} />
            </FeaturedIcon>
            <div className="adv-builder-title-group">
              <div className="adv-builder-title-row">
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Template Title"
                  className="adv-builder-title-input"
                />
                {isImported ? (
                  <Badge variant="info">Marketplace Import ({importedKey})</Badge>
                ) : (
                  <Badge variant="brand">Custom Template</Badge>
                )}
              </div>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject: e.g. Payment receipt for {{company}}"
                className="adv-builder-subject-input"
              />
            </div>
          </div>

          <div className="adv-builder-header-actions">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleStudioSave} disabled={saving} className="adv-builder-save-btn">
              <Icon name="check" size={14} />
              {saving ? 'Saving…' : 'Save to Library'}
            </Button>
          </div>
        </div>

        {/* ── Mode Navigation Tabs ── */}
        <div className="adv-builder-nav-tabs">
          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'blocks' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('blocks')}
           data-ui-native-button="">
            <Icon name="grid" size={14} />
            <span>Block Builder</span>
          </button>

          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'html' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('html')}
           data-ui-native-button="">
            <Icon name="terminal" size={14} />
            <span>HTML & Code Editor</span>
          </button>

          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'css' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('css')}
           data-ui-native-button="">
            <Icon name="color" size={14} />
            <span>Custom CSS & Styles</span>
          </button>

          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'import' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('import')}
           data-ui-native-button="">
            <Icon name="upload" size={14} />
            <span>HTML / File Import</span>
          </button>

          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'simulator' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('simulator')}
           data-ui-native-button="">
            <Icon name="play" size={14} />
            <span>Logic & Merge Simulator</span>
          </button>

          <button
            type="button"
            className={`adv-builder-nav-tab${activeTab === 'export' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('export')}
           data-ui-native-button="">
            <Icon name="download" size={14} />
            <span>Export Clean HTML</span>
          </button>
        </div>

        {/* ── Studio Workspace Body ── */}
        <div className="adv-builder-body">
          {/* Tab 1: Visual Drag & Drop Block Builder */}
          {activeTab === 'blocks' && (
            <div className="adv-builder-panel adv-builder-panel--blocks">
              <EmailBlockBuilder
                blocks={blocks}
                onChange={handleBlocksChange}
                varGroups={[{
                  label: 'Template Fields',
                  vars: MY_MERGE_VARS.map(v => ({ key: v.tag, label: v.label, example: `{{${v.tag}}}` })),
                }]}
              />
            </div>
          )}

          {/* Tab 2: HTML & Code Editor */}
          {activeTab === 'html' && (
            <div className="adv-builder-panel adv-builder-panel--html">
              <div className="adv-code-editor-pane">
                <div className="adv-pane-toolbar">
                  <div className="adv-pane-title">
                    <Icon name="terminal" size={14} />
                    <span>Raw HTML Source</span>
                  </div>
                  <div className="adv-pane-actions">
                    <Button size="xs" variant="outline" onClick={formatHtml}>
                      <Icon name="refresh" size={12} /> Format HTML
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={htmlCode}
                  onChange={e => {
                    setHtmlCode(e.target.value);
                    setBlocks(htmlToBuilderBlocks(e.target.value));
                  }}
                  className="adv-code-textarea"
                  spellCheck={false}
                />
              </div>

              <div className="adv-code-preview-pane">
                <div className="adv-pane-toolbar">
                  <div className="adv-pane-title">
                    <Icon name="eye" size={14} />
                    <span>Live Sandboxed Preview</span>
                  </div>
                </div>
                <div className="adv-preview-viewport">
                  <iframe
                    title="Live HTML Preview"
                    sandbox=""
                    srcDoc={htmlCode}
                    className="adv-preview-iframe"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Custom CSS & Styling */}
          {activeTab === 'css' && (
            <div className="adv-builder-panel adv-builder-panel--css">
              <div className="adv-css-editor-col">
                <div className="adv-pane-toolbar">
                  <div className="adv-pane-title">
                    <Icon name="color" size={14} />
                    <span>Custom Embedded Stylesheet</span>
                  </div>
                  <div className="adv-pane-actions">
                    <Button size="xs" variant="outline" onClick={() => setCustomCss(prev => `${prev}\n\n/* Button Hover */\n.email-btn:hover { opacity: 0.88 !important; }`)}>
                      + Hover Preset
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => setCustomCss(prev => `${prev}\n\n/* Dark Mode Inversion */\n@media (prefers-color-scheme: dark) {\n  .email-card { background: #1e293b !important; color: #ffffff !important; }\n}`)}>
                      + Dark Mode
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={customCss}
                  onChange={e => setCustomCss(e.target.value)}
                  className="adv-code-textarea adv-code-textarea--css"
                  spellCheck={false}
                />
              </div>

              <div className="adv-css-guide-col">
                <div className="adv-guide-card">
                  <h4>Email CSS Guidelines</h4>
                  <p>Most desktop clients (like Outlook) require inlined styles. Media queries in this CSS editor are compiled into the <code>&lt;head&gt;</code> for modern mobile clients (Apple Mail, iOS, Gmail app, Android).</p>
                  <div className="adv-guide-tags">
                    <span className="adv-guide-pill">@media only screen and (max-width: 600px)</span>
                    <span className="adv-guide-pill">@media (prefers-color-scheme: dark)</span>
                    <span className="adv-guide-pill">!important overrides</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: HTML & Asset File Import */}
          {activeTab === 'import' && (
            <div className="adv-builder-panel adv-builder-panel--import">
              <div className="adv-import-dropzone" onClick={() => fileInputRef.current?.click()}>
                <FeaturedIcon size="lg" variant="brand">
                  <Icon name="upload" size={24} />
                </FeaturedIcon>
                <h3>Upload Email HTML File</h3>
                <p>Drag & drop or browse your <code>.html</code>, <code>.htm</code>, or <code>.eml</code> template file. Styles are automatically sanitized and merged.</p>
                <Button size="sm" disabled={importing}>
                  {importing ? 'Sanitizing & Importing…' : 'Browse Files'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm,.eml"
                  style={{ display: 'none' }}
                  onChange={handleFileImport}
                />
              </div>
            </div>
          )}

          {/* Tab 5: Dynamic Variable & Logic Simulator */}
          {activeTab === 'simulator' && (
            <div className="adv-builder-panel adv-builder-panel--simulator">
              <div className="adv-sim-controls-col">
                <div className="adv-pane-toolbar">
                  <div className="adv-pane-title">
                    <Icon name="play" size={14} />
                    <span>Mock Customer Context</span>
                  </div>
                </div>
                <div className="adv-sim-fields-list">
                  {Object.entries(sampleData).map(([key, val]) => (
                    <div key={key} className="adv-sim-field">
                      <label>{`{{${key}}}`}</label>
                      <Input
                        value={val}
                        onChange={e => setSampleData(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={key}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="adv-sim-preview-col">
                <div className="adv-pane-toolbar">
                  <div className="adv-pane-title">
                    <Icon name="eye" size={14} />
                    <span>Evaluated Live Preview</span>
                  </div>
                  <div className="adv-sim-device-btns">
                    <button
                      type="button"
                      className={`adv-sim-device-btn${simDevice === 'desktop' ? ' is-active' : ''}`}
                      onClick={() => setSimDevice('desktop')}
                     data-ui-native-button="">
                      <Icon name="monitor" size={13} /> Desktop
                    </button>
                    <button
                      type="button"
                      className={`adv-sim-device-btn${simDevice === 'mobile' ? ' is-active' : ''}`}
                      onClick={() => setSimDevice('mobile')}
                     data-ui-native-button="">
                      <Icon name="smartphone" size={13} /> Mobile
                    </button>
                  </div>
                </div>
                <div className={`adv-sim-frame-wrap adv-sim-frame-wrap--${simDevice}`}>
                  <iframe
                    title="Simulated Email Preview"
                    sandbox=""
                    srcDoc={simulatedHtml}
                    className="adv-sim-iframe"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 6: Export Clean HTML */}
          {activeTab === 'export' && (
            <div className="adv-builder-panel adv-builder-panel--export">
              <div className="adv-export-card">
                <FeaturedIcon size="lg" variant="brand">
                  <Icon name="package" size={24} />
                </FeaturedIcon>
                <h3>Production-Ready Inlined HTML</h3>
                <p>This email template is fully compiled with table fallbacks, inline CSS styles, and responsive tags ready to paste into SendGrid, Mailchimp, Postmark, Resend, or AWS SES.</p>
                <div className="adv-export-btns">
                  <Button onClick={handleCopyHtml}>
                    <Icon name="copy" size={14} /> {copied ? 'Copied!' : 'Copy Clean HTML'}
                  </Button>
                  <Button variant="outline" onClick={handleDownloadHtml}>
                    <Icon name="download" size={14} /> Download .html File
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
