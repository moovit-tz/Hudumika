import { ContainerDetails } from './containerTypes.js';

export const SAMPLE_CONTAINER_MSCU: ContainerDetails = {
  container_number: 'MSCU1234567',
  iso_code: '20G1',
  size_type: 'Dry - 20 feet Container',
  ownership: 'PRIVATELY_OWNED',
  condition: 'EXCELLENT',
  status: 'AVAILABLE',

  max_gross_weight_kg: 30480,
  tare_weight_kg: 3780,
  payload_capacity_kg: 26700,
  cubic_capacity_cbm: 76.3,
  floor_type: 'Cortan Steel',
  manufacture_year: 2023,
  manufacturer: 'XYZA Material Private Limited',
  design_validity_years: 20,
  dimensions: {
    height_m: 2.5,
    width_m: 2.5,
    length_m: 12.5,
  },

  current_depot: {
    name: 'Serenity Shores Supply Depot',
    code: '28837 - HS',
    date: '28 June',
    state: 'Empty',
  },

  classification: {
    category: 'General Purpose',
    cargo_types: ['Dry Goods', 'Palletized', 'Machinery', 'Consumer Electronics'],
    certifications: ['ISO 1496-1', 'IICL 6', 'CTU Code', 'TIR Approved', 'CSC'],
  },

  survey_report: {
    grade: 'Grade A',
    rating_label: 'Cargo Worthy',
    last_survey_date: '15 Dec, 2025',
    surveyor_notes:
      'The shipping container is in excellent condition, showing no signs of wear or damage. All seals are intact, ensuring a secure environment for contents.',
    photos: [
      '/assets/container/inspection_front.jpg',
      '/assets/container/inspection_corner.jpg',
      '/assets/container/inspection_csc.jpg',
      '/assets/container/inspection_interior.jpg',
    ],
    repairs: [
      {
        id: 'rep-1',
        title: 'Paint Damage',
        date: '24 June, 2025 , 11:30AM',
        completed: true,
        type: 'paint',
      },
      {
        id: 'rep-2',
        title: 'Surface scratch',
        date: '22 April, 2025 , 10:00PM',
        completed: true,
        type: 'scratch',
      },
      {
        id: 'rep-3',
        title: 'Repaint outside',
        date: '10 Feb, 2024 , 7:00PM',
        completed: true,
        type: 'paint',
      },
    ],
  },

  compliance: {
    csc_cert_date: '10/10/2025',
    csc_expiry_date: '14/09/2029',
    acep_ccep: 'N/A',
    customs_seal_no: 'N/A',
    iicl_status: 'IICL-6 Certified',
  },

  voyage: {
    pol_city: 'Chennai',
    pol_country: 'India',
    pol_code: 'INMAA',
    pol_flag: '🇮🇳',
    pod_city: 'New York',
    pod_country: 'USA',
    pod_code: 'USNYC',
    pod_flag: '🇺🇸',
    voyage_no: 'AE1 / 24N',
    vessel_name: 'My Sea Wanderer',
    etd: '15 Oct 2024',
    eta: '5 Nov 2024',
    current_location: 'Chennai Port',
    delay_status: 'SLIGHTLY_DELAYED',
  },

  customer: {
    name: 'Stanley Heinz',
    role: 'Shipper',
    email: 'praveen@pepperistic.com',
    phone: '+1 (264) 366 8373',
  },

  cargo_breakdown: [
    { description: '40ft High cube (Electronics)', quantity: 4 },
    { description: '20ft Reefer (Pharmaceuticals)', quantity: 2 },
    { description: '20ft Dry (General cargo)', quantity: 2 },
  ],

  timeline: [
    {
      location: 'Container Yard',
      events: [
        {
          title: 'Empty Picked up at container yard',
          date: '19 Aug 2025 , 12:40 PM',
          status_type: 'actual',
          badge: 'A',
        },
      ],
    },
    {
      location: 'Hakata/Fuji',
      location_code: 'JPHKT',
      events: [
        {
          title: 'Gate In',
          date: '20 Aug 2025 , 08:21 AM',
          status_type: 'actual',
          badge: 'A',
        },
      ],
    },
    {
      location: 'Kobe',
      location_code: 'JPHKT',
      intermodal_tag: 'On Train',
      events: [
        {
          title: 'Gate In',
          date: '15 Sep 2026, 09:45 AM',
          status_type: 'actual',
          badge: 'A',
        },
        {
          title: 'Arrival',
          date: '19 Sep 2026, 03:00 PM',
          status_type: 'actual',
          badge: 'A',
        },
        {
          title: 'Loaded',
          date: '20 Sep 2026, 04:15 PM',
          status_type: 'actual',
          badge: 'A',
        },
        {
          title: 'Departure',
          date: '23 Sep 2026, 05:30 PM',
          status_type: 'actual',
          badge: 'A',
        },
      ],
    },
    {
      location: 'Transit Voyage',
      vessel_highlight: 'Current Vessel (My Sea Wanderer)',
      events: [],
    },
    {
      location: 'California',
      location_code: 'CLAUS',
      events: [
        {
          title: 'Arrival',
          date: '10 Oct 2025 , 07:12 AM',
          status_type: 'planned',
          badge: 'P',
        },
        {
          title: 'Departure',
          date: '11 Oct 2025 , 15:12 PM',
          status_type: 'planned',
          badge: 'P',
        },
      ],
    },
    {
      location: 'Los Angeles, US',
      location_code: 'USLAX',
      events: [
        {
          title: 'Final Discharge & Gate Out',
          date: '25 Oct 2025 , 14:00 PM',
          status_type: 'planned',
          badge: 'P',
        },
      ],
    },
  ],
};

