import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { TaneswContainerDetail, TaneswTrackingEvent, TaneswTrackingResult } from '@hudumika/types';
import { csvText } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { Button } from './ui/button.js';
import { ButtonSpinner, Spinner } from './ui/spinner.js';
import { Badge } from './ui/badge.js';
import { Icon, type IconName } from './Icon.js';
import { CarrierLogo } from './container/CarrierLogo.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs.js';
import { Input } from './ui/input.js';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion.js';
import { ListPagination, paginate, useListPagination } from './ui/list-pagination.js';
import { IsometricContainerIllustration } from './container/IsometricContainerIllustration.js';
import { saveBlob } from '../lib/financeDocuments.js';
import './TanzaniaTracking.css';

const TRA_PORTAL_URL = 'https://tanesw.tra.go.tz/cgme/trkng/cgme0910001q?menuId=menu_cgme0711';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Dar_es_Salaam',
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Dar_es_Salaam',
});

const PORT_NAMES: Record<string, string> = {
  CNNSA: 'Nansha (Guangzhou), China',
  CNSHA: 'Shanghai, China',
  CNNGB: 'Ningbo-Zhoushan, China',
  CNYTN: 'Yantian (Shenzhen), China',
  TZDAR: 'Port of Dar es Salaam, Tanzania',
  TZTGA: 'Port of Tanga, Tanzania',
  KEMBA: 'Port of Mombasa, Kenya',
  AEJEA: 'Jebel Ali (Dubai), UAE',
  INBOM: 'Nhava Sheva / Mumbai, India',
  SGSIN: 'Port of Singapore',
  NLRTM: 'Port of Rotterdam, Netherlands',
  ZADUR: 'Port of Durban, South Africa',
};

const FACILITY_NAMES: Record<string, string> = {
  WITZDL046: 'Galco Limited ICD',
  WITZDL001: 'TICTS / Port Terminal 1',
  WITZDL040: 'AMI ICD (Malawi Cargo Centres)',
  WITZDL015: 'TRH ICD (Tanzania Road Haulage)',
  WITZDL008: 'PMM Inland Container Depot',
  WITZDL004: 'MOFED Tanzania ICD',
  WITZDL010: 'DICD (Dar es Salaam ICD)',
  WITZDL022: 'Mocet ICD',
};

const EVENT_METADATA: Record<string, { label: string; desc: string; icon: IconName; category: 'movement' | 'customs' | 'port' }> = {
  C01: { label: 'Carry-In Started', desc: 'Container arrival processing initiated at facility gate', icon: 'truck', category: 'movement' },
  C03: { label: 'Carry-In Report Approved', desc: 'Arrival report verified and approved by customs', icon: 'check', category: 'movement' },
  C04: { label: 'Carry-In Completed', desc: 'Container safely unloaded and placed in facility yard', icon: 'package', category: 'movement' },
  C50: { label: 'Carry-Out Started', desc: 'Exit process initiated for transfer', icon: 'truck', category: 'movement' },
  C51: { label: 'Carry-Out Report Submitted', desc: 'Transfer manifest submitted to customs', icon: 'fileText', category: 'movement' },
  C52: { label: 'Carry-Out Report Approved', desc: 'Transfer exit authorized by customs officer', icon: 'check', category: 'movement' },
  C53: { label: 'Carry-Out Completed', desc: 'Cargo departed originating terminal', icon: 'truck', category: 'movement' },
  C60: { label: 'Gate-Out Confirmation Started', desc: 'Final gate-out verification initiated', icon: 'logOut', category: 'movement' },
  C61: { label: 'Gate-Out Confirmed', desc: 'Consignment cleared gate-out from facility', icon: 'checkCircle', category: 'movement' },
  C62: { label: 'Gate-Out Confirmed', desc: 'Consignment cleared gate-out from facility', icon: 'checkCircle', category: 'movement' },
  D20: { label: 'Vessel Unloading Report Submitted', desc: 'Inward manifest cargo discharge report filed', icon: 'anchor', category: 'port' },
  D21: { label: 'Vessel Unloading Report Approved', desc: 'Port terminal discharge approved by TRA', icon: 'check', category: 'port' },
  F01: { label: 'ICD Transfer Declaration Submitted', desc: 'Inter-terminal transfer declaration registered', icon: 'fileText', category: 'movement' },
  F02: { label: 'ICD Transfer Declaration Approved', desc: 'TRA customs approved transfer to inland dry port', icon: 'check', category: 'movement' },
  F04: { label: 'ICD Transfer Declaration Completed', desc: 'Transfer process officially completed', icon: 'checkCircle', category: 'movement' },
  R05: { label: 'Scanner Report Issued', desc: 'Non-intrusive container scan report published in TANCIS', icon: 'eye', category: 'customs' },
  T04: { label: 'Customs Declaration Released (TANSAD)', desc: 'Customs duties assessed, paid, and clearance release order granted', icon: 'checkCircle', category: 'customs' },
  W01: { label: 'Overstayed cargo released', desc: 'TRA recorded a release for overstayed cargo', icon: 'checkCircle', category: 'customs' },
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  '11': 'ICD Transfer Movement',
  '56': 'ICD Inland Transfer',
  '50': 'Direct Import Clearance',
  '20': 'Transit Cargo Movement',
  '30': 'Warehousing (Bonded)',
};

