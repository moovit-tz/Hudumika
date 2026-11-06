import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TaneswTrackingEvent, TaneswTrackingResult, TaneswContainerDetail } from '@hudumika/types';
import { apiFetch, apiFetchBlob } from '../lib/api.js';
import { saveBlob } from '../lib/financeDocuments.js';
import { useAuth } from '../hooks/useAuth.js';
import { SectionCard } from './SectionCard.js';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from './ui/date-picker.js';

const eatDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit' });
const dates = { discharge: 'Discharged', terminalExit: 'Left port terminal', carryIn: 'Received at ICD', gateOut: 'Left ICD / pickup facility', returned: 'Empty container returned' };
type DateKey = keyof typeof dates;
type ContainerDates = Record<DateKey, string> & { number: string; size: string; source: string };
type Line = {
  container: string; kind: string; start: string; end: string; freeDays: number | null;
  chargeableDays: number | null; amount: number | null; currency: string; note: string;
};
type CarrierTracking = {
  source: string;
  containers?: Array<{ number: string }>;
  port_calls?: Array<{ port_code: string; events: Array<{ code: string; act?: string }> }>;
};

function localDate(value?: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = Date.parse(value.replace(' ', 'T') + (/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? '' : '+03:00'));
  return Number.isFinite(time) ? eatDate.format(time) : '';
}

function customsDates(events: TaneswTrackingEvent[], facility: string) {
  const transfer = (event: TaneswTrackingEvent) => /^(11|56)$|ICD Transfer/i.test(event.movementType);
  const atFacility = (event: TaneswTrackingEvent) => Boolean(facility && event.locationCode === facility);
  const find = (predicate: (event: TaneswTrackingEvent) => boolean, reportDate = false) => {
    const event = events.find(predicate);
    return localDate(event?.movementAt || (reportDate ? event?.processedAt : ''));
  };
  return {
    discharge: find(event => ['B11', 'B12'].includes(event.code), true),
    terminalExit: find(event => ['C61', 'C62'].includes(event.code) && transfer(event) && !atFacility(event)),
    carryIn: find(event => ['C03', 'C04'].includes(event.code) && atFacility(event)),
    gateOut: find(event => ['C61', 'C62'].includes(event.code) && !transfer(event) && atFacility(event)),
  };
}

