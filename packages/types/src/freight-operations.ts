export interface PartStockMovement {
  id: string;
  tenant_id: string;
  part_id: string;
  quantity_delta: number;
  balance_after: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export const FLEET_PARTNER_CATEGORIES = [
  { type: 'WORKSHOP', label: 'Garages & workshops' },
  { type: 'SERVICE_CENTRE', label: 'Authorised service centres' },
  { type: 'PARTS_SUPPLIER', label: 'Spare parts' },
  { type: 'TYRE_SERVICES', label: 'Tyres & fitting' },
  { type: 'RECOVERY', label: 'Recovery & roadside assistance' },
  { type: 'BODYWORK', label: 'Bodywork & fabrication' },
  { type: 'AUTO_ELECTRICAL', label: 'Electrical & diagnostics' },
  { type: 'FUEL_STATION', label: 'Fuel & lubricants' },
  { type: 'TELEMATICS', label: 'GPS & telematics' },
  { type: 'INSPECTION', label: 'Inspection & testing' },
  { type: 'VEHICLE_DEALER', label: 'Vehicle dealers' },
  { type: 'LEASING', label: 'Vehicle leasing' },
  { type: 'VEHICLE_HIRE', label: 'Vehicle hire' },
  { type: 'FINANCING', label: 'Vehicle financing' },
  { type: 'INSURANCE', label: 'Insurance & brokers' },
  { type: 'TRANSPORTER', label: 'Transporters & owner-operators' },
  { type: 'DRIVER_TRAINING', label: 'Driver training' },
  { type: 'OTHER', label: 'Other services' },
] as const;
export type FleetPartnerCategory = typeof FLEET_PARTNER_CATEGORIES[number]['type'];
export interface FleetPartnerServices { service_capabilities: FleetPartnerCategory[] }

/** Existing fleet write policy, shared by the vehicle editor and API. */
export const VEHICLE_EDIT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;
export function canEditVehicle(role: string | null | undefined): boolean {
  return VEHICLE_EDIT_ROLES.some(allowed => allowed === role);
}
