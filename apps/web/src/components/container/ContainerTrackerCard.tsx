import React, { useState } from 'react';
import { ContainerDetails, ContainerRepair } from './containerTypes.js';
import { IsometricContainerIllustration } from './IsometricContainerIllustration.js';
import { CarrierLogo } from './CarrierLogo.js';
import { detectShippingLine } from './shippingLines.js';
import { Icon } from '../Icon.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog.js';
import './ContainerTracker.css';

interface ContainerTrackerCardProps {
  container: ContainerDetails;
  initialTab?: 'details' | 'tracking';
  onEdit?: (container: ContainerDetails) => void;
  className?: string;
}

export const ContainerTrackerCard: React.FC<ContainerTrackerCardProps> = ({
  container,
  initialTab = 'tracking',
  onEdit,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'tracking'>(initialTab);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [repairs, setRepairs] = useState<ContainerRepair[]>(container.survey_report?.repairs || []);
  const statusLabel = (container.status ?? 'AVAILABLE').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const conditionLabel = (container.condition ?? 'GOOD').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

  const toggleRepair = (id: string) => {
    setRepairs((prev) =>
      prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
  };

  const handlePrintSurveyReport = () => {
    const w = window.open('', '_blank');
    if (!w) return;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Container Survey Certificate — ${container.container_number}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Space+Grotesk:wght@600;800&display=swap');
  @page { size: A4; margin: 16mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; color: #0f172a; background: #fff; font-size: 12px; line-height: 1.5; }
  .cert-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0d9488; padding-bottom: 14px; margin-bottom: 20px; }
  .brand { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 800; color: #0f172a; }
  .badge-grade { background: #dcfce7; color: #15803d; padding: 4px 12px; border-radius: 20px; font-weight: 800; font-size: 12px; display: inline-block; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
  .card-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
  .spec-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #e2e8f0; font-size: 11.5px; }
  .notes { background: #eff6ff; border-left: 3px solid #3b82f6; padding: 12px 14px; border-radius: 4px; margin-bottom: 20px; font-size: 12px; color: #1e3a8a; }
  .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
</style>
</head>
<body>
  <div class="cert-header">
    <div>
      <div class="brand">ClearOS · Hudumika</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">ISO Container Inspection &amp; Survey Certificate</div>
    </div>
    <div style="text-align:right;">
      <div class="badge-grade">${container.survey_report?.grade || 'Grade A'} · ${container.survey_report?.rating_label || 'Cargo Worthy'}</div>
      <div style="font-size:10.5px;color:#64748b;margin-top:4px;">Survey Date: ${container.survey_report?.last_survey_date || '—'}</div>
    </div>
  </div>

  <div style="font-size:18px;font-weight:900;font-family:monospace;letter-spacing:1px;margin-bottom:6px;">
    ${container.container_number} <span style="font-size:13px;font-weight:600;color:#64748b;">(${container.size_type} · ISO: ${container.iso_code})</span>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">Technical Specifications</div>
      <div class="spec-row"><span>Max Gross Weight:</span><strong>${container.max_gross_weight_kg?.toLocaleString()} Kg</strong></div>
      <div class="spec-row"><span>Tare Weight:</span><strong>${container.tare_weight_kg?.toLocaleString()} Kg</strong></div>
      <div class="spec-row"><span>Payload Capacity:</span><strong>${container.payload_capacity_kg?.toLocaleString()} Kg</strong></div>
      <div class="spec-row"><span>Cubic Capacity:</span><strong>${container.cubic_capacity_cbm} m³</strong></div>
      <div class="spec-row"><span>Floor Type:</span><strong>${container.floor_type}</strong></div>
      <div class="spec-row"><span>Manufacturer:</span><strong>${container.manufacturer} (${container.manufacture_year})</strong></div>
      <div class="spec-row"><span>Design Validity:</span><strong>${container.design_validity_years} Years</strong></div>
    </div>

    <div class="card">
      <div class="card-title">Compliance &amp; Certifications</div>
      <div class="spec-row"><span>CSC Cert Date:</span><strong>${container.compliance?.csc_cert_date || '—'}</strong></div>
      <div class="spec-row"><span>CSC Expiry Date:</span><strong>${container.compliance?.csc_expiry_date || '—'}</strong></div>
      <div class="spec-row"><span>ACEP / CCEP:</span><strong>${container.compliance?.acep_ccep || 'N/A'}</strong></div>
      <div class="spec-row"><span>Customs Seal No:</span><strong>${container.compliance?.customs_seal_no || 'N/A'}</strong></div>
      <div class="spec-row"><span>Current Depot:</span><strong>${container.current_depot?.name} (${container.current_depot?.code})</strong></div>
      <div class="spec-row"><span>Status:</span><strong>${container.current_depot?.state}</strong></div>
    </div>
  </div>

  <div class="notes">
    <strong>Surveyor Remarks:</strong><br/>
    ${container.survey_report?.surveyor_notes || 'Container inspected and certified in compliance with ISO 1496 and CSC safety regulations.'}
  </div>

  <div class="footer">
    <div>Hudumika ClearOS Container Report · Document ID: ${container.container_number}-CERT</div>
    <div>Official Digital Record &copy; ${new Date().getFullYear()}</div>
  </div>
</body>
</html>`;

    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div className={`container-tracker-root space-y-4 ${className}`}>
      {/* ── Top Tab Bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
          <button
            type="button"
            className={`cnt-tab-btn ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
            aria-pressed={activeTab === 'details'}
          >
            <Icon name="info" size={14} color={activeTab === 'details' ? 'var(--teal)' : 'var(--ink3)'} />
            Details
          </button>
          <button
            type="button"
            className={`cnt-tab-btn ${activeTab === 'tracking' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracking')}
            aria-pressed={activeTab === 'tracking'}
          >
            <Icon name="percent" size={14} color={activeTab === 'tracking' ? 'var(--teal)' : 'var(--ink3)'} />
            Tracking
          </button>
        </div>

        {onEdit && (
          <Button variant="outline" size="sm" onClick={() => onEdit(container)}>
            <Icon name="edit" size={13} color="var(--teal)" />
            Edit Container Specs
          </Button>
        )}
      </div>

      {/* ── MAIN CONTENT ACCORDING TO ACTIVE TAB ── */}
      {activeTab === 'details' ? (
        /* ═════════════════════════════════════════════════════════════════════
           DETAILS VIEW (IMAGE 2)
           ═════════════════════════════════════════════════════════════════════ */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left / Main Column (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Top Hero Card with 3D Container Illustration */}
            <div className="cnt-hero-card p-5 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                <div className="md:col-span-7 flex justify-center">
                  <IsometricContainerIllustration
                    containerNumber={container.container_number}
                    isoCode={container.iso_code}
                    height={container.dimensions?.height_m || 2.5}
                    width={container.dimensions?.width_m || 2.5}
                    length={container.dimensions?.length_m || 12.5}
                  />
                </div>

                <div className="md:col-span-5 space-y-3.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="success">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
                      {statusLabel}
                    </Badge>
                    <CarrierLogo carrier={container.carrier || container.voyage?.vessel_name || container.container_number} size="xs" variant="badge" />
                  </div>

                  <div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--ink)] font-mono">
                      {container.container_number}
                    </h2>
                    <p className="text-xs sm:text-sm font-medium text-[var(--ink3)] mt-0.5">
                      {container.size_type} · <span className="font-semibold text-[var(--ink2)]">ISO: {container.iso_code}</span>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[var(--border)] space-y-2 text-xs font-medium text-[var(--ink2)]">
                    <div className="flex items-center gap-2">
                      <Icon name="user" size={14} color="var(--ink3)" />
                      <span>{container.ownership === 'PRIVATELY_OWNED' ? 'Privately Owned' : 'Carrier Owned'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon name="checkCircle" size={14} color="var(--green)" />
                      <span>{conditionLabel} Condition</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Technical Specs (6-Tile Bento Grid) */}
            <div className="cnt-side-card space-y-3">
              <h3 className="text-sm font-bold text-[var(--ink)] tracking-tight">Technical Specs</h3>
              <div className="cnt-bento-grid">
                {/* Tile 1: Max Gross Weight */}
                <div className="cnt-bento-tile">
                  <div className="cnt-tile-icon-box">
                    <Icon name="package" size={17} color="var(--teal)" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--ink3)]">Max</div>
                    <div className="text-base sm:text-lg font-black text-[var(--ink)] tracking-tight">
                      {container.max_gross_weight_kg?.toLocaleString()} Kg
                    </div>
                    <div className="text-[11px] font-medium text-[var(--ink3)]">Gross Weight</div>
                  </div>
                </div>

                {/* Tile 2: Tare Weight */}
                <div className="cnt-bento-tile">
                  <div className="cnt-tile-icon-box">
                    <Icon name="scale" size={17} color="var(--teal)" />
                  </div>
                  <div>
                    <div className="text-base sm:text-lg font-black text-[var(--ink)] tracking-tight">
                      {container.tare_weight_kg?.toLocaleString()} Kg
                    </div>
                    <div className="text-[11px] font-medium text-[var(--ink3)]">Tare Weight</div>
                  </div>
                </div>

                {/* Tile 3: Floor Type */}
                <div className="cnt-bento-tile">
                  <div className="cnt-tile-icon-box">
                    <Icon name="layers" size={17} color="var(--teal)" />
                  </div>
                  <div>
                    <div className="text-base sm:text-lg font-black text-[var(--ink)] tracking-tight">
                      {container.floor_type}
                    </div>
                    <div className="text-[11px] font-medium text-[var(--ink3)]">Floor Type</div>
                  </div>
                </div>

                {/* Tile 4: Cubic Capacity */}
                <div className="cnt-bento-tile">
                  <div className="cnt-tile-icon-box">
                    <Icon name="box2" size={17} color="var(--teal)" />
                  </div>
                  <div>
                    <div className="text-base sm:text-lg font-black text-[var(--ink)] tracking-tight">
                      {container.cubic_capacity_cbm} m³
                    </div>
                    <div className="text-[11px] font-medium text-[var(--ink3)]">Cubic Capacity</div>
                  </div>
                </div>

                {/* Tile 5: Manufacture */}
                <div className="cnt-bento-tile">
                  <div className="cnt-tile-icon-box">
                    <Icon name="building" size={17} color="var(--teal)" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--ink3)]">Year ({container.manufacture_year})</div>
                    <div className="text-xs sm:text-sm font-bold text-[var(--ink)] line-clamp-1">
                      {container.manufacturer}
                    </div>
                    <div className="text-[11px] font-medium text-[var(--ink3)]">Manufacture</div>
                  </div>
                </div>

                {/* Tile 6: Validity */}
                <div className="cnt-bento-tile">
                  <div className="cnt-tile-icon-box">
                    <Icon name="clock" size={17} color="var(--teal)" />
                  </div>
                  <div>
                    <div className="text-base sm:text-lg font-black text-[var(--ink)] tracking-tight">
                      {container.design_validity_years} Years
                    </div>
                    <div className="text-[11px] font-medium text-[var(--ink3)]">Validity</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Location Info Card */}
            <div className="cnt-depot-card space-y-2">
              <h3 className="text-sm font-bold text-[var(--ink)] tracking-tight">Location Info</h3>
              <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
                <div className="flex items-center gap-3.5">
                  <div className="cnt-calendar-badge">
                    <span className="cal-day">{container.current_depot?.date?.split(' ')[0] || '28'}</span>
                    <span className="cal-month">{container.current_depot?.date?.split(' ')[1] || 'June'}</span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--ink3)]">Current Depot</div>
                    <div className="text-sm font-bold text-[var(--ink)]">
                      {container.current_depot?.name}
                    </div>
                    <div className="text-xs font-mono font-semibold" style={{ color: 'var(--gold, #b45309)' }}>
                      {container.current_depot?.code}
                    </div>
                  </div>
                </div>

                <Badge variant="warning">
                  <Icon name="package" size={13} color="currentColor" />
                  {container.current_depot?.state || 'Empty'}
                </Badge>
              </div>
            </div>

            {/* Classification Card */}
            <div className="cnt-side-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--ink)] tracking-tight">Classification</h3>
                <span className="text-xs font-semibold text-[var(--ink2)]">{container.classification?.category || 'General Purpose'}</span>
              </div>

              <div className="space-y-3 pt-1 text-xs">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-[var(--ink3)] font-medium min-w-24">Cargo Types:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(container.classification?.cargo_types || ['Dry Goods', 'Palletized', 'Machinery']).map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-md bg-[var(--bg)] border border-[var(--border)] text-[var(--ink)] font-semibold text-[11px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-[var(--ink3)] font-medium min-w-24">Certifications:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(container.classification?.certifications || ['ISO 1496-1', 'IICL 6', 'CTU Code']).map((cert) => (
                      <span
                        key={cert}
                        className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 font-bold text-[11px]"
                      >
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Cargo Worthy & Survey Card */}
            <div className="cnt-side-card space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-[var(--ink)]">{container.survey_report?.rating_label || 'Cargo Worthy'}</h3>
                  <p className="text-xs font-semibold text-[var(--ink3)]">{container.survey_report?.grade || 'Grade A'}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handlePrintSurveyReport}>
                  <Icon name="fileText" size={13} color="var(--blue)" />
                  Report
                </Button>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-[var(--ink3)] font-medium">
                <Icon name="clock" size={13} color="var(--ink3)" />
                <span>Last survey: {container.survey_report?.last_survey_date || '15 Dec, 2025'}</span>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[var(--ink3)]">Survey Notes:</span>
                <p className="text-xs leading-relaxed text-[var(--ink2)] bg-[var(--bg)] p-3 rounded-lg border border-[var(--border)]">
                  {container.survey_report?.surveyor_notes}
                </p>
              </div>

              {/* Photo Inspection Gallery */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[var(--ink3)]">Inspection Photos:</span>
                <div className="cnt-photo-grid">
                  {(container.survey_report?.photos || []).map((imgUrl, i) => (
                    <div
                      key={imgUrl + i}
                      className="cnt-photo-item"
                      onClick={() => setLightboxImage(imgUrl)}
                    >
                      <img src={imgUrl} alt={`Container inspection ${i + 1}`} />
                      {i === 3 && (
                        <div className="cnt-photo-overlay">+5</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Repair History Checklist */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <span className="text-xs font-bold text-[var(--ink3)]">Repair History</span>
                <div className="space-y-1.5">
                  {repairs.map((r) => (
                    <div
                      key={r.id}
                      className="cnt-repair-row cursor-pointer hover:border-[var(--teal)] transition-colors"
                      onClick={() => toggleRepair(r.id)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[var(--ink3)]">
                          <Icon name="tool" size={12} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[var(--ink)] leading-tight">{r.title}</div>
                          <div className="text-[10px] text-[var(--ink3)] mt-0.5">{r.date}</div>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs ${r.completed ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                        {r.completed ? '✓' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Compliance & Certifications Card */}
            <div className="cnt-side-card space-y-3">
              <h3 className="text-sm font-bold text-[var(--ink)] tracking-tight">Compliance &amp; Certifications</h3>
              <div className="divide-y divide-[var(--border)] text-xs">
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2 text-[var(--ink2)]">
                    <Icon name="calendar" size={13} color="var(--ink3)" />
                    <span>CSC Certification Date</span>
                  </div>
                  <span className="font-bold text-[var(--ink)] font-mono">{container.compliance?.csc_cert_date || '—'}</span>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2 text-[var(--ink2)]">
                    <Icon name="calendar" size={13} color="var(--ink3)" />
                    <span>CSC Expiry Date</span>
                  </div>
                  <span className="font-bold text-[var(--ink)] font-mono">{container.compliance?.csc_expiry_date || '—'}</span>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2 text-[var(--ink2)]">
                    <Icon name="shield" size={13} color="var(--ink3)" />
                    <span>ACEP/CCEP</span>
                  </div>
                  <span className="font-bold text-[var(--ink)]">{container.compliance?.acep_ccep || 'N/A'}</span>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2 text-[var(--ink2)]">
                    <Icon name="lock" size={13} color="var(--ink3)" />
                    <span>Customs Seal No</span>
                  </div>
                  <span className="font-bold text-[var(--ink)] font-mono">{container.compliance?.customs_seal_no || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ═════════════════════════════════════════════════════════════════════
           TRACKING VIEW (IMAGE 1)
           ═════════════════════════════════════════════════════════════════════ */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column (8 cols): Hero + Milestone Stepper */}
          <div className="lg:col-span-8 space-y-4">
            {/* Top Container Hero Card */}
            <div className="cnt-hero-card p-5 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                <div className="md:col-span-7 flex justify-center">
                  <IsometricContainerIllustration
                    containerNumber={container.container_number}
                    isoCode={container.iso_code}
                    height={container.dimensions?.height_m || 2.5}
                    width={container.dimensions?.width_m || 2.5}
                    length={container.dimensions?.length_m || 12.5}
                  />
                </div>

                <div className="md:col-span-5 space-y-3.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-xs font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" />
                    {statusLabel}
                  </div>

                  <div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--ink)] font-mono">
                      {container.container_number}
                    </h2>
                    <p className="text-xs sm:text-sm font-medium text-[var(--ink3)] mt-0.5">
                      {container.size_type} · <span className="font-semibold text-[var(--ink2)]">ISO: {container.iso_code}</span>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[var(--border)] space-y-2 text-xs font-medium text-[var(--ink2)]">
                    <div className="flex items-center gap-2">
                      <Icon name="user" size={14} color="var(--ink3)" />
                      <span>{container.ownership === 'PRIVATELY_OWNED' ? 'Privately Owned' : 'Carrier Owned'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon name="checkCircle" size={14} color="var(--green)" />
                      <span>{conditionLabel} Condition</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stepper / Timeline Card */}
            <div className="cnt-side-card space-y-5">
              {/* Stepper Header Bar */}
              <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                    <Icon name="package" size={18} color="#fff" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-[var(--ink)] font-mono">{container.container_number}</div>
                    <div className="text-xs text-[var(--ink3)]">{container.size_type} • {container.iso_code}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant="warning">Slightly Delayed</Badge>
                  <div className="text-xs font-semibold text-[var(--ink3)]">
                    ETA: <strong className="text-[var(--ink)] font-bold">{container.voyage?.eta || 'Oct 25, 14:00'}</strong>
                  </div>
                </div>
              </div>

              {/* Vertical Milestone Stepper */}
              <div className="cnt-timeline-container space-y-7">
                <div className="cnt-timeline-rail" />

                {(container.timeline || []).map((node, nodeIdx) => (
                  <div key={`${node.location}-${nodeIdx}`} className="relative">
                    {/* Circle on Rail */}
                    <div className="cnt-node-circle active">
                      <Icon name="target" size={12} color="#0d9488" />
                    </div>

                    <div className="space-y-2">
                      {/* Node Header */}
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-black text-[var(--ink)]">{node.location}</span>
                        {node.location_code && (
                          <span className="text-[11px] font-mono text-[var(--ink3)]">{node.location_code}</span>
                        )}
                      </div>

                      {/* Intermodal tag (e.g. On Train) */}
                      {node.intermodal_tag && (
                        <Badge variant="brand" className="my-1">
                          <Icon name="train" size={12} />
                          {node.intermodal_tag}
                        </Badge>
                      )}

                      {/* Vessel Highlight Button */}
                      {node.vessel_highlight && (
                        <div className="my-2">
                          <div className="cnt-vessel-pill">
                            <Icon name="ship" size={14} color="#fff" />
                            {node.vessel_highlight}
                          </div>
                        </div>
                      )}

                      {/* Events List under this node */}
                      {node.events && node.events.length > 0 && (
                        <div className="space-y-2 pt-1 pl-1">
                          {node.events.map((ev, evIdx) => (
                            <div key={ev.title + evIdx} className="flex items-center justify-between text-xs py-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-[var(--ink)]">{ev.title}</span>
                                <span className={`px-1.5 py-0.2 rounded text-[10px] font-black ${ev.badge === 'A' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'}`}>
                                  {ev.badge || (ev.status_type === 'actual' ? 'A' : 'P')}
                                </span>
                              </div>
                              <span className="text-[var(--ink3)] font-mono text-[11px]">{ev.date}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column (4 cols): Voyage Card + Consignment Summary */}
          <div className="lg:col-span-4 space-y-4">
            {/* Top Right Voyage Card */}
            <div className="cnt-side-card space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-black text-[var(--ink)] font-mono">{container.container_number}</h3>
                  <p className="text-xs text-[var(--ink3)]">ISO: {container.iso_code}</p>
                </div>
                <CarrierLogo carrier={container.carrier || container.voyage?.vessel_name || container.container_number} size="xs" variant="mark" />
              </div>

              <div className="space-y-1">
                <div className="text-xs font-medium text-[var(--ink2)]">{container.size_type}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[var(--ink2)] text-[11px] font-bold">
                    <Icon name="user" size={11} />
                    OWNED
                  </div>
                  <CarrierLogo carrier={container.carrier || container.voyage?.vessel_name || container.container_number} size="xs" variant="badge" />
                </div>
              </div>

              {/* POL > POD Route block */}
              <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--ink3)]">
                      <span>{container.voyage?.pol_flag || '🇮🇳'}</span>
                      <span className="font-bold uppercase tracking-wider text-[10px]">POL</span>
                    </div>
                    <div className="text-sm font-bold text-[var(--ink)]">{container.voyage?.pol_city}</div>
                  </div>

                  <Icon name="chevronRight" size={16} color="var(--ink3)" />

                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1.5 text-xs text-[var(--ink3)]">
                      <span>{container.voyage?.pod_flag || '🇺🇸'}</span>
                      <span className="font-bold uppercase tracking-wider text-[10px]">POD</span>
                    </div>
                    <div className="text-sm font-bold text-[var(--ink)]">{container.voyage?.pod_city}</div>
                  </div>
                </div>

                <div className="text-center py-1.5 px-3 bg-[var(--white)] rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--ink2)]">
                  Voyage: {container.voyage?.voyage_no}
                </div>
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--ink2)]">
                <Icon name="mapPin" size={14} color="var(--teal)" />
                <span>Current Location <strong>({container.voyage?.current_location})</strong></span>
              </div>
            </div>

            {/* Bottom Right Consignment Summary Card */}
            <div className="cnt-side-card space-y-4">
              {/* 1. Customer */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[var(--ink3)] uppercase tracking-wider">1. Customer(s)</div>
                <div className="p-3 rounded-xl bg-[var(--bg)] border-l-4 border-l-teal-500 border border-[var(--border)] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-[var(--ink)]">{container.customer?.name}</span>
                    <span className="text-xs font-bold" style={{ color: 'var(--teal)' }}>✓ Shipper</span>
                  </div>
                  <div className="text-xs text-[var(--ink3)]">{container.customer?.email}</div>
                  <div className="text-xs font-mono text-[var(--ink3)]">{container.customer?.phone}</div>
                </div>
              </div>

              {/* 2. Location Details */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[var(--ink3)] uppercase tracking-wider">2. Location Details</div>
                <div className="p-3 rounded-xl bg-[var(--bg)] border-l-4 border-l-teal-500 border border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--ink)]">
                    <div>
                      <div className="text-[10px] text-[var(--ink3)]">POL</div>
                      {container.voyage?.pol_city}, {container.voyage?.pol_country}
                    </div>
                    <Icon name="chevronRight" size={14} color="var(--ink3)" />
                    <div className="text-right">
                      <div className="text-[10px] text-[var(--ink3)]">POD</div>
                      {container.voyage?.pod_city}, {container.voyage?.pod_country}
                    </div>
                  </div>

                  <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
                    <div className="font-bold">{container.voyage?.vessel_name}</div>
                    <div className="text-[11px] opacity-90">ETD: {container.voyage?.etd} - ETA {container.voyage?.eta}</div>
                  </div>
                </div>
              </div>

              {/* 3. Cargo Details */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--ink3)] uppercase tracking-wider">
                  <span>3. Cargo Details</span>
                  <span>Qty</span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] divide-y divide-[var(--border)] text-xs">
                  {(container.cargo_breakdown || []).map((item, idx) => (
                    <div key={item.description + idx} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-1.5 text-[var(--ink)] font-medium">
                        <span className="text-teal-600 font-bold">✓</span>
                        <span>{item.description}</span>
                      </div>
                      <span className="font-black text-[var(--ink)] font-mono">{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Lightbox Modal ── */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black/95 border-none">
          <DialogHeader className="p-4 bg-slate-900/80 text-white">
            <DialogTitle className="text-sm font-bold text-slate-200">
              Container Inspection Survey Photo — {container.container_number}
            </DialogTitle>
          </DialogHeader>
          {lightboxImage && (
            <div className="p-4 flex items-center justify-center">
              <img
                src={lightboxImage}
                alt="Container High-res Inspection"
                className="max-h-[70vh] w-auto rounded-lg object-contain shadow-2xl"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
