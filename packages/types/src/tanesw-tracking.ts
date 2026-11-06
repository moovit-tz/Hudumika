export interface TaneswTrackingEvent {
  code: string;
  status: string;
  processedAt: string;
  movementAt: string;
  locationCode: string;
  location: string;
  movementType: string;
  reference: string;
  declaration: string;
}

export interface TaneswContainerDetail {
  packageCount: number | null;
  packageUnit: string;
  weightKg: number | null;
  events: TaneswTrackingEvent[];
}

export interface TaneswTrackingResult {
  checkedAt: string;
  billOfLading: string;
  masterBill: string;
  houseBill: string;
  cargoReference: string;
  status: string;
  vessel: string;
  voyage: string;
  arrivalAt: string;
  carrier: string;
  forwarder: string;
  shippingAgentCode: string;
  packingType: string;
  billType: string;
  cargoType: string;
  customsOffice: string;
  loadingPortCode: string;
  dischargePort: string;
  destination: string;
  facility: string;
  facilityCode: string;
  lastLocation: string;
  stockLocation: string;
  cargo: string;
  packageCount: number | null;
  packageUnit: string;
  grossWeightKg: number | null;
  netWeightKg: number | null;
  containerCount: number | null;
  containers: Array<{
    number: string;
    sizeCode: string;
    freight: string;
    seals: string[];
    volumeCbm: number | null;
    location: string;
    status: string;
  }>;
  events: TaneswTrackingEvent[];
}