export const SAMPLE_PRESETS: Record<string, ContainerDetails> = {
  MSCU1234567: SAMPLE_CONTAINER_MSCU,

  MAEU9821450: {
    ...SAMPLE_CONTAINER_MSCU,
    container_number: 'MAEU9821450',
    iso_code: '40HC',
    size_type: 'High Cube - 40 feet Container',
    ownership: 'CARRIER_OWNED',
    condition: 'EXCELLENT',
    status: 'IN_TRANSIT',
    max_gross_weight_kg: 32500,
    tare_weight_kg: 3820,
    payload_capacity_kg: 28680,
    cubic_capacity_cbm: 76.4,
    floor_type: 'Marine Hardwood Ply',
    manufacture_year: 2022,
    manufacturer: 'CIMC Containers Ltd',
    dimensions: { height_m: 2.9, width_m: 2.44, length_m: 12.19 },
    current_depot: {
      name: 'Mombasa Gateway Container Freight Station',
      code: 'KEMBA - SEC4',
      date: '14 August',
      state: 'Laden',
    },
    voyage: {
      pol_city: 'Mombasa',
      pol_country: 'Kenya',
      pol_code: 'KEMBA',
      pol_flag: '🇰🇪',
      pod_city: 'Rotterdam',
      pod_country: 'Netherlands',
      pod_code: 'NLRTM',
      pod_flag: '🇳🇱',
      voyage_no: 'MAEU-8841X',
      vessel_name: 'MAERSK MC-KINNEY MOLLER',
      etd: '02 Sep 2025',
      eta: '28 Sep 2025',
      current_location: 'Red Sea Transit Corridor',
      delay_status: 'ON_TIME',
    },
    customer: {
      name: 'Amani Agri-Exports Ltd',
      role: 'Shipper',
      email: 'logistics@amaniagri.co.ke',
      phone: '+254 711 982 341',
    },
    cargo_breakdown: [
      { description: 'Grade AA Arabica Green Coffee', quantity: 380 },
      { description: 'Fine Cut Black Tea CTC', quantity: 240 },
    ],
  },

  CMAU5510293: {
    ...SAMPLE_CONTAINER_MSCU,
    container_number: 'CMAU5510293',
    iso_code: '20RF',
    size_type: 'Refrigerated - 20 feet Reefer',
    ownership: 'LEASED',
    condition: 'GOOD',
    status: 'AVAILABLE',
    max_gross_weight_kg: 30480,
    tare_weight_kg: 3200,
    payload_capacity_kg: 27280,
    cubic_capacity_cbm: 28.3,
    floor_type: 'T-Bar Aluminum Reefer Floor',
    manufacture_year: 2024,
    manufacturer: 'Singamas Container Holdings',
    dimensions: { height_m: 2.59, width_m: 2.44, length_m: 6.06 },
    current_depot: {
      name: 'Cape Town Cold Storage & Depot',
      code: 'ZACPT - C9',
      date: '04 July',
      state: 'Laden',
    },
    voyage: {
      pol_city: 'Durban',
      pol_country: 'South Africa',
      pol_code: 'ZADUR',
      pol_flag: '🇿🇦',
      pod_city: 'Antwerp',
      pod_country: 'Belgium',
      pod_code: 'BEANR',
      pod_flag: '🇧🇪',
      voyage_no: 'CMA-AFR-094',
      vessel_name: 'CMA CGM JACQUES SAADE',
      etd: '18 Aug 2025',
      eta: '12 Sep 2025',
      current_location: 'Durban Pier 2 Terminal',
      delay_status: 'ON_TIME',
    },
    customer: {
      name: 'Stellenbosch Vineyards Export Co.',
      role: 'Shipper',
      email: 'dispatch@stellenboschwine.co.za',
      phone: '+27 21 888 4300',
    },
    cargo_breakdown: [
      { description: 'Chilled Pinotage Reserve Cases', quantity: 840 },
      { description: 'Sauvignon Blanc Temperature-Controlled', quantity: 620 },
    ],
  },
};

