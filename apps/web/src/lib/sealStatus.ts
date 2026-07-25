import type { CustomsStatus, SealDeclarationStatus } from '@hudumika/types';

// Maps the fiscal status ramp (spec §10.2) onto this platform's own soft-tint
// Badge variants and CSS color tokens — never the spec's own bond-green/
// seal-orange palette (CLAUDE.md: any new UI uses the platform's existing
// design system, not a bespoke one per app).
export type BadgeVariant = 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray';

export const CUSTOMS_STATUS_VARIANT: Record<CustomsStatus, BadgeVariant> = {
  FOREIGN_DUTY_SUSPENDED: 'brand',   // under bond — this app's own identity color
  FOREIGN_DUTY_PAID: 'info',
  TRANSIT: 'info',
  TEMPORARY_ADMISSION: 'warning',
  INWARD_PROCESSING: 'warning',
  OUTWARD_PROCESSING: 'warning',
  EXPORT_DECLARED: 'success',
  EXPORTED: 'success',
  DOMESTIC: 'gray',
  ZONE_RESTRICTED: 'warning',
  ABANDONED: 'error',
  SEIZED: 'error',
  DESTROYED: 'error',
};

// CSS var name (without var()) for the seal-strip bar / runway fill.
export const CUSTOMS_STATUS_COLOR_VAR: Record<CustomsStatus, string> = {
  FOREIGN_DUTY_SUSPENDED: '--seal',
  FOREIGN_DUTY_PAID: '--blue',
  TRANSIT: '--blue',
  TEMPORARY_ADMISSION: '--gold',
  INWARD_PROCESSING: '--gold',
  OUTWARD_PROCESSING: '--gold',
  EXPORT_DECLARED: '--green',
  EXPORTED: '--green',
  DOMESTIC: '--ink3',
  ZONE_RESTRICTED: '--gold',
  ABANDONED: '--red',
  SEIZED: '--red',
  DESTROYED: '--red',
};

export const SEAL_DECLARATION_STATUS_VARIANT: Record<SealDeclarationStatus, BadgeVariant> = {
  DRAFT: 'gray',
  SUBMITTED: 'info',
  QUERIED: 'warning',
  ASSESSED: 'brand',
  PAID: 'success',
  RELEASED: 'success',
  CANCELLED: 'error',
};
