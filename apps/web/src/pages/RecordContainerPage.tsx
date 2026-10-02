import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker } from '../components/ui/date-picker.js';
import { ButtonSpinner } from '../components/ui/spinner.js';
import { getContainerDetails, SAMPLE_CONTAINER_MSCU } from '../components/container/containerData.js';
import { getContainerColor } from '../components/container/containerColors.js';
import { IsometricContainerIllustration } from '../components/container/IsometricContainerIllustration.js';
import { CarrierSelect } from '../components/container/CarrierSelect.js';
import { CarrierLogo } from '../components/container/CarrierLogo.js';
import { detectShippingLine, ShippingLine } from '../components/container/shippingLines.js';
import type { ContainerDetails, ContainerOwnership, ContainerCondition } from '../components/container/containerTypes.js';
import { validateContainerNumber } from '@hudumika/types';
import { showAlert } from '../lib/alert.js';
import { apiFetch } from '../lib/api.js';

// ISO Code Standard Technical Specs Reference
const ISO_TECHNICAL_SPECS: Record<
  string,
  {
    desc: string;
    len_m: number;
    ht_m: number;
    wd_m: number;
    tare_kg: number;
    max_gross_kg: number;
    payload_kg: number;
    cbm: number;
    isReefer?: boolean;
  }
> = {
  '20G1': {
    desc: '20ft General Purpose Dry',
    len_m: 6.06,
    ht_m: 2.59,
    wd_m: 2.44,
    tare_kg: 2230,
    max_gross_kg: 30480,
    payload_kg: 28250,
    cbm: 33.2,
  },
  '40GP': {
    desc: '40ft General Purpose Dry',
    len_m: 12.19,
    ht_m: 2.59,
    wd_m: 2.44,
    tare_kg: 3750,
    max_gross_kg: 32500,
    payload_kg: 28750,
    cbm: 67.7,
  },
  '40HC': {
    desc: '40ft High Cube Dry',
    len_m: 12.19,
    ht_m: 2.89,
    wd_m: 2.44,
    tare_kg: 3900,
    max_gross_kg: 32500,
    payload_kg: 28600,
    cbm: 76.4,
  },
  '45G1': {
    desc: '45ft High Cube Dry',
    len_m: 13.72,
    ht_m: 2.89,
    wd_m: 2.44,
    tare_kg: 4800,
    max_gross_kg: 34000,
    payload_kg: 29200,
    cbm: 86.0,
  },
  '20RF': {
    desc: '20ft Refrigerated Reefer',
    len_m: 6.06,
    ht_m: 2.59,
    wd_m: 2.44,
    tare_kg: 2980,
    max_gross_kg: 30480,
    payload_kg: 27500,
    cbm: 28.3,
    isReefer: true,
  },
  '40RF': {
    desc: '40ft Refrigerated Reefer',
    len_m: 12.19,
    ht_m: 2.89,
    wd_m: 2.44,
    tare_kg: 4600,
    max_gross_kg: 34000,
    payload_kg: 29400,
    cbm: 59.3,
    isReefer: true,
  },
  '20OT': {
    desc: '20ft Open Top Container',
    len_m: 6.06,
    ht_m: 2.59,
    wd_m: 2.44,
    tare_kg: 2350,
    max_gross_kg: 30480,
    payload_kg: 28130,
    cbm: 32.5,
  },
  '40OT': {
    desc: '40ft Open Top Container',
    len_m: 12.19,
    ht_m: 2.59,
    wd_m: 2.44,
    tare_kg: 3950,
    max_gross_kg: 32500,
    payload_kg: 28550,
    cbm: 66.5,
  },
  '20FR': {
    desc: '20ft Flat Rack Container',
    len_m: 6.06,
    ht_m: 2.59,
    wd_m: 2.44,
    tare_kg: 2750,
    max_gross_kg: 31000,
    payload_kg: 28250,
    cbm: 27.9,
  },
  '40FR': {
    desc: '40ft Flat Rack Container',
    len_m: 12.19,
    ht_m: 2.59,
    wd_m: 2.44,
    tare_kg: 5200,
    max_gross_kg: 45000,
    payload_kg: 39800,
    cbm: 54.8,
  },
  '20TK': {
    desc: '20ft ISO Tank Container',
    len_m: 6.06,
    ht_m: 2.59,
    wd_m: 2.44,
    tare_kg: 3600,
    max_gross_kg: 36000,
    payload_kg: 32400,
    cbm: 26.0,
  },
};