const PACKAGE_UNIT_LABELS: Record<string, string> = {
  BE: 'Bundles',
  CN: 'Cartons',
  PK: 'Packages',
  CT: 'Cartons',
  BG: 'Bags',
  PL: 'Pallets',
  DR: 'Drums',
  RO: 'Rolls',
};

function eventLabel(event: TaneswTrackingEvent) {
  if (event.status && event.status !== event.code) return EVENT_METADATA[event.code]?.label || event.status;
  return EVENT_METADATA[event.code]?.label || 'TRA recorded an update';
}

function containerSize(code: string) {
  const dimensions: Record<string, { label: string; length: number; height: number }> = {
    '22G1': { label: '20 ft standard', length: 6.058, height: 2.591 },
    '42G1': { label: '40 ft standard', length: 12.192, height: 2.591 },
    '45G1': { label: '40 ft high cube', length: 12.192, height: 2.896 },
  };
  return dimensions[code];
}

function exportConsignment(result: TaneswTrackingResult) {
  const rows: unknown[][] = [
    ['Source', 'TRA TANESW'], ['Checked (EAT)', formatTzDateTime(result.checkedAt)],
    ['Bill of lading', result.billOfLading], ['Master B/L', result.masterBill], ['House B/L', result.houseBill],
    ['Cargo reference', result.cargoReference], ['Carrier', result.carrier], ['Vessel', result.vessel],
    ['Delivery facility', result.facility, result.facilityCode], ['Cargo', result.cargo],
    ['Packages', result.packageCount, result.packageUnit], ['Gross weight (kg)', result.grossWeightKg],
    ['Net weight (kg)', result.netWeightKg], [],
    ['Container', 'Size', 'ISO size code', 'Freight', 'Status', 'Location', 'Seals'],
    ...result.containers.map(container => [container.number, containerSize(container.sizeCode)?.label, container.sizeCode,
      container.freight, container.status, container.location, container.seals.join(', ')]),
    [], ['Event', 'TRA code', 'Processed (EAT)', 'Movement (EAT)', 'Location', 'Reference', 'Declaration'],
    ...result.events.map(event => [eventLabel(event), event.code, formatTzDateTime(event.processedAt),
      formatTzDateTime(event.movementAt), event.location || event.locationCode, event.reference, event.declaration]),
  ];
  saveBlob(new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' }), `customs-${result.billOfLading.replace(/[^a-z0-9-]/gi, '-')}.csv`);
}

function formatTzDateTime(value?: string | null): string {
  if (!value) return '—';
  const clean = value.replace(' ', 'T') + (/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? '' : '+03:00');
  const d = new Date(clean);
  return Number.isFinite(d.getTime()) ? DATE_FORMATTER.format(d) : value;
}

function formatTzDateOnly(value?: string | null): string {
  if (!value) return '—';
  const clean = value.replace(' ', 'T') + (value.includes('+') ? '' : '+03:00');
  const d = new Date(clean);
  return Number.isFinite(d.getTime()) ? SHORT_DATE_FORMATTER.format(d) : value;
}

function resolvePortName(code?: string | null): string {
  if (!code) return '—';
  return PORT_NAMES[code.trim().toUpperCase()] || code;
}

function resolveFacilityName(code?: string | null, name?: string | null): string {
  if (name && name.trim()) return name.trim();
  if (code && FACILITY_NAMES[code.trim().toUpperCase()]) return FACILITY_NAMES[code.trim().toUpperCase()];
  return code || '—';
}

function decodeCargoType(type?: string | null): string {
  if (type === 'IM') return 'Direct Import';
  if (type === 'EX') return 'Export Consignment';
  if (type === 'TR') return 'Transit Cargo';
  return type || 'Import';
}

function decodeBillType(type?: string | null): string {
  if (type === 'S') return 'Original Master B/L (Simple)';
  if (type === 'C') return 'Consolidated (House B/L)';
  return type || 'Original B/L';
}

export function getConsignmentLifecycle(result: TaneswTrackingResult) {
  const events = result.events || [];
  const codes = new Set(events.map(e => e.code));

  const hasGateOut = events.some(event => ['C61', 'C62'].includes(event.code) &&
    event.locationCode && event.locationCode === result.facilityCode &&
    !/^(11|56)$|ICD Transfer/i.test(event.movementType));
  const hasRelease = codes.has('T04') || result.status?.toLowerCase().includes('release');
  const hasScanner = codes.has('R05');
  const hasCarryIn = codes.has('C04') || codes.has('C03');
  const hasDischarge = codes.has('D20') || codes.has('D21') || Boolean(result.arrivalAt);

  let currentStep = 1;
  let statusTitle = 'Manifest Registered';
  let statusSummary = `Inward cargo manifest registered in TANESW. Awaiting vessel arrival and container discharge.`;

  if (hasGateOut) {
    currentStep = 6;
    statusTitle = 'Gated Out of Facility';
    statusSummary = `Consignment has completed all customs and port requirements and gated out from ${result.facility || 'facility'}.`;
  } else if (hasRelease) {
    currentStep = 5;
    statusTitle = 'Customs Released (TANSAD Issued)';
    statusSummary = `Customs duties and statutory clearances are released. Cargo is cleared for final gate-out from ${result.facility || 'facility'}.`;
  } else if (hasScanner) {
    currentStep = 4;
    statusTitle = 'Scanner Inspection Report Filed';
    statusSummary = `Container inspection scan report has been issued in TANCIS. Final assessment and clearance release are in progress.`;
  } else if (hasCarryIn) {
    currentStep = 3;
    statusTitle = `At ICD · ${result.facility || 'Delivery Facility'}`;
    statusSummary = `TRA recorded carry-in at ${result.facility || 'the delivery facility'}.`;
  } else if (hasDischarge) {
    currentStep = 2;
    statusTitle = 'Discharged at Port of Dar es Salaam';
    statusSummary = `Vessel ${result.vessel || ''} arrived. Cargo discharged at terminal and awaiting transfer to ${result.facility || 'ICD'}.`;
  }

  const steps = [
    {
      id: 1,
      name: 'Manifest Lodged',
      completed: true,
      time: result.arrivalAt ? formatTzDateOnly(result.arrivalAt) : 'Registered',
    },
    {
      id: 2,
      name: 'Port Discharge',
      completed: currentStep >= 2,
      time: currentStep >= 2 ? (result.arrivalAt ? formatTzDateOnly(result.arrivalAt) : 'Completed') : 'Pending',
    },
    {
      id: 3,
      name: 'ICD Transfer',
      completed: currentStep >= 3,
      time: currentStep >= 3 ? 'At ICD Yard' : 'Pending',
    },
    {
      id: 4,
      name: 'TANSAD Entry',
      completed: currentStep >= 4,
      time: currentStep >= 4 ? 'Filed / Scanned' : 'In Progress',
    },
    {
      id: 5,
      name: 'Customs Release',
      completed: currentStep >= 5,
      time: currentStep >= 5 ? 'Released' : 'Pending',
    },
    {
      id: 6,
      name: 'Gate-Out',
      completed: currentStep >= 6,
      time: currentStep >= 6 ? 'Departed' : 'Pending',
    },
  ];

  return { currentStep, statusTitle, statusSummary, steps };
}

/* ── Container History Drawer / Card ──────────────────────────────────────── */
function ContainerDetailHistory({
  bill,
  cargoReference,
  containerNumber,
  facilityCode,
}: {
  bill: string;
  cargoReference: string;
  containerNumber: string;
  facilityCode: string;
}) {
  const [detail, setDetail] = useState<TaneswContainerDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function lookup() {
    if (detail) {
      setOpen(!open);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ result: TaneswContainerDetail | null }>('/v1/tracker/tanzania', {
        method: 'POST',
        body: JSON.stringify({ number: bill, container: { cargoReference, number: containerNumber } }),
      });
      setDetail(data.result);
      setOpen(true);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'TRA container lookup failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 text-xs">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={lookup} disabled={loading || !cargoReference} className="h-7 text-xs">
          {loading && <ButtonSpinner />}
          {open ? 'Hide TRA History' : 'Inspect TRA History'}
        </Button>
        {detail && (
          <span className="text-[11px] text-(--teal) font-semibold flex items-center gap-1">
            <Icon name="check" size={12} /> {detail.events.length} events logged
          </span>
        )}
      </div>

      {error && <div className="mt-2 text-xs text-(--red)">{error}</div>}

      {open && detail && (
        <div className="mt-3 p-3 bg-(--bg) border border-(--border) rounded-lg flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-(--ink)">
            <div>Packages: <span className="text-(--ink2) font-normal">{detail.packageCount != null ? `${detail.packageCount} ${detail.packageUnit || ''}` : '—'}</span></div>
            <div>Weight: <span className="text-(--ink2) font-normal">{detail.weightKg != null ? `${detail.weightKg.toLocaleString()} kg` : '—'}</span></div>
          </div>

          {detail.events.filter(event => event.code === 'C03' && event.locationCode === facilityCode && event.movementAt).map((event, index) => (
            <p key={index}>Carry-in approved at the ICD: {formatTzDateTime(event.movementAt)} EAT</p>
          ))}
          <div className="text-[11px] font-bold text-(--ink3) uppercase mt-1">Container Movement Events</div>
          {detail.events.length === 0 ? (
            <div className="text-xs text-(--ink3) italic">No specific container events logged in TANESW.</div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {detail.events.map((ev, i) => {
                return (
                  <div key={i} className="flex flex-wrap gap-x-2 gap-y-1 rounded border border-(--border) bg-(--white) p-2 text-xs">
                    <div className="font-semibold text-(--ink)">{eventLabel(ev)}</div>
                    <div className="text-(--ink3)">{formatTzDateTime(ev.processedAt || ev.movementAt)}</div>
                    {ev.location && <div className="text-(--ink2)">{ev.location}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main TanzaniaTracking Component ──────────────────────────────────────── */
export function TanzaniaTracking({
  result,
  error,
  loading,
}: {
  result?: TaneswTrackingResult | null;
  error?: string;
  loading: boolean;
}) {
  const [containerSearch, setContainerSearch] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [eventFilter, setEventFilter] = useState<'all' | 'movement' | 'customs'>('all');
  const [copiedBl, setCopiedBl] = useState(false);
  const containerPagination = useListPagination(5);
  const eventPagination = useListPagination(10);

  // Copy B/L helper
  const copyBl = (bl: string) => {
    navigator.clipboard?.writeText(bl);
    setCopiedBl(true);
    setTimeout(() => setCopiedBl(false), 2000);
  };

  // Carry-in times
  const carryIns = useMemo(() => {
    if (!result) return [];
    return result.events.filter(e => e.code === 'C04' && e.movementAt && e.locationCode === result.facilityCode);
  }, [result]);

  const latestCarryIn = carryIns.length > 0 ? carryIns[0].movementAt : null;

  // Filtered containers
  const filteredContainers = useMemo(() => {
    if (!result?.containers) return [];
    const q = containerSearch.trim().toUpperCase();
    if (!q) return result.containers;
    return result.containers.filter(c => c.number.toUpperCase().includes(q) || c.sizeCode.includes(q) || c.seals.some(s => s.toUpperCase().includes(q)));
  }, [result?.containers, containerSearch]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (!result?.events) return [];
    let list = result.events;

    if (eventFilter !== 'all') {
      list = list.filter(e => {
        const meta = EVENT_METADATA[e.code];
        if (eventFilter === 'movement') return meta?.category === 'movement' || meta?.category === 'port';
        if (eventFilter === 'customs') return meta?.category === 'customs';
        return true;
      });
    }

    const q = eventSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(e => {
      const meta = EVENT_METADATA[e.code];
      const matchLabel = (meta?.label || '').toLowerCase().includes(q);
      const matchCode = e.code.toLowerCase().includes(q);
      const matchLoc = (e.location || e.locationCode || '').toLowerCase().includes(q);
      const matchRef = (e.reference || e.declaration || '').toLowerCase().includes(q);
      return matchLabel || matchCode || matchLoc || matchRef;
    });
  }, [result?.events, eventFilter, eventSearch]);

  // Loading state
  if (loading) {
    return (
      <div role="status" className="p-6 bg-(--white) border border-(--border) rounded-xl flex flex-col items-center justify-center gap-3 text-center shadow-sm">
        <Spinner size={32} />
        <div className="text-sm font-semibold text-(--ink)">Querying Tanzania Revenue Authority (TANESW)...</div>
        <div className="text-xs text-(--ink3)">Fetching real-time customs declaration status, container yard inventory, and carry-in records.</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 sm:p-6">
        <Icon name="alertTriangle" size={20} color="var(--red, #dc2626)" />
        <div>
          <div className="text-sm font-bold text-red-900">Customs Tracking Error</div>
          <div className="text-xs text-red-700 mt-1">{error}</div>
          <div className="mt-3">
            <Button size="sm" variant="outline" asChild>
              <a href={TRA_PORTAL_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5">
                Open TRA portal <Icon name="externalLink" size={13} />
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Empty search state
  if (result === null) {
    return <p role="status" className="rounded-lg border border-(--border) bg-(--white) p-4 text-sm">TRA found no record for this bill of lading. Check the number and try again.</p>;
  }
  if (!result) {
    return null;
  }

  const lifecycle = getConsignmentLifecycle(result);
  const latestEvent = result.events[0];
  const latestStatus = result.status || (latestEvent && eventLabel(latestEvent));
  const containerPage = paginate(filteredContainers, containerPagination.page, containerPagination.pageSize);
  const eventPage = paginate(filteredEvents, eventPagination.page, eventPagination.pageSize);

  return (
    <div className="tanzania-tracking">
      {/* ── 1. Hero Consignment Card ────────────────────────────────────── */}
      <div className="tanzania-hero-card">
        <div className="tanzania-hero-top">
          <div className="tanzania-hero-id-block">
            <div className="tanzania-hero-icon-wrap">
              <Icon name="package" size={26} />
            </div>
            <div className="tanzania-hero-titles">
              <span className="tanzania-hero-label">Consignment Bill of Lading · Tanzania Customs</span>
              <div className="tanzania-hero-number-row">
                <span className="tanzania-hero-number">{result.billOfLading}</span>
                <button
                  type="button"
                  onClick={() => copyBl(result.billOfLading)}
                  className="tanzania-copy-btn"
                  title="Copy B/L number"
                  data-ui-native-button=""
                >
                  <Icon name={copiedBl ? 'check' : 'copy'} size={12} />
                  <span>{copiedBl ? 'Copied' : 'Copy'}</span>
                </button>
                {result.cargoReference && (
                  <Badge variant="outline" className="font-mono text-[11px]">
                    CRN: {result.cargoReference}
                  </Badge>
                )}
                {result.carrier && (
                  <CarrierLogo carrier={result.carrier} size="xs" variant="badge" />
                )}
              </div>
            </div>
          </div>

          <div className="tanzania-hero-actions">
            <Button size="sm" variant="outline" asChild>
              <Link to={'/cargotracker/demurrage?' + new URLSearchParams({ bl: result.billOfLading })}>Estimate storage & demurrage</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportConsignment(result)}>Download CSV</Button>
            <Button size="sm" variant="outline" asChild>
              <a href={TRA_PORTAL_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5">
                <span>TRA Portal</span>
                <Icon name="externalLink" size={13} />
              </a>
            </Button>
          </div>
        </div>

        {/* Live Status Callout Banner */}
        <div className="tanzania-status-banner">
          <div className="tanzania-status-icon-dot" />
          <div className="tanzania-status-content">
            <div className="tanzania-status-heading">
              {latestStatus || lifecycle.statusTitle}
            </div>
            <p className="tanzania-status-text">
              TRA TANESW · Checked {formatTzDateTime(result.checkedAt)} EAT
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. KPI Metric Strip ─────────────────────────────────────────── */}
      <div className="tanzania-kpi-grid">
        <div className="tanzania-kpi-card">
          <div className="tanzania-kpi-header">
            <span className="tanzania-kpi-label">Containers</span>
            <Icon name="container" size={16} color="var(--teal)" />
          </div>
          <div className="tanzania-kpi-value">
            {result.containers.length} {result.containers.length === 1 ? 'Unit' : 'Units'}
          </div>
          <div className="tanzania-kpi-sub">
            {result.containerCount ? `Total ${result.containerCount} manifested` : 'All units tracked'}
          </div>
        </div>

        <div className="tanzania-kpi-card">
          <div className="tanzania-kpi-header">
            <span className="tanzania-kpi-label">Cargo Weight</span>
            <Icon name="layers" size={16} color="var(--blue, #0284c7)" />
          </div>
          <div className="tanzania-kpi-value">
            {result.grossWeightKg != null ? `${(result.grossWeightKg / 1000).toFixed(1)} MT` : '—'}
          </div>
          <div className="tanzania-kpi-sub">
            {result.netWeightKg != null ? `Net: ${(result.netWeightKg / 1000).toFixed(1)} MT` : 'Gross weight'}
          </div>
        </div>

        <div className="tanzania-kpi-card">
          <div className="tanzania-kpi-header">
            <span className="tanzania-kpi-label">Delivery Facility</span>
            <Icon name="mapPin" size={16} color="var(--amber, #f59e0b)" />
          </div>
          <div className="tanzania-kpi-value">
            {resolveFacilityName(result.facilityCode, result.facility)}
          </div>
          <div className="tanzania-kpi-sub">
            {result.facilityCode ? `Code: ${result.facilityCode}` : 'Inland Depot'}
          </div>
        </div>

        <div className="tanzania-kpi-card">
          <div className="tanzania-kpi-header">
            <span className="tanzania-kpi-label">Packages & Cargo</span>
            <Icon name="package" size={16} color="var(--purple, #9333ea)" />
          </div>
          <div className="tanzania-kpi-value">
            {result.packageCount != null ? result.packageCount.toLocaleString() : '—'} {PACKAGE_UNIT_LABELS[result.packageUnit] || result.packageUnit || 'PK'}
          </div>
          <div className="tanzania-kpi-sub truncate" title={result.cargo || 'General merchandise'}>
            {result.cargo || 'General merchandise'}
          </div>
        </div>
      </div>

      {/* ── 3. Visual Lifecycle Stepper ─────────────────────────────────── */}
      <div className="tanzania-stepper-card">
        <div className="tanzania-stepper-title">Customs Clearance & Movement Milestones</div>
        <div className="tanzania-stepper">
          {lifecycle.steps.map((st) => {
            const isCompleted = st.completed;
            const isActive = lifecycle.currentStep === st.id;
            return (
              <div
                key={st.id}
                className={`tanzania-stepper-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''} ${!isCompleted && !isActive ? 'pending' : ''}`}
              >
                <div className={`tanzania-stepper-line ${isCompleted ? 'completed' : ''}`} />
                <div className="tanzania-stepper-indicator">
                  {isCompleted ? <Icon name="check" size={14} /> : st.id}
                </div>
                <div className="tanzania-stepper-name">{st.name}</div>
                <div className="tanzania-stepper-time">{st.time}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 4. Main Tabbed Content Area ─────────────────────────────────── */}
      <div className="tanzania-tabs-container">
        <Tabs defaultValue="logistics">
          <TabsList wrap aria-label="Customs tracking details" className="tanzania-result-tabs mb-4">
            <TabsTrigger value="logistics">
              <Icon name="ship" size={14} />
              <span className="ds-tabs-trigger-label">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="containers">
              <Icon name="container" size={14} />
              <span className="ds-tabs-trigger-label">Containers ({result.containers.length})</span>
            </TabsTrigger>
            <TabsTrigger value="events">
              <Icon name="activity" size={14} />
              <span className="ds-tabs-trigger-label">Events ({result.events.length})</span>
            </TabsTrigger>
            <TabsTrigger value="tariffs">
              <Icon name="clock" size={14} />
              <span className="ds-tabs-trigger-label">Storage</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Consignment & Logistics Details */}
          <TabsContent value="logistics" className="focus:outline-none">
            <div className="tanzania-details-grid">
              {/* Card 1: Voyage & Marine Transport */}
              <div className="tanzania-detail-card">
                <div className="tanzania-detail-card-header">
                  <Icon name="anchor" size={18} color="var(--teal)" />
                  <span className="tanzania-detail-card-title">Voyage & Shipping Carrier</span>
                </div>
                <dl className="tanzania-detail-list">
                  <div className="tanzania-detail-item">
                    <dt>Vessel Name & Voyage</dt>
                    <dd>{[result.vessel, result.voyage].filter(Boolean).join(' · ') || '—'}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Ocean Carrier</dt>
                    <dd>{result.carrier || '—'}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Shipping Agent Code</dt>
                    <dd>{result.shippingAgentCode || '—'}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Port of Loading (POL)</dt>
                    <dd>{resolvePortName(result.loadingPortCode)}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Port of Discharge (POD)</dt>
                    <dd>{resolvePortName(result.dischargePort || 'TZDAR')}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Vessel Arrival Date</dt>
                    <dd>{formatTzDateTime(result.arrivalAt)}</dd>
                  </div>
                </dl>
              </div>

              {/* Card 2: Facility & Storage Location */}
              <div className="tanzania-detail-card">
                <div className="tanzania-detail-card-header">
                  <Icon name="mapPin" size={18} color="var(--amber, #f59e0b)" />
                  <span className="tanzania-detail-card-title">ICD Facility & Location</span>
                </div>
                <dl className="tanzania-detail-list">
                  <div className="tanzania-detail-item">
                    <dt>Assigned Delivery Facility</dt>
                    <dd>{resolveFacilityName(result.facilityCode, result.facility)}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Facility Location Code</dt>
                    <dd className="font-mono text-xs">{result.facilityCode || '—'}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Confirmed Carry-In Date</dt>
                    <dd>{formatTzDateTime(latestCarryIn)}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Last Reported Location</dt>
                    <dd>{result.lastLocation || '—'}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Stock Yard Location</dt>
                    <dd>{result.stockLocation || 'Yard Storage'}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Forwarding Agent</dt>
                    <dd>{result.forwarder || 'Direct Consignee'}</dd>
                  </div>
                </dl>
              </div>

              {/* Card 3: Cargo & Regulatory Classification */}
              <div className="tanzania-detail-card">
                <div className="tanzania-detail-card-header">
                  <Icon name="fileText" size={18} color="var(--blue, #0284c7)" />
                  <span className="tanzania-detail-card-title">Cargo & Customs Info</span>
                </div>
                <dl className="tanzania-detail-list">
                  <div className="tanzania-detail-item">
                    <dt>Commodity Description</dt>
                    <dd>{result.cargo || '—'}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Cargo Type & Regime</dt>
                    <dd>{decodeCargoType(result.cargoType)}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Bill of Lading Type</dt>
                    <dd>{decodeBillType(result.billType)}</dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Gross / Net Weight</dt>
                    <dd>
                      {result.grossWeightKg != null ? `${result.grossWeightKg.toLocaleString()} kg` : '—'} /{' '}
                      {result.netWeightKg != null ? `${result.netWeightKg.toLocaleString()} kg` : '—'}
                    </dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Declared Packages</dt>
                    <dd>
                      {result.packageCount != null ? result.packageCount.toLocaleString() : '—'}{' '}
                      {PACKAGE_UNIT_LABELS[result.packageUnit] || result.packageUnit || ''}
                    </dd>
                  </div>
                  <div className="tanzania-detail-item">
                    <dt>Customs Control Office</dt>
                    <dd>{result.customsOffice || 'TRA Customs & Excise'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: Containers Hub */}
          <TabsContent value="containers" className="focus:outline-none">
            <div className="tanzania-containers-header">
              <div className="w-full max-w-sm">
                <Input
                  type="text"
                  aria-label="Filter containers"
                  placeholder="Filter container (e.g. MSCU, size, seal)..."
                  value={containerSearch}
                  onChange={e => { setContainerSearch(e.target.value); containerPagination.reset(); }}
                  className="h-9 text-xs"
                />
              </div>
              <div className="text-xs text-(--ink3)">
                Showing {filteredContainers.length} of {result.containers.length} containers
              </div>
            </div>

            {filteredContainers.length === 0 && <p className="p-4 text-sm">No containers match this search.</p>}
            <Accordion type="single" collapsible className="space-y-2">
              {containerPage.visible.map(container => {
                const size = containerSize(container.sizeCode);
                const gateOut = /gate.out/i.test(container.status);
                return (
                  <AccordionItem key={container.number} value={container.number}>
                    <AccordionTrigger className="min-w-0">
                      <span className="tanzania-container-row">
                        <span className="font-mono">{container.number}</span>
                        <span>{size?.label || container.sizeCode || 'Size unavailable'}</span>
                        <CarrierLogo containerNumber={container.number} size="xs" variant="badge" />
                        <span><Badge variant={gateOut ? 'success' : 'outline'}>{gateOut ? 'Gate-out recorded' : container.status || 'Status unavailable'}</Badge></span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="tanzania-row-detail">
                        <div className="min-w-0 space-y-2">
                          <p>Last location: {container.location || 'Not reported'}</p>
                          <p>ISO size code: {container.sizeCode || 'Not reported'}</p>
                          <p>Freight: {container.freight === 'FCL' ? 'Full container load' : container.freight === 'LCL' ? 'Shared container load' : container.freight || 'Not reported'}</p>
                          {container.seals.length > 0 && <p>Seals: {container.seals.join(', ')}</p>}
                          {container.volumeCbm != null && <p>Reported volume: {container.volumeCbm} m³</p>}
                          <Link className="font-semibold text-(--teal) underline" to={'/cargotracker/containers/' + encodeURIComponent(container.number)}>Open container record</Link>
                          <ContainerDetailHistory bill={result.billOfLading} cargoReference={result.cargoReference} containerNumber={container.number} facilityCode={result.facilityCode} />
                        </div>
                        {size && <div className="min-w-0">
                          <IsometricContainerIllustration containerNumber={container.number} isoCode={container.sizeCode} length={size.length} height={size.height} width={2.438} />
                          <p className="text-center text-xs">Illustration based on the reported ISO size</p>
                        </div>}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
            <div className="tanzania-pagination">
              <ListPagination total={containerPage.total} page={containerPage.currentPage} pageSize={containerPagination.pageSize} onPageChange={containerPagination.setPage} onPageSizeChange={containerPagination.setPageSize} pageSizeOptions={[5, 10, 20]} noun="containers" />
            </div>
          </TabsContent>

          {/* TAB 3: Customs & Port Events Audit Trail */}
          <TabsContent value="events" className="focus:outline-none">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={eventFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => { setEventFilter('all'); eventPagination.reset(); }}
                  className="h-8 text-xs"
                >
                  All ({result.events.length})
                </Button>
                <Button
                  size="sm"
                  variant={eventFilter === 'movement' ? 'default' : 'outline'}
                  onClick={() => { setEventFilter('movement'); eventPagination.reset(); }}
                  className="h-8 text-xs"
                >
                  Movement & Transfers
                </Button>
                <Button
                  size="sm"
                  variant={eventFilter === 'customs' ? 'default' : 'outline'}
                  onClick={() => { setEventFilter('customs'); eventPagination.reset(); }}
                  className="h-8 text-xs"
                >
                  Customs & Clearance
                </Button>
              </div>

              <div className="w-full max-w-xs">
                <Input
                  type="text"
                  aria-label="Filter customs events"
                  placeholder="Filter events by code, date, location..."
                  value={eventSearch}
                  onChange={e => { setEventSearch(e.target.value); eventPagination.reset(); }}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {filteredEvents.length === 0 && <p className="p-4 text-sm">No events match this search.</p>}
            <Accordion type="single" collapsible className="space-y-2">
              {eventPage.visible.map((event, index) => {
                const key = String(eventPage.start + index);
                const meta = EVENT_METADATA[event.code];
                return (
                  <AccordionItem key={key} value={key}>
                    <AccordionTrigger className="min-w-0">
                      <span className="tanzania-event-row">
                        <Icon name={meta?.icon || 'activity'} size={16} />
                        <span className="min-w-0">
                          <span className="block">{eventLabel(event)}</span>
                          {event.location && <span className="block text-xs font-normal text-(--ink2)">{event.location}</span>}
                        </span>
                        <span className="text-xs font-normal text-(--ink2)">{formatTzDateTime(event.processedAt || event.movementAt)} EAT</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <dl className="grid gap-2 border-t border-(--border) pt-3 sm:grid-cols-2">
                        {[
                          ['TRA event code', event.code],
                          ['Recorded in TRA', event.processedAt && formatTzDateTime(event.processedAt) + ' EAT'],
                          ['Movement date', event.movementAt && formatTzDateTime(event.movementAt) + ' EAT'],
                          ['Facility', event.location || event.locationCode],
                          ['Movement type', MOVEMENT_TYPE_LABELS[event.movementType] || event.movementType],
                          ['Reference', event.reference],
                          ['Declaration', event.declaration],
                        ].filter(([, value]) => value).map(([label, value]) => (
                          <div key={label}><dt className="font-semibold text-(--ink)">{label}</dt><dd>{value}</dd></div>
                        ))}
                      </dl>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
            <div className="tanzania-pagination">
              <ListPagination total={eventPage.total} page={eventPage.currentPage} pageSize={eventPagination.pageSize} onPageChange={eventPagination.setPage} onPageSizeChange={eventPagination.setPageSize} pageSizeOptions={[10, 20, 50]} noun="events" />
            </div>
          </TabsContent>

          {/* TAB 4: Free Days, Tariffs & Storage Advisory */}
          <TabsContent value="tariffs" className="focus:outline-none">
            <div className="p-6 bg-(--white) border border-(--border) rounded-xl shadow-sm space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                  <Icon name="alertCircle" size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-(--ink)">Inland Container Depot (ICD) Storage & Free Days</h4>
                  <p className="text-xs text-(--ink2) mt-1 leading-relaxed">
                    Confirm the applicable storage allowance and start event with the facility before calculating the last free day.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-(--bg) border border-(--border) rounded-lg">
                  <div className="text-[11px] font-bold text-(--ink3) uppercase">Recorded carry-in</div>
                  <div className="text-sm font-bold text-(--ink) mt-1">{formatTzDateTime(latestCarryIn)}</div>
                  <div className="text-[11px] text-(--ink3) mt-0.5">Recorded at {result.facility || 'Facility'}</div>
                </div>

                <div className="p-3 bg-(--bg) border border-(--border) rounded-lg">
                  <div className="text-[11px] font-bold text-(--ink3) uppercase">Free storage allowance</div>
                  <div className="text-sm font-bold text-(--ink) mt-1">Pending tariff confirmation</div>
                </div>

                <div className="p-3 bg-(--bg) border border-(--border) rounded-lg">
                  <div className="text-[11px] font-bold text-(--ink3) uppercase">Last free day</div>
                  <div className="text-sm font-bold text-(--ink) mt-1">Awaiting facility rule</div>
                </div>
              </div>

            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
