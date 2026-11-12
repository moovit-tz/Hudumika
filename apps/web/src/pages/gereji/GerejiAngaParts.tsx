import React, { useCallback, useEffect, useState } from 'react';
import { TH, TD, LABEL } from './shared.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { CheckboxRow } from '../../components/ui/list-item-row.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';

interface Part {
  id: string; pn: string; description: string | null; manufacturer: string | null; ata_chapter: string | null;
  rotable: boolean; hazmat_class: string | null; export_controlled: boolean; prohibited: boolean; certificate_required: boolean;
}


export function GerejiAngaParts() {
  const [rows, setRows] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pn, setPn] = useState('');
  const [description, setDescription] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [ataChapter, setAtaChapter] = useState('');
  const [rotable, setRotable] = useState(false);
  const [exportControlled, setExportControlled] = useState(false);
  const [certificateRequired, setCertificateRequired] = useState(false);

  const reload = useCallback((query?: string) => {
    setLoading(true);
    apiFetch(`/v1/gereji/anga/parts${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(d => setRows(d.parts ?? [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function resetForm() { setPn(''); setDescription(''); setManufacturer(''); setAtaChapter(''); setRotable(false); setExportControlled(false); setCertificateRequired(false); }

  async function create() {
    if (!pn.trim()) { showAlert('Enter a part number.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/anga/parts', {
        method: 'POST',
        body: JSON.stringify({
          pn: pn.trim(), description: description.trim() || undefined, manufacturer: manufacturer.trim() || undefined,
          ata_chapter: ataChapter.trim() || undefined, rotable, export_controlled: exportControlled, certificate_required: certificateRequired,
        }),
      });
      setOpen(false);
      resetForm();
      reload(q);
    } catch (e: any) { showAlert(e.message || 'Failed to create part.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'ANGA PartsOS']}
        titlePlain="Parts"
        titleEm="catalogue"
        subtitle="Aviation spare parts — part numbers, certification requirements and alternates."
        actions={<Button onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New Part</Button>}
      />

      <SearchToolbar search={q} onSearch={v => { setQ(v); reload(v); }} placeholder="Search part number or description..." activeFilterCount={0} />

      {loading ? <SectionLoading /> : (
        <SectionCard>
          {rows.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No parts in the catalogue yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['PN', 'Description', 'Manufacturer', 'ATA', 'Flags'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...TD, fontWeight: 600, fontFamily: 'var(--font)' }}>{p.pn}</td>
                      <td style={TD}>{p.description ?? '—'}</td>
                      <td style={{ ...TD, color: 'var(--ink3)' }}>{p.manufacturer ?? '—'}</td>
                      <td style={{ ...TD, color: 'var(--ink3)' }}>{p.ata_chapter ?? '—'}</td>
                      <td style={TD}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {p.rotable && <Badge variant="brand">rotable</Badge>}
                          {p.certificate_required && <Badge variant="warning">cert required</Badge>}
                          {p.export_controlled && <Badge variant="error">export controlled</Badge>}
                          {p.prohibited && <Badge variant="error">prohibited</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New part</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LABEL}>Part number</label><Input value={pn} onChange={e => setPn(e.target.value)} placeholder="e.g. ABC-123" /></div>
              <div><label style={LABEL}>Description</label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={LABEL}>Manufacturer</label><Input value={manufacturer} onChange={e => setManufacturer(e.target.value)} /></div>
                <div><label style={LABEL}>ATA chapter</label><Input value={ataChapter} onChange={e => setAtaChapter(e.target.value)} /></div>
              </div>
              <CheckboxRow title="Rotable (life-limited, tracked by TSN/CSN)" checked={rotable} onCheckedChange={setRotable} />
              <CheckboxRow title="Export controlled" checked={exportControlled} onCheckedChange={setExportControlled} />
              <CheckboxRow title="Requires a certificate to ship" checked={certificateRequired} onCheckedChange={setCertificateRequired} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={saving} loadingText="Creating…">Create part</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
