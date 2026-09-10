import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Button } from '../components/ui/button.js';
import { Banner } from '../components/ui/alert.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

// The last piece of NexusHR's M3 (statutory payroll) roadmap: an admin
// screen for the rates the engine already computes against. Contribution
// schemes (social security, health, employer levies) are editable through
// the existing PATCH /v1/payroll/settings/schemes/:id; PAYE tax bands are
// shown read-only — they're seeded per jurisdiction and there's no
// per-tenant band-edit endpoint (deliberately — a wrong bracket is a
// silent mis-tax, not an error).

type Scheme = {
  id: string;
  code: string;
  name: string;
  employee_pct: number | string;
  employer_pct: number | string;
  calc_base: 'BASIC' | 'GROSS' | 'TAXABLE';
  reduces_tax_base: boolean;
  on_payslip: boolean;
  min_employees: number;
  active: boolean;
  effective_from: string;
};

type Band = { seq: number; lowerBound: number; upperBound: number | null; ratePct: number; fixedAmount: number };

const num = (v: number | string) => (typeof v === 'number' ? v : Number(v) || 0);
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const EDITABLE_KEYS = ['employee_pct', 'employer_pct', 'calc_base', 'reduces_tax_base', 'on_payslip', 'min_employees', 'active'] as const;
type EditableKey = typeof EDITABLE_KEYS[number];

