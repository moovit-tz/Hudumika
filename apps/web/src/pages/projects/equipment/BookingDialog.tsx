import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button.js';
import { Textarea } from '../../../components/ui/textarea.js';
import { Combobox } from '../../../components/ui/combobox.js';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../../components/ui/date-picker.js';
import { Badge } from '../../../components/ui/badge.js';
import { apiFetch } from '../../../lib/api.js';
import { showAlert } from '../../../lib/alert.js';
import { errText, fmtDate, todayIso, TYPE_LABEL } from './equipmentShared.js';

/**
 * Request (or, for equipment managers, reserve) an asset for a project. The
 * availability check runs as the dates change, using the same rules the
 * server enforces on submit; the request key makes a double-click or a
 * retried submit return the first booking rather than a second one.
 */
export function BookingDialog({ projectId, assetId, onClose, onBooked }: { projectId?: string; assetId?: string; onClose: () => void; onBooked: () => void }) {
  const [project, setProject] = useState(projectId ?? '');
  const [asset, setAsset] = useState(assetId ?? '');
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); });
  const [notes, setNotes] = useState('');
  const [projects, setProjects] = useState<{ value: string; label: string }[]>([]);
  const [assets, setAssets] = useState<{ value: string; label: string; sublabel?: string }[]>([]);
  const [check, setCheck] = useState<{ ok: boolean; reasons: string[]; conflicts: any[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestKey = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    if (!projectId) apiFetch('/v1/tasks/projects').then((r: any) => setProjects((Array.isArray(r) ? r : r.data ?? []).map((p: any) => ({ value: p.id, label: p.name })))).catch(() => undefined);
    if (!assetId) apiFetch('/v1/project-equipment/assets?pageSize=200&sort=name').then((r: any) => setAssets(r.data.map((a: any) => ({ value: a.id, label: `${a.name} (${a.code})`, sublabel: TYPE_LABEL[a.resource_type] })))).catch(() => undefined);
  }, [projectId, assetId]);

  useEffect(() => {
    if (!asset || end < start) { setCheck(null); return; }
    let live = true;
    setChecking(true);
    const t = setTimeout(() => {
      apiFetch(`/v1/project-equipment/assets/${asset}/availability?start=${start}&end=${end}${project ? `&project_id=${project}` : ''}`)
        .then((r: any) => live && setCheck(r)).catch(e => live && setCheck({ ok: false, reasons: [errText(e)], conflicts: [] }))
        .finally(() => live && setChecking(false));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [asset, start, end, project]);

  async function submit() {
    setBusy(true);
    try {
      const r = await apiFetch(`/v1/project-equipment/projects/${project}/requests`, { method: 'POST', body: JSON.stringify({ resource_id: asset, start_date: start, end_date: end, notes: notes || null, request_key: requestKey }) });
      showAlert(r.status === 'requested' ? 'Request sent to the equipment custodian.' : 'Reserved.', { variant: 'success' });
      onBooked(); onClose();
    } catch (e) { showAlert(errText(e), { variant: 'error' }); }
    finally { setBusy(false); }
  }

  const datesBad = end < start;
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Book equipment</DialogTitle>
          <DialogDescription>Equipment managers reserve straight away; everyone else sends a request to the asset's custodian.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="eq-book" className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); submit(); }}>
            {!projectId && <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Project</span>
              <Combobox options={projects} value={project} onChange={setProject} placeholder="Choose a project" aria-label="Project" /></label>}
            {!assetId && <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Asset</span>
              <Combobox options={assets} value={asset} onChange={setAsset} placeholder="Search the register" aria-label="Asset" /></label>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">From</span><DatePicker date={parseDateOnly(start)} onChange={d => d && setStart(toDateOnlyString(d))} /></label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">To</span><DatePicker date={parseDateOnly(end)} onChange={d => d && setEnd(toDateOnlyString(d))} /></label>
            </div>
            {datesBad && <p className="text-sm" style={{ color: 'var(--red)' }} role="alert">The end date is before the start date.</p>}
            {asset && !datesBad && (
              <div className="flex flex-col gap-2 rounded-[var(--r)] p-3 text-sm" style={{ background: 'var(--surface2, var(--muted))' }} aria-live="polite">
                {checking || !check ? <span style={{ color: 'var(--ink3)' }}>Checking availability…</span>
                  : check.ok ? <span className="flex items-center gap-2"><Badge variant="success">Available</Badge> for these dates</span>
                    : <>
                      <span className="flex items-center gap-2"><Badge variant="warning">Can't be booked</Badge></span>
                      <ul className="list-disc pl-5">{check.reasons.map(r => <li key={r}>{r}</li>)}
                        {check.conflicts.map((c: any) => <li key={c.id}>Booked by {c.project_name ?? 'another project'}, {fmtDate(c.start_date)} – {fmtDate(c.end_date)} ({c.status === 'requested' ? 'requested' : c.status === 'issued' ? 'on site' : 'reserved'})</li>)}</ul>
                    </>}
              </div>
            )}
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Notes for the custodian</span><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Where it's needed, operator, anything special" /></label>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>Back</Button>
          <Button type="submit" form="eq-book" loading={busy} disabled={!project || !asset || datesBad || !check?.ok}>Book</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
