import React from 'react';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';
import { Badge } from './ui/badge.js';
import { FeaturedIcon } from './ui/featured-icon.js';
import { Button } from './ui/button.js';

const FIELD_LABELS: Record<string, string> = {
  // Transport & Customs
  bl_number: 'B/L Number',
  tansad_number: 'TANSAD Ref',
  declaration_type: 'Declaration Regime',
  processing_office: 'Customs Station',
  vessel: 'Vessel / Carrier',
  voyage: 'Voyage',
  origin_port: 'Port of Loading',
  dest_port: 'Port of Discharge',
  container_number: 'Container No',
  container_size: 'Container Type',
  seal_number: 'Seal Number',
  gross_weight_kg: 'Gross Weight (kg)',
  net_weight_kg: 'Net Weight (kg)',
  cbm: 'Volume (CBM)',
  packages: 'Package Count',
  package_type: 'Package Type',
  eta: 'ETA',
  free_time_end: 'Free Time Expiry',
  goods_desc: 'Goods Description',

  // Payments & Financials (CRDB Bank, Mobile Payment, Duty Slip)
  bank_name: 'Bank / Service',
  transaction_status: 'Transaction Status',
  from_account: 'From Account',
  account_owner: 'Account Owner',
  beneficiary_name: 'Beneficiary Name',
  phone_number: 'Phone Number',
  amount_tzs: 'Amount (TZS)',
  amount: 'Amount',
  company_category: 'Company Category',
  company_type: 'Company Type',
  transfer_date: 'Transfer Date',
  payment_date: 'Payment Date',
  reference_number: 'Reference Number',
  related_reference: 'Related Reference',
  created_by: 'Created By',

  // Invoice & Parties
  invoice_number: 'Invoice Number',
  invoice_date: 'Invoice Date',
  invoice_value_usd: 'Invoice Value (USD)',
  customs_value_tzs: 'Customs Value (TZS)',
  currency: 'Currency',
  incoterms: 'Incoterms',
  shipper_name: 'Shipper / Exporter',
  consignee_name: 'Consignee / Importer',
  declarant_name: 'Declarant Agent',
};

function formatKeyName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getDocIcon(docType?: string, ov?: any): IconName {
  const dt = (docType || '').toUpperCase();
  if (dt === 'PAYMENT_RECEIPT' || dt === 'BANK_ADVICE' || ov?.bank_name || ov?.account_owner || ov?.transaction_status) {
    return 'creditCard';
  }
  if (dt === 'TANSAD') return 'shield';
  if (dt === 'BL' || dt === 'AWB') return 'package';
  if (dt === 'INVOICE') return 'receipt';
  return 'fileText';
}

export interface AiExtractedCardProps {
  ocrResult: any;
  previewUrl?: string | null;
  simulated?: boolean;
  onRescan?: () => void;
  onApply?: () => void;
  applyLabel?: string;
  className?: string;
}

