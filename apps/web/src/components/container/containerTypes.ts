export type ContainerOwnership = 'PRIVATELY_OWNED' | 'CARRIER_OWNED' | 'LEASED';
export type ContainerCondition = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'DAMAGED';
export type ContainerStatus = 'AVAILABLE' | 'IN_TRANSIT' | 'AT_DEPOT' | 'EMPTY' | 'LADEN' | 'ON_HOLD' | 'DELAYED';
export type DelayStatus = 'ON_TIME' | 'SLIGHTLY_DELAYED' | 'DELAYED' | 'EARLY';

export interface ContainerDimensions {
  height_m: number;
  width_m: number;
  length_m: number;
}

export interface ContainerDepot {
  name: string;
  code: string;
  date: string;
  state: 'Empty' | 'Laden';
}

export interface ContainerClassification {
  category: string;
  cargo_types: string[];
  certifications: string[];
}

export interface ContainerRepair {
  id: string;
  title: string;
  date: string;
  completed: boolean;
  type?: 'paint' | 'scratch' | 'weld' | 'seal' | 'floor';
}

export interface ContainerSurveyReport {
  grade: string;
  rating_label: string;
  last_survey_date: string;
  surveyor_notes: string;
  photos: string[];
  repairs: ContainerRepair[];
}

export interface ContainerCompliance {
  csc_cert_date: string;
  csc_expiry_date: string;
  acep_ccep: string;
  customs_seal_no: string;
  iicl_status?: string;
}

export interface ContainerVoyage {
  pol_city: string;
  pol_country: string;
  pol_code?: string;
  pol_flag?: string;
  pod_city: string;
  pod_country: string;
  pod_code?: string;
  pod_flag?: string;
  voyage_no: string;
  vessel_name: string;
  etd: string;
  eta: string;
  current_location: string;
  delay_status?: DelayStatus;
}

export interface ContainerCustomer {
  name: string;
  role: 'Shipper' | 'Consignee' | 'Notify Party' | 'Forwarder';
  email: string;
  phone: string;
}

export interface ContainerCargoItem {
  description: string;
  quantity: number;
}

export interface ContainerTimelineEvent {
  title: string;
  date: string;
  status_type: 'actual' | 'planned';
  badge?: 'A' | 'P';
}

export interface ContainerTimelineNode {
  location: string;
  location_code?: string;
  mode?: 'truck' | 'train' | 'vessel' | 'yard';
  intermodal_tag?: string; // e.g. 'On Train'
  vessel_highlight?: string; // e.g. 'Current Vessel (My Sea Wanderer)'
  events: ContainerTimelineEvent[];
}

export interface ContainerDetails {
  container_number: string;
  iso_code: string;
  size_type: string;
  ownership: ContainerOwnership;
  condition: ContainerCondition;
  status: ContainerStatus;
  carrier?: string;
  color_hex?: string;
  
  // Technical specs
  max_gross_weight_kg: number;
  tare_weight_kg: number;
  payload_capacity_kg: number;
  cubic_capacity_cbm: number;
  floor_type: string;
  manufacture_year: number;
  manufacturer: string;
  design_validity_years: number;
  dimensions: ContainerDimensions;

  // Location & Depot
  current_depot: ContainerDepot;
  classification: ContainerClassification;

  // Survey & Inspection
  survey_report: ContainerSurveyReport;
  compliance: ContainerCompliance;

  // Voyage & Tracking
  voyage: ContainerVoyage;
  customer: ContainerCustomer;
  cargo_breakdown: ContainerCargoItem[];
  timeline: ContainerTimelineNode[];
}