/**
 * Look up or dynamically generate realistic container details for any container number
 */
export function getContainerDetails(
  containerNumber: string,
  overrides?: Partial<ContainerDetails>
): ContainerDetails {
  const norm = (containerNumber || 'MSCU1234567').trim().toUpperCase().replace(/\s/g, '');
  
  if (SAMPLE_PRESETS[norm]) {
    return { ...SAMPLE_PRESETS[norm], ...(overrides || {}) };
  }

  // Derive dynamic realistic details from the prefix & number
  const prefix = norm.slice(0, 4);
  const is40 = norm.includes('4') || norm.includes('8');
  const isReefer = norm.includes('R') || prefix.endsWith('R');

  const isoCode = isReefer ? '20RF' : is40 ? '40HC' : '20G1';
  const sizeType = isReefer
    ? 'Refrigerated - 20 feet Reefer'
    : is40
    ? 'Dry - 40 feet High Cube Container'
    : 'Dry - 20 feet Container';

  return {
    ...SAMPLE_CONTAINER_MSCU,
    container_number: norm,
    iso_code: isoCode,
    size_type: sizeType,
    ownership: norm.startsWith('MSC') || norm.startsWith('MAE') || norm.startsWith('CMA') ? 'CARRIER_OWNED' : 'PRIVATELY_OWNED',
    condition: 'EXCELLENT',
    status: 'AVAILABLE',
    max_gross_weight_kg: is40 ? 32500 : 30480,
    tare_weight_kg: is40 ? 3820 : 3780,
    payload_capacity_kg: is40 ? 28680 : 26700,
    cubic_capacity_cbm: is40 ? 76.4 : 33.2,
    floor_type: isReefer ? 'T-Bar Aluminum' : 'Cortan Steel',
    dimensions: {
      height_m: is40 ? 2.9 : 2.5,
      width_m: 2.5,
      length_m: is40 ? 12.5 : 6.1,
    },
    voyage: {
      ...SAMPLE_CONTAINER_MSCU.voyage,
      voyage_no: `${prefix}-VOY/${norm.slice(-3)}`,
    },
    ...(overrides || {}),
  };
}