export function PayrollSettingsModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [jurisdiction, setJurisdiction] = useState('TZ');
  const [bands, setBands] = useState<{ RESIDENT: Band[]; NON_RESIDENT: Band[] }>({ RESIDENT: [], NON_RESIDENT: [] });
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<Scheme>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [settings, schemeRows] = await Promise.all([
          apiFetch('/v1/payroll/settings'),
          apiFetch('/v1/payroll/settings/schemes'),
        ]);
        if (!alive) return;
        setConfigured(!!settings?.configured);
        setJurisdiction(settings?.jurisdiction ?? 'TZ');
        setBands({
          RESIDENT: settings?.bands?.RESIDENT ?? [],
          NON_RESIDENT: settings?.bands?.NON_RESIDENT ?? [],
        });
        setSchemes(Array.isArray(schemeRows) ? schemeRows : []);
      } catch (e: any) {
        if (alive) showAlert(e?.message || 'Could not load payroll settings');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const value = <K extends keyof Scheme>(s: Scheme, k: K): Scheme[K] =>
    (draft[s.id]?.[k] ?? s[k]) as Scheme[K];

  const dirtyKeys = (s: Scheme): EditableKey[] =>
    EDITABLE_KEYS.filter(k => {
      const d = draft[s.id]?.[k];
      if (d === undefined) return false;
      return String(d) !== String(s[k]);
    });

  function set<K extends EditableKey>(id: string, k: K, v: Scheme[K]) {
    setDraft(prev => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  }

  async function save(s: Scheme) {
    const keys = dirtyKeys(s);
    if (keys.length === 0) return;
    const body: Record<string, unknown> = {};
    for (const k of keys) {
      const v = draft[s.id]![k];
      body[k] = (k === 'employee_pct' || k === 'employer_pct' || k === 'min_employees') ? num(v as any) : v;
    }
    setSavingId(s.id);
    try {
      const updated = await apiFetch(`/v1/payroll/settings/schemes/${s.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setSchemes(prev => prev.map(x => (x.id === s.id ? { ...x, ...updated } : x)));
      setDraft(prev => { const n = { ...prev }; delete n[s.id]; return n; });
    } catch (e: any) {
      showAlert(e?.message || 'Save failed');
    } finally {
      setSavingId(null);
    }
  }

  const totalEmployerCost = useMemo(
    () => schemes.filter(s => value(s, 'active')).reduce((a, s) => a + num(value(s, 'employer_pct')), 0),
    [schemes, draft],
  );

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent hideClose className="max-w-140 max-h-[88vh] overflow-y-auto gap-0" style={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <DialogTitle style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Statutory rates</DialogTitle>
            <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '4px 0 0', maxWidth: 460 }}>
              The PAYE brackets and contribution schemes the payroll engine calculates against for <strong>{jurisdiction}</strong>. Changes apply to the next calculation.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '32px 0' }}><SectionLoading /></div>
        ) : !configured ? (
          <div style={{ marginTop: 16 }}>
            <Banner variant="warning">
              This workspace has no statutory rates configured, so payroll can't compute PAYE or contributions. The {jurisdiction} statutory set is seeded from a migration — if it's missing, run <code>db:migrate</code> or seed it before the first payroll run.
            </Banner>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 16 }}>

            {/* ── Contribution schemes (editable) ─────────────────────────── */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <h3 style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.05em', margin: 0 }}>Contribution &amp; levy schemes</h3>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Employer cost ≈ {totalEmployerCost.toFixed(2)}% of base</span>
              </div>

              {schemes.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', fontStyle: 'italic' }}>No contribution schemes for {jurisdiction}.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {schemes.map(s => {
                    const dirty = dirtyKeys(s).length > 0;
                    return (
                      <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, background: value(s, 'active') ? 'var(--white)' : 'var(--bg)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{s.name}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>{s.code}</span>
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!value(s, 'active')} onChange={e => set(s.id, 'active', e.target.checked)} />
                            Active
                          </label>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                          <Field label="Employee %">
                            <input type="number" step="0.0001" min={0} max={100} className="input-field"
                              value={String(value(s, 'employee_pct'))}
                              onChange={e => set(s.id, 'employee_pct', e.target.value as any)} />
                          </Field>
                          <Field label="Employer %">
                            <input type="number" step="0.0001" min={0} max={100} className="input-field"
                              value={String(value(s, 'employer_pct'))}
                              onChange={e => set(s.id, 'employer_pct', e.target.value as any)} />
                          </Field>
                          <Field label="Applied to">
                            <Select value={value(s, 'calc_base')} onValueChange={v => set(s.id, 'calc_base', v as Scheme['calc_base'])}>
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="BASIC">Basic pay</SelectItem>
                                <SelectItem value="GROSS">Gross pay</SelectItem>
                                <SelectItem value="TAXABLE">Taxable pay</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Min. employees">
                            <input type="number" step="1" min={0} className="input-field"
                              value={String(value(s, 'min_employees'))}
                              onChange={e => set(s.id, 'min_employees', e.target.value as any)} />
                          </Field>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!value(s, 'reduces_tax_base')} onChange={e => set(s.id, 'reduces_tax_base', e.target.checked)} />
                            Reduces the income-tax base <span style={{ color: 'var(--ink3)' }}>(approved retirement fund)</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!value(s, 'on_payslip')} onChange={e => set(s.id, 'on_payslip', e.target.checked)} />
                            Show on payslip
                          </label>
                        </div>

                        {dirty && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                            <Button variant="secondary" size="sm" onClick={() => setDraft(p => { const n = { ...p }; delete n[s.id]; return n; })} disabled={savingId === s.id}>
                              Discard
                            </Button>
                            <Button size="sm" onClick={() => save(s)} disabled={savingId === s.id}>
                              {savingId === s.id ? 'Saving…' : 'Save'}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── PAYE tax bands (read-only) ──────────────────────────────── */}
            <section>
              <h3 style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 4px' }}>PAYE tax bands</h3>
              <p style={{ fontSize: 11.5, color: 'var(--ink3)', margin: '0 0 10px' }}>
                In force for {jurisdiction}. Seeded per jurisdiction and not tenant-editable — a wrong bracket is a silent mis-tax, so band changes go through a reviewed migration.
              </p>
              {(['RESIDENT', 'NON_RESIDENT'] as const).map(res => (
                <div key={res} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>{res === 'RESIDENT' ? 'Resident' : 'Non-resident'}</div>
                  {bands[res].length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', margin: 0 }}>No bands configured.</p>
                  ) : (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)', color: 'var(--ink3)', textAlign: 'left' }}>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>From</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700 }}>To</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700, textAlign: 'right' }}>Rate</th>
                            <th style={{ padding: '6px 10px', fontWeight: 700, textAlign: 'right' }}>+ Fixed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bands[res].map(b => (
                            <tr key={b.seq} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 10px' }}>{money(b.lowerBound)}</td>
                              <td style={{ padding: '6px 10px' }}>{b.upperBound === null ? 'and above' : money(b.upperBound)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{num(b.ratePct)}%</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{b.fixedAmount ? money(b.fixedAmount) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>{label}</span>
      {children}
    </label>
  );
}
