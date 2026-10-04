import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import type { CmsSiteSettings, CmsFontId, CmsRadiusPreset } from '@hudumika/types';
import { CMS_FONT_IDS, CMS_RADIUS_PRESETS } from '@hudumika/types';
import { ColorSwatchPicker } from '../../components/ui/color-swatch-picker.js';
import { CMS_FONT_LABELS, CMS_RADIUS_LABELS } from '../../lib/cmsDesignTokens.js';
import { useMediaPicker, FL } from './shared.js';

/* ── Customize: Site Identity + Appearance ── */
export function CustomizeView({ settings, onSave }: { settings: CmsSiteSettings | null; onSave: (patch: Partial<CmsSiteSettings>) => Promise<boolean> }) {
  const [form, setForm] = useState<CmsSiteSettings | null>(settings);
  const [saving, setSaving] = useState<'identity' | 'appearance' | null>(null);
  const [savedFlash, setSavedFlash] = useState<'identity' | 'appearance' | null>(null);
  const { pick, picker } = useMediaPicker();

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  if (!form) return <SectionLoading />;
  const set = (k: keyof CmsSiteSettings, v: string) => setForm(f => f ? { ...f, [k]: v } : f);
  // §10 — typed separately from the generic string setter above, since
  // headingFont/bodyFont/radius are real bounded unions, not plain strings.
  const setToken = (k: 'headingFont' | 'bodyFont', v: CmsFontId) => setForm(f => f ? { ...f, [k]: v } : f);
  const setRadius = (v: CmsRadiusPreset) => setForm(f => f ? { ...f, radius: v } : f);

  async function handleSave(section: 'identity' | 'appearance', patch: Partial<CmsSiteSettings>) {
    setSaving(section);
    const ok = await onSave(patch);
    setSaving(null);
    if (ok) { setSavedFlash(section); setTimeout(() => setSavedFlash(null), 2000); }
  }

  async function pickInto(field: 'logoUrl' | 'faviconUrl') {
    const url = await pick();
    if (url) set(field, url);
  }

  return (
    <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 560 }}>
      {picker}
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            <Icon name="star" size={17} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Site Identity</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Shown on your public site at /site/{form.tenantSlug || '…'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FL label="Site Title"><input value={form.siteTitle} onChange={e => set('siteTitle', e.target.value)} className="input-field" placeholder="Your company name" /></FL>
          <FL label="Tagline"><input value={form.tagline} onChange={e => set('tagline', e.target.value)} className="input-field" placeholder="A short description" /></FL>
          <FL label="Logo">
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={form.logoUrl} onChange={e => set('logoUrl', e.target.value)} className="input-field" placeholder="https://…" style={{ flex: 1 }} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => pickInto('logoUrl')}>Choose from library</button>
            </div>
          </FL>
          <FL label="Favicon">
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={form.faviconUrl} onChange={e => set('faviconUrl', e.target.value)} className="input-field" placeholder="https://…" style={{ flex: 1 }} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => pickInto('faviconUrl')}>Choose from library</button>
            </div>
          </FL>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => handleSave('identity', { siteTitle: form.siteTitle, tagline: form.tagline, logoUrl: form.logoUrl, faviconUrl: form.faviconUrl })}
              disabled={saving === 'identity'}
              className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}
            >
              {saving === 'identity' ? 'Saving…' : 'Save'}
            </button>
            {savedFlash === 'identity' && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            <Icon name="edit" size={17} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Appearance</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Accent colour, fonts and corner style for your public site</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FL label="Accent Colour">
            <ColorSwatchPicker value={form.accentColor} onChange={v => set('accentColor', v)} />
          </FL>
          {/* §10 — design tokens: a bounded, real font/radius picker, not a
              free-text font URL or raw CSS value a tenant could type in. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FL label="Heading Font">
              <Select value={form.headingFont} onValueChange={(v: string) => setToken('headingFont', v as CmsFontId)}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CMS_FONT_IDS.map(id => <SelectItem key={id} value={id}>{CMS_FONT_LABELS[id]}</SelectItem>)}
                </SelectContent>
              </Select>
            </FL>
            <FL label="Body Font">
              <Select value={form.bodyFont} onValueChange={(v: string) => setToken('bodyFont', v as CmsFontId)}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CMS_FONT_IDS.map(id => <SelectItem key={id} value={id}>{CMS_FONT_LABELS[id]}</SelectItem>)}
                </SelectContent>
              </Select>
            </FL>
          </div>
          <FL label="Corner Style">
            <Select value={form.radius} onValueChange={(v: string) => setRadius(v as CmsRadiusPreset)}>
              <SelectTrigger className="input-field" style={{ maxWidth: 180 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {CMS_RADIUS_PRESETS.map(id => <SelectItem key={id} value={id}>{CMS_RADIUS_LABELS[id]}</SelectItem>)}
              </SelectContent>
            </Select>
          </FL>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => handleSave('appearance', { accentColor: form.accentColor, headingFont: form.headingFont, bodyFont: form.bodyFont, radius: form.radius })}
              disabled={saving === 'appearance'}
              className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}
            >
              {saving === 'appearance' ? 'Saving…' : 'Save'}
            </button>
            {savedFlash === 'appearance' && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