export function ConsignmentDemurrage({ initialBill, schedules }: { initialBill: string; schedules: string[] }) {
  const { user } = useAuth();
  const [bill, setBill] = useState(initialBill);
  const [consignment, setConsignment] = useState<TaneswTrackingResult>();
  const [containers, setContainers] = useState<ContainerDates[]>([]);
  const [asOf, setAsOf] = useState(() => eatDate.format(new Date()));
  const [combined, setCombined] = useState(false);
  const [selected, setSelected] = useState({ port: '', icd: '', carrier: '', detention: '' });
  const [report, setReport] = useState<{ key: string; lines: Line[] }>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  let history: string[] = [];
  try {
    const saved: unknown = user && JSON.parse(localStorage.getItem(`hudumika_customs_history:${user.tenant_id}:${user.id}`) ?? '[]');
    if (Array.isArray(saved)) history = saved.filter((value): value is string => typeof value === 'string').slice(0, 8);
  } catch { /* Recent searches are optional. */ }

  async function load(target: string) {
    const number = target.replace(/\s/g, '').toUpperCase();
    if (!number || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setConsignment(undefined);
    setContainers([]);
    setReport(undefined);
    try {
      const body = JSON.stringify({ number, type: 'BL' });
      const [customs, carrier, recorded] = await Promise.allSettled([
        apiFetch<{ result: TaneswTrackingResult | null }>('/v1/tracker/tanzania', { method: 'POST', body }),
        apiFetch<CarrierTracking>('/v1/tracker/track', { method: 'POST', body }),
        apiFetch<{ rows: Array<{ number: string; discharge: string | null; returned: string | null }> }>('/v1/demurrage/recorded-dates?' + new URLSearchParams({ bill: number })),
      ]);
      if (customs.status === 'rejected') throw customs.reason;
      const result = customs.value.result;
      if (!result) throw new Error('TRA found no consignment for this bill of lading.');
      const carrierResult = carrier.status === 'fulfilled' && carrier.value.source === 'live' ? carrier.value : undefined;
      const isSingleMatch = result.containers.length === 1 && carrierResult?.containers?.length === 1 &&
        result.containers[0].number === carrierResult.containers[0].number;
      const portEvents = carrierResult?.port_calls?.find(port => port.port_code === 'TZDAR' || port.port_code === 'TZTGA' || port.port_code === 'TZMYW')?.events;
      const carrierDischarge = localDate(portEvents?.find(event => event.code === 'DISC' && event.act)?.act);
      const carrierReturn = isSingleMatch ? localDate(portEvents?.find(event => event.code === 'EMRT' && event.act)?.act) : '';
      const fromCustoms = customsDates(result.events, result.facilityCode);
      setBill(result.billOfLading);
      setConsignment(result);
      const recordedDates = recorded.status === 'fulfilled' ? recorded.value.rows : [];
      setContainers(result.containers.map(container => {
        const matches = recordedDates.filter(row => row.number === container.number);
        const saved = matches.length === 1 ? matches[0] : undefined;
        return {
          number: container.number, size: container.sizeCode, ...fromCustoms,
          discharge: localDate(saved?.discharge) || carrierDischarge || fromCustoms.discharge,
          returned: localDate(saved?.returned) || carrierReturn,
          source: [
            'TRA bill-level dates (discharge may be the report date)',
            carrierDischarge && 'carrier discharge where available',
            (saved?.discharge || saved?.returned) && 'workspace dates for this bill and container',
          ].filter(Boolean).join(' · '),
        };
      }));
      if (!carrierResult) setNotice('Carrier tracking was unavailable. Review the TRA dates and enter confirmed empty returns where available.');
      else if (!carrierReturn) setNotice('No confirmed container-specific empty return was available from the carrier. Enter it where known.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this consignment.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialBill) void load(initialBill);
    // The URL is the initial lookup. Subsequent lookups are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBill]);

  async function loadContainer(number: string) {
    if (!consignment || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const { result } = await apiFetch<{ result: TaneswContainerDetail | null }>('/v1/tracker/tanzania', {
        method: 'POST', body: JSON.stringify({ number: consignment.billOfLading, container: { cargoReference: consignment.cargoReference, number } }),
      });
      if (!result) throw new Error('TRA found no dates for this container.');
      const found = customsDates(result.events, consignment.facilityCode);
      setContainers(rows => rows.map(row => row.number !== number ? row : {
        ...row,
        ...Object.fromEntries(Object.entries(found).filter(([, value]) => value)),
        source: 'Container-specific TRA dates where available, with bill-level dates retained for gaps',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the container dates.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const payload = JSON.stringify({ bill: consignment?.billOfLading, asOf, combined, schedules: selected, containers });
  const lines = report?.key === payload ? report.lines : undefined;

  async function calculate(format?: 'pdf' | 'csv' | 'xlsx') {
    if (!consignment || !asOf || !containers.length || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const path = '/v1/demurrage/consignment-estimate';
      const options = { method: 'POST', body: payload };
      if (format) {
        const blob = await apiFetchBlob(path + '?format=' + format, options);
        saveBlob(blob, 'demurrage-' + consignment.billOfLading.replace(/[^a-z0-9-]/gi, '-') + '.' + format);
      } else {
        const result = await apiFetch<{ lines: Line[] }>(path, options);
        setReport({ key: payload, lines: result.lines });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare the estimate.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const totals = new Map<string, number>();
  for (const line of lines ?? []) if (line.amount !== null) totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.amount);

  function submit(event: FormEvent) { event.preventDefault(); void load(bill); }

  return (
    <div className="min-w-0 space-y-4">
      <SectionCard title="Load a bill of lading">
        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <label className="grid w-full max-w-md gap-1 text-sm">Bill of lading<Input value={bill} onChange={event => setBill(event.target.value)} disabled={busy} maxLength={64} required /></label>
          <Button disabled={busy || !bill.trim()}>Load tracking dates</Button>
        </form>
        {history.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span>Recent customs searches</span>{history.map(number => <Button key={number} size="sm" variant="outline" disabled={busy} onClick={() => void load(number)}>{number}</Button>)}</div>}
        {busy && <p role="status" className="mt-3 text-sm">Working…</p>}
        {notice && <p className="mt-3 text-sm">{notice}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </SectionCard>
      {consignment && (
        <>
          <SectionCard title="Estimate settings">
            <p className="mb-3 text-sm">{consignment.billOfLading} · {consignment.facility || 'Facility unavailable'} · {containers.length} containers</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="grid gap-1 text-sm"><span>Calculate through (EAT)</span><DatePicker date={parseDateOnly(asOf)} onChange={date => setAsOf(toDateOnlyString(date))} /></div>
              <div className="grid gap-1 text-sm"><span>Carrier charging method</span><Select value={combined ? 'combined' : 'separate'} onValueChange={value => setCombined(value === 'combined')}><SelectTrigger aria-label="Carrier charging method"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="separate">Demurrage to pickup, then detention</SelectItem><SelectItem value="combined">Combined through empty return</SelectItem></SelectContent></Select></div>
              {([['port', 'Port storage'], ['icd', 'ICD storage'], ['carrier', 'Carrier demurrage'], ...(!combined ? [['detention', 'Carrier detention']] : [])] as Array<[keyof typeof selected, string]>).map(([key, label]) => (
                <div key={key} className="grid min-w-0 gap-1 text-sm"><span>{label} rate schedule</span>
                  <Select value={selected[key] || '__none__'} onValueChange={value => setSelected(previous => ({ ...previous, [key]: value === '__none__' ? '' : value }))}>
                    <SelectTrigger aria-label={label + ' rate schedule'}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">No schedule selected</SelectItem>{schedules.map(schedule => <SelectItem key={schedule} value={schedule}>{schedule}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm">Confirm that each schedule matches the facility or carrier contract. Estimates use calendar days, exclude the start day, and stop at the recorded end date when it falls before the selected date.</p>
          </SectionCard>
          <SectionCard title="Review container dates">
            <p className="mb-3 text-sm">Dates initially apply at bill level. Expand a container to check its own TRA dates or enter confirmed dates from your records.</p>
            <Accordion type="single" collapsible className="space-y-2">
              {containers.map(container => <AccordionItem key={container.number} value={container.number}>
                <AccordionTrigger>{container.number} · {container.size || 'Size unavailable'}</AccordionTrigger>
                <AccordionContent>
                  <p className="mb-3 text-sm">{container.source}</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {(Object.keys(dates) as DateKey[]).map(key => <div key={key} className="grid gap-1 text-sm"><span>{dates[key]}</span>
                      <DatePicker date={parseDateOnly(container[key])} onChange={date => setContainers(previous => previous.map(row => row.number === container.number ? { ...row, [key]: toDateOnlyString(date), source: 'Includes manually reviewed dates' } : row))} />
                    </div>)}
                  </div>
                  <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => void loadContainer(container.number)}>Check this container in TRA</Button>
                </AccordionContent>
              </AccordionItem>)}
            </Accordion>
            <Button className="mt-3" disabled={busy || !asOf || !containers.length} onClick={() => void calculate()}>Calculate estimate</Button>
          </SectionCard>
        </>
      )}
      {lines && <SectionCard title="Estimated charges">
        <div className="mb-3 flex flex-wrap gap-2">
          {(['pdf', 'csv', 'xlsx'] as const).map(format => <Button key={format} size="sm" variant="outline" disabled={busy} onClick={() => void calculate(format)}>Download {format === 'xlsx' ? 'Excel' : format.toUpperCase()}</Button>)}
        </div>
        <p className="mb-3 text-sm">{totals.size ? Array.from(totals, ([currency, amount]) => currency + ' ' + amount.toFixed(2)).join(' · ') + ' in priced charges. ' : ''}{lines.filter(line => line.amount === null).length} unpriced items. Estimates do not record payments.</p>
        <div className="space-y-2">
          {lines.map(line => <div className="grid gap-1 rounded-lg border border-(--border) p-3 text-sm sm:grid-cols-3" key={line.container + line.kind}>
            <span className="font-semibold">{line.container} · {line.kind}</span>
            <span>{line.start || 'Start date missing'} → {line.end || '—'}{line.chargeableDays !== null && ' · ' + line.chargeableDays + ' chargeable days'}</span>
            <span>{line.amount === null ? 'Unpriced' : line.currency + ' ' + line.amount.toFixed(2)} · {line.note}</span>
          </div>)}
        </div>
      </SectionCard>}
    </div>
  );
}