export function AiExtractedCard({
  ocrResult,
  previewUrl,
  simulated = false,
  onRescan,
  onApply,
  applyLabel = 'Apply Extracted Data',
  className = '',
}: AiExtractedCardProps) {
  if (!ocrResult) return null;

  const docType = (ocrResult.doc_type || 'DOCUMENT').toUpperCase();
  const ov = ocrResult.overview || {};
  const pt = ocrResult.parties || {};
  const fi = ocrResult.financial || {};
  // No fallback. `|| 0.92` rendered a "92% AI Confidence" badge whenever the
  // model returned no confidence at all — a number the model never produced,
  // shown as if it had. When it is missing the badge is simply not drawn.
  const conf = typeof ocrResult.confidence === 'number'
    ? Math.round(ocrResult.confidence * 100)
    : null;
  const docIcon = getDocIcon(docType, ov);

  // Combine scalar fields from overview, financial, parties
  const combinedRaw: Record<string, any> = { ...ov, ...pt, ...fi };
  delete combinedRaw.goods_desc; // rendered separately

  const entries = Object.entries(combinedRaw).filter(([, val]) => {
    if (val === null || val === undefined || val === '') return false;
    if (typeof val === 'object') return false;
    return true;
  });

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Banner Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border bg-[var(--white)] shadow-sm">
        <div className="flex items-center gap-3">
          <FeaturedIcon variant="brand" size="md" shape="square">
            <Icon name={docIcon} size={20} />
          </FeaturedIcon>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-[var(--ink)]">
                {ov.bank_name ? `${ov.bank_name} ${docType.replace('_', ' ')}` : `${docType} Document`}
              </span>
              <Badge variant="brand">{docType}</Badge>
              {simulated && <Badge variant="warning">Demo Data</Badge>}
              {conf !== null && (
                <Badge variant={conf >= 85 ? 'success' : 'warning'}>{conf}% AI Confidence</Badge>
              )}
            </div>
            <p className="text-xs text-[var(--ink3)] mt-0.5">
              Extracted structured data using ClearOS Gemini AI Engine
            </p>
          </div>
        </div>

        {onRescan && (
          <Button type="button" variant="outline" size="sm" onClick={onRescan}>
            <Icon name="refresh" size={13} className="mr-1.5" />
            Re-scan
          </Button>
        )}
      </div>

      {/* Main Preview & Data Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {previewUrl && (
          <div className="md:col-span-4 flex flex-col items-center justify-center p-2 rounded-xl border border-border bg-muted/30">
            <img
              src={previewUrl}
              alt="Scanned document preview"
              className="max-h-72 w-full object-contain rounded-lg border border-border shadow-xs"
            />
          </div>
        )}

        <div className={previewUrl ? 'md:col-span-8 space-y-3' : 'md:col-span-12 space-y-3'}>
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink3)]">
            Extracted Fields ({entries.length})
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {entries.map(([k, val]) => {
              const label = FIELD_LABELS[k] || formatKeyName(k);
              const strVal = String(val);
              const isStatus = k.includes('status');
              const isMonetary = k.includes('amount') || k.includes('value') || k.includes('duty') || k.includes('tax');
              const isMono = k.includes('account') || k.includes('number') || k.includes('ref') || k.includes('tin') || k.includes('code');

              return (
                <div
                  key={k}
                  className="flex flex-col p-2.5 rounded-lg border border-border bg-[var(--card-bg)] shadow-2xs hover:border-[var(--teal)] transition-colors"
                >
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink3)] mb-1">
                    {label}
                  </span>

                  {isStatus ? (
                    <div>
                      <Badge
                        variant={
                          strVal.toLowerCase().includes('progress') || strVal.toLowerCase().includes('pending')
                            ? 'warning'
                            : strVal.toLowerCase().includes('fail') || strVal.toLowerCase().includes('reject')
                            ? 'error'
                            : 'success'
                        }
                      >
                        {strVal}
                      </Badge>
                    </div>
                  ) : isMonetary ? (
                    <span className="text-sm font-bold text-[var(--teal)]">
                      {strVal} {ov.currency ? ov.currency : ''}
                    </span>
                  ) : isMono ? (
                    <span className="text-xs font-semibold font-mono text-[var(--ink)] break-all">
                      {strVal}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-[var(--ink)] line-clamp-2">
                      {strVal}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {ov.goods_desc && (
            <div className="p-3 rounded-xl border border-[var(--teal-m)] bg-[var(--teal-l)] text-xs text-[var(--ink)]">
              <span className="font-bold text-[var(--teal-d)] uppercase tracking-wider text-[10px] block mb-1">
                Goods / Notes
              </span>
              {ov.goods_desc}
            </div>
          )}
        </div>
      </div>

      {/* Footer apply button */}
      {onApply && (
        <div className="flex justify-end pt-2">
          <Button type="button" variant="default" onClick={onApply}>
            <Icon name="check" size={15} className="mr-1.5" />
            {applyLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