function parseDateStr(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function formatDate(d?: Date): string {
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const RecordContainerPage: React.FC = () => {
  const { number } = useParams<{ number?: string }>();
  const navigate = useNavigate();

  const isEdit = !!number;
  const [formData, setFormData] = useState<ContainerDetails>(() => ({
    ...SAMPLE_CONTAINER_MSCU,
    container_number: '',
    carrier: '',
    iso_code: '20G1',
    size_type: '20ft General Purpose Dry',
    ownership: 'CARRIER_OWNED' as ContainerOwnership,
    condition: 'EXCELLENT' as ContainerCondition,
    dimensions: { len_m: 6.06, ht_m: 2.59, wd_m: 2.44, height_m: 2.59, width_m: 2.44, length_m: 6.06 } as any,
    tare_weight_kg: 2230,
    max_gross_weight_kg: 30480,
    payload_capacity_kg: 28250,
    cubic_capacity_cbm: 33.2,
    floor_type: 'Apitong 28mm Plywood',
    manufacturer: 'CIMC Container Logistics',
    manufacture_year: new Date().getFullYear(),
    design_validity_years: 10,
    compliance: {
      csc_cert_date: '10 Jan 2026',
      csc_expiry_date: '10 Jan 2031',
      acep_ccep: 'ACEP/CH/2026/889',
      customs_seal_no: 'SEAL-779812',
    },
    current_depot: {
      name: 'Mombasa Port Terminal (KEMBA)',
      code: 'KEMBA-01',
      date: '28 Sep 2026',
      state: 'Empty',
    },
  }));

  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load existing container for editing
  useEffect(() => {
    if (number) {
      apiFetch(`/v1/tracker/containers/${number}`)
        .then((data: any) => {
          if (data && data.container_number) setFormData(data);
          else setFormData(getContainerDetails(number));
        })
        .catch(() => setFormData(getContainerDetails(number)));
    }
  }, [number]);

  // Detected shipping line from typed container number or carrier selection
  const identifiedCarrier = detectShippingLine(formData.container_number || formData.carrier);
  const containerPalette = getContainerColor(formData.container_number, formData.carrier);

  // 1. Handle typing container number — instantly identifies shipping line, color, logo, and dimensions
  const handleContainerNumChange = (val: string) => {
    const cleanNum = val.toUpperCase().replace(/\s/g, '');
    const detected = detectShippingLine(cleanNum);

    setFormData((prev) => ({
      ...prev,
      container_number: cleanNum,
      carrier: detected ? detected.shortName : prev.carrier,
    }));

    // ISO 6346 Check Digit Validation
    if (cleanNum.length >= 4) {
      const v = validateContainerNumber(cleanNum);
      if (!v.valid && cleanNum.length >= 10) {
        setValidationError(v.reason || `Calculated check digit is ${v.expectedCheckDigit}`);
      } else {
        setValidationError(null);
      }
    } else {
      setValidationError(null);
    }
  };

  // 2. Handle Carrier selection
  const handleCarrierChange = (carrierName: string, _line?: ShippingLine | null) => {
    setFormData((prev) => ({ ...prev, carrier: carrierName }));
  };

  // 3. Handle ISO Code selection — automatically calculates physical dimensions, weights, and volume
  const handleIsoChange = (code: string) => {
    const spec = ISO_TECHNICAL_SPECS[code] || ISO_TECHNICAL_SPECS['20G1'];
    setFormData((prev) => ({
      ...prev,
      iso_code: code,
      size_type: spec.desc,
      dimensions: {
        height_m: spec.ht_m,
        width_m: spec.wd_m,
        length_m: spec.len_m,
      },
      tare_weight_kg: spec.tare_kg,
      max_gross_weight_kg: spec.max_gross_kg,
      payload_capacity_kg: spec.payload_kg,
      cubic_capacity_cbm: spec.cbm,
    }));
  };

  // Handle Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.container_number?.trim()) {
      setValidationError('Container number is required');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/v1/tracker/containers', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          color_hex: containerPalette.primary,
        }),
      }).catch(() => {});

      showAlert(`Container ${formData.container_number} recorded successfully.`);
      navigate(`/cargotracker/containers/${formData.container_number}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to save container specifications.');
    } finally {
      setSaving(false);
    }
  };

  const isIdentified = !!(formData.container_number?.trim() || formData.carrier?.trim());

  return (
    <div className="p-4 sm:p-7 max-w-6xl mx-auto space-y-6">
      <PageHeader
        crumbs={['Cargo Tracker', 'Containers', isEdit ? `Edit ${number}` : 'Record New']}
        titlePlain={isEdit ? 'Edit' : 'Record New'}
        titleEm="Container"
        subtitle="Configure container specifications, ISO classification, CSC safety compliance, and live 3D shipping line model."
        actions={
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => navigate(isEdit ? `/cargotracker/containers/${number}` : '/cargotracker/track')}
          >
            <Icon name="back" size={13} />
            Cancel
          </Button>
        }
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* ── 3D Live Container Mockup ──────────────────────────────────────── */}
        <div className="p-5 sm:p-6 bg-(--white) border border-(--border) rounded-2xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 items-stretch">

            {/* Left — 3D Isometric Illustration */}
            <div className="lg:col-span-7 flex justify-center items-center py-4 lg:py-2 min-h-[200px] sm:min-h-[240px]">
              <IsometricContainerIllustration
                containerNumber={formData.container_number}
                isoCode={formData.iso_code || '20G1'}
                carrierName={formData.carrier}
                height={formData.dimensions?.height_m || 2.59}
                width={formData.dimensions?.width_m || 2.44}
                length={formData.dimensions?.length_m || 6.06}
                showDimensions={true}
              />
            </div>

            {/* Right — Identity panel */}
            <div className="lg:col-span-5 flex flex-col justify-center gap-3 border-t lg:border-t-0 lg:border-l border-(--border) pt-5 lg:pt-0 lg:pl-6">

              {/* Label + Title */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-(--ink3) mb-0.5">
                  3D Live Model Preview
                </p>
                <h3 className="text-[15px] font-black text-(--ink) leading-tight">
                  {isIdentified && identifiedCarrier
                    ? `${identifiedCarrier.shortName} Container`
                    : 'Unbranded Container Mockup'}
                </h3>
              </div>

              {/* Identified carrier card  OR  empty-state hint */}
              {isIdentified && identifiedCarrier ? (
                <div className="p-3 rounded-xl bg-(--teal-l) border border-(--teal-m) space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <CarrierLogo carrier={identifiedCarrier} size="sm" variant="badge" />
                    {identifiedCarrier.rank && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[var(--gold-l)] text-[var(--gold)] border border-[var(--gold)]/30 shrink-0">
                        #{identifiedCarrier.rank} Global
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-(--ink2)">
                    <span>Paint: <strong className="text-(--ink)">{containerPalette.name}</strong></span>
                    <span className="font-mono text-[10px] text-(--ink3)">{containerPalette.primary}</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-(--bg) border border-(--border) space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-(--ink2)">
                    <Icon name="info" size={12} color="var(--teal)" />
                    Clean Unbranded Mockup
                  </div>
                  <p className="text-[11px] text-(--ink3) leading-relaxed">
                    Type a number (<span className="font-mono font-bold text-(--ink)">MSCU…</span> <span className="font-mono font-bold text-(--ink)">MAEU…</span> <span className="font-mono font-bold text-(--ink)">ONEY…</span>) or pick a carrier below to paint the 3D model.
                  </p>
                </div>
              )}

              {/* Live dimension chips */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: 'Length',
                    value: `${formData.dimensions?.length_m ?? 6.06}m`,
                    sub: (formData.dimensions?.length_m ?? 6.06) > 10
                      ? ((formData.dimensions?.length_m ?? 6.06) > 13 ? '45 ft' : '40 ft')
                      : '20 ft',
                  },
                  {
                    label: 'Height',
                    value: `${formData.dimensions?.height_m ?? 2.59}m`,
                    sub: (formData.dimensions?.height_m ?? 2.59) > 2.7 ? '9\'6″ HC' : '8\'6″ STD',
                  },
                  {
                    label: 'Volume',
                    value: `${formData.cubic_capacity_cbm ?? 33.2}m³`,
                    sub: 'Capacity',
                  },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="p-2 rounded-lg bg-(--bg) border border-(--border) text-center">
                    <p className="text-[10px] font-bold text-(--ink3) uppercase tracking-wide leading-none mb-1">{label}</p>
                    <p className="text-[12px] font-black text-(--ink) font-mono leading-none">{value}</p>
                    <p className="text-[9px] text-(--ink3) mt-0.5 leading-none">{sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════
            2. SECOND AREA: FORM INPUTS — IDENTIFY CARRIER, TYPE, SIZE & SPECS
            ═════════════════════════════════════════════════════════════════════ */}

        {/* Section 1: Identification & Shipping Line */}
        <SectionCard title="1. Identification, Shipping Line &amp; Classification">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

            {/* Container Number — drives auto-detection of carrier + 3D paint */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-(--ink2) block">
                Container Number (ISO 6346) <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.container_number}
                onChange={(e) => handleContainerNumChange(e.target.value)}
                placeholder="e.g. MSCU1234567"
                className="font-mono font-bold tracking-wider"
                required
              />
              {validationError ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">{validationError}</p>
              ) : (
                <p className="text-[10px] text-(--ink3)">BIC prefix auto-identifies carrier &amp; paints 3D model</p>
              )}
            </div>

            {/* Carrier / Shipping Line picker */}
            <div>
              <CarrierSelect
                label="Shipping Line / Carrier"
                containerNumber={formData.container_number}
                value={formData.carrier}
                onChange={handleCarrierChange}
              />
            </div>

            {/* ISO code + auto-fills dimensions, weights, volume */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-(--ink2) block">ISO Code &amp; Type</label>
              <Select value={formData.iso_code} onValueChange={handleIsoChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ISO_TECHNICAL_SPECS).map(([code, spec]) => (
                    <SelectItem key={code} value={code}>
                      <span className="font-mono font-bold mr-1">{code}</span>
                      <span className="text-(--ink3)">— {spec.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-(--ink3)">Selecting updates weights &amp; dimensions automatically</p>
            </div>

            {/* Ownership */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-(--ink2) block">Ownership</label>
              <Select
                value={formData.ownership}
                onValueChange={(val) => setFormData((prev) => ({ ...prev, ownership: val as ContainerOwnership }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CARRIER_OWNED">Carrier Owned (COC)</SelectItem>
                  <SelectItem value="PRIVATELY_OWNED">Shipper Owned (SOC)</SelectItem>
                  <SelectItem value="LEASED">Leased Fleet Equipment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>

        {/* Section 2: Technical Ratings, Weights & Dimensions */}
        <SectionCard title="2. Technical Ratings, Weights &amp; Dimensions">
          <div className="space-y-5">

            {/* Sub-row A — Weights & Capacity (auto-filled from ISO code) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: 'Max Gross Weight (kg)',
                  field: 'max_gross_weight_kg' as const,
                  step: '1',
                  value: formData.max_gross_weight_kg,
                  setter: (v: number) => setFormData((p) => ({ ...p, max_gross_weight_kg: v })),
                },
                {
                  label: 'Tare Weight (kg)',
                  field: 'tare_weight_kg' as const,
                  step: '1',
                  value: formData.tare_weight_kg,
                  setter: (v: number) => setFormData((p) => ({ ...p, tare_weight_kg: v })),
                },
                {
                  label: 'Payload Capacity (kg)',
                  field: 'payload_capacity_kg' as const,
                  step: '1',
                  value: formData.payload_capacity_kg,
                  setter: (v: number) => setFormData((p) => ({ ...p, payload_capacity_kg: v })),
                },
                {
                  label: 'Cubic Capacity (m³)',
                  field: 'cubic_capacity_cbm' as const,
                  step: '0.1',
                  value: formData.cubic_capacity_cbm,
                  setter: (v: number) => setFormData((p) => ({ ...p, cubic_capacity_cbm: v })),
                },
              ].map(({ label, field, step, value, setter }) => (
                <div key={field} className="space-y-1.5">
                  <label className="text-xs font-bold text-(--ink2) block">{label}</label>
                  <Input
                    type="number"
                    step={step}
                    value={value || ''}
                    onChange={(e) => setter(parseFloat(e.target.value) || 0)}
                    className="font-mono text-xs"
                  />
                </div>
              ))}
            </div>

            {/* Sub-row B — Physical Dimensions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-(--ink2) block">Length (m)</label>
                <Input
                  type="number" step="0.01"
                  value={formData.dimensions?.length_m ?? 6.06}
                  onChange={(e) => setFormData((p) => ({
                    ...p, dimensions: { ...p.dimensions, length_m: parseFloat(e.target.value) || 6.06 },
                  }))}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-(--ink2) block">Height (m)</label>
                <Input
                  type="number" step="0.01"
                  value={formData.dimensions?.height_m ?? 2.59}
                  onChange={(e) => setFormData((p) => ({
                    ...p, dimensions: { ...p.dimensions, height_m: parseFloat(e.target.value) || 2.59 },
                  }))}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-(--ink2) block">Width (m)</label>
                <Input
                  type="number" step="0.01"
                  value={formData.dimensions?.width_m ?? 2.44}
                  onChange={(e) => setFormData((p) => ({
                    ...p, dimensions: { ...p.dimensions, width_m: parseFloat(e.target.value) || 2.44 },
                  }))}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-(--ink2) block">Floor Type</label>
                <Input
                  value={formData.floor_type || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, floor_type: e.target.value }))}
                  placeholder="e.g. Apitong Plywood"
                  className="text-xs"
                />
              </div>
            </div>

            {/* Sub-row C — Build info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-(--ink2) block">Manufacturer</label>
                <Input
                  value={formData.manufacturer || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, manufacturer: e.target.value }))}
                  placeholder="e.g. CIMC, Singamas"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-(--ink2) block">Manufacture Year</label>
                <Input
                  type="number"
                  value={formData.manufacture_year || new Date().getFullYear()}
                  onChange={(e) => setFormData((p) => ({ ...p, manufacture_year: parseInt(e.target.value, 10) || 2026 }))}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-(--ink2) block">Design Validity (Years)</label>
                <Input
                  type="number"
                  value={formData.design_validity_years || 10}
                  onChange={(e) => setFormData((p) => ({ ...p, design_validity_years: parseInt(e.target.value, 10) || 10 }))}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-(--ink2) block">Physical Condition</label>
                <Select
                  value={formData.condition}
                  onValueChange={(val) => setFormData((p) => ({ ...p, condition: val as ContainerCondition }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXCELLENT">Grade A — Excellent</SelectItem>
                    <SelectItem value="GOOD">Grade B — Good</SelectItem>
                    <SelectItem value="FAIR">Grade C — Fair / WWT</SelectItem>
                    <SelectItem value="DAMAGED">Grade D — Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Section 3: Compliance, CSC Safety Plate & Depot Storage */}
        <SectionCard title="3. Compliance, CSC Plate &amp; Depot Storage">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-(--ink2) block">CSC Cert Date</label>
              <DatePicker
                date={parseDateStr(formData.compliance?.csc_cert_date)}
                onChange={(d) => setFormData((p) => ({ ...p, compliance: { ...p.compliance, csc_cert_date: formatDate(d) } }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-(--ink2) block">CSC Expiry Date</label>
              <DatePicker
                date={parseDateStr(formData.compliance?.csc_expiry_date)}
                onChange={(d) => setFormData((p) => ({ ...p, compliance: { ...p.compliance, csc_expiry_date: formatDate(d) } }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-(--ink2) block">ACEP / CCEP Number</label>
              <Input
                value={formData.compliance?.acep_ccep || ''}
                onChange={(e) => setFormData((p) => ({ ...p, compliance: { ...p.compliance, acep_ccep: e.target.value } }))}
                placeholder="e.g. ACEP/CH/2026/889"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-(--ink2) block">Customs Bolt Seal No.</label>
              <Input
                value={formData.compliance?.customs_seal_no || ''}
                onChange={(e) => setFormData((p) => ({ ...p, compliance: { ...p.compliance, customs_seal_no: e.target.value } }))}
                placeholder="e.g. SEAL-889123"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-(--ink2) block">Current Depot &amp; Terminal</label>
              <Input
                value={formData.current_depot?.name || ''}
                onChange={(e) => setFormData((p) => ({ ...p, current_depot: { ...p.current_depot, name: e.target.value } }))}
                placeholder="e.g. Mombasa Container Terminal (KEMBA)"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-(--ink2) block">Depot UN/LOCODE</label>
              <Input
                value={formData.current_depot?.code || ''}
                onChange={(e) => setFormData((p) => ({ ...p, current_depot: { ...p.current_depot, code: e.target.value } }))}
                placeholder="e.g. KEMBA-01"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-(--ink2) block">Storage State</label>
              <Select
                value={formData.current_depot?.state || 'Empty'}
                onValueChange={(val) => setFormData((p) => ({ ...p, current_depot: { ...p.current_depot, state: val as 'Empty' | 'Laden' } }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Empty">Empty — Available</SelectItem>
                  <SelectItem value="Laden">Laden — Loaded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-(--border)">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(isEdit ? `/cargotracker/containers/${number}` : '/cargotracker/track')}
          >
            Cancel
          </Button>

          <Button type="submit" variant="default" disabled={saving}>
            {saving ? (
              <>
                <ButtonSpinner />
                Saving Container...
              </>
            ) : (
              <>
                <Icon name="check" size={14} />
                {isEdit ? 'Save Changes' : 'Record Container'}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};
