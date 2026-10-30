import type { ContainerDetails } from './containerTypes.js';

/** Empty display shape only: operational facts must come from persisted/provider evidence. */
export function getContainerDetails(containerNumber: string, overrides?: Partial<ContainerDetails>): ContainerDetails {
  return {
    container_number: containerNumber.trim().toUpperCase().replace(/\s/g,''),
    iso_code: '', size_type: 'Not recorded', ownership: '' as any, condition: 'UNKNOWN' as any, status: 'UNKNOWN' as any,
    max_gross_weight_kg: 0, tare_weight_kg: 0, payload_capacity_kg: 0, cubic_capacity_cbm: 0,
    floor_type: '', manufacture_year: 0, manufacturer: '', design_validity_years: 0,
    dimensions: { height_m: 0, width_m: 0, length_m: 0 },
    current_depot: { name: '', code: '', date: '', state: '' as any },
    classification: { category: '', cargo_types: [], certifications: [] },
    survey_report: { grade: '', rating_label: '', last_survey_date: '', surveyor_notes: '', photos: [], repairs: [] },
    compliance: { csc_cert_date: '', csc_expiry_date: '', acep_ccep: '', customs_seal_no: '' },
    voyage: { pol_city: '', pol_country: '', pod_city: '', pod_country: '', voyage_no: '', vessel_name: '', etd: '', eta: '', current_location: '' },
    customer: { name: '', role: 'Consignee', email: '', phone: '' }, cargo_breakdown: [], timeline: [],
    ...overrides,
  };
}
