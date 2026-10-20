export interface FleetCargoItem {
  id: string;
  code: string;
  label: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  quantity: number;
  color: string;
  status: 'Loaded' | 'In Transit' | 'Delivered' | 'Pending';
  destination: string;
  gridSlot?: { row: number; col: number; tier: number };
  placements: { x: number; y: number; z: number }[];
}

export interface FleetVehicle {
  id: string;
  name: string;
  plate_number: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  type: string;
  ownership: string;
  status: 'ON_ROUTE' | 'LOADING' | 'AVAILABLE' | 'OUT_FOR_ORDER' | 'DELAYED' | 'MAINTENANCE';
  statusLabel: string;
  photoUrl: string;
  category: 'Heavy Truck' | 'Medium Truck' | 'Cargo Van' | 'Utility Pickup';
  specs: {
    maxWeightKg: number;
    currentWeightKg: number;
    weightDeltaPct: number;
    currentSpeedKmh: number;
    fuelUsedL: number;
    fuelLevelPct: number;
    tripsCompleted: number;
    mileageKm: number;
    engineHours: number;
    nextServiceKm: number;
    containerLengthCm: number;
    containerWidthCm: number;
    containerHeightCm: number;
    loadCapacityPct: number;
    tempC?: number;
  };
  driver: {
    id: string;
    name: string;
    phone: string;
    avatarUrl?: string;
    licenseNo: string;
    sinceYear: number;
    rating: number;
  };
  activeTrip: {
    id: string;
    loadId: string;
    origin: string;
    destination: string;
    distanceKm: number;
    remainingKm: number;
    timeSpent: string;
    etaMinutes: number;
    progressPct: number;
    status: 'On Track' | 'Delayed' | 'Loading' | 'Scheduled';
    notes?: string;
    waypoints: { name: string; time: string; passed: boolean }[];
  };
  cargoItems: FleetCargoItem[];
  systemHealth: {
    engine: 'Healthy' | 'Warning' | 'Critical';
    brakes: 'Healthy' | 'Warning' | 'Critical';
    tires: 'Healthy' | 'Warning' | 'Critical';
    battery: 'Healthy' | 'Warning' | 'Critical';
    transmission: 'Healthy' | 'Warning' | 'Critical';
  };
  recentAlerts: { id: string; type: string; title: string; time: string; severity: 'low' | 'warning' | 'info' }[];
  documents: { id: string; title: string; size: string; type: string; expiryDate: string }[];
}

export const FLEET_VEHICLES: FleetVehicle[] = [
  {
    id: 'd0e5c64e-c18b-4621-95ee-21be51923a44',
    name: 'Volvo FH16 Globetrotter 750',
    plate_number: 'SDN-0278451',
    vin: 'YV2RT40A5MA109842',
    make: 'Volvo',
    model: 'FH16 750',
    year: 2024,
    type: 'SEMI_TRACTOR',
    ownership: 'OWNED',
    status: 'ON_ROUTE',
    statusLabel: 'On Route',
    photoUrl: '/images/freight/volvo-fh16.jpg',
    category: 'Heavy Truck',
    specs: {
      maxWeightKg: 26000,
      currentWeightKg: 18540,
      weightDeltaPct: 15,
      currentSpeedKmh: 75,
      fuelUsedL: 210,
      fuelLevelPct: 68,
      tripsCompleted: 7,
      mileageKm: 245680,
      engineHours: 5432,
      nextServiceKm: 1250,
      containerLengthCm: 1360,
      containerWidthCm: 248,
      containerHeightCm: 270,
      loadCapacityPct: 68,
      tempC: 4,
    },
    driver: {
      id: 'DRV-8941',
      name: 'Alexander Vance',
      phone: '+61 412 890 234',
      licenseNo: 'LIC-NSW-987214',
      sinceYear: 2019,
      rating: 4.9,
    },
    activeTrip: {
      id: 'TRP-SYD-2041',
      loadId: 'CRG096',
      origin: '7 George St, Parramatta NSW 2150',
      destination: '100 Pitt St, Sydney NSW 2000',
      distanceKm: 820,
      remainingKm: 28,
      timeSpent: '12h 40m',
      etaMinutes: 80,
      progressPct: 82,
      status: 'On Track',
      notes: 'Priority high-value electronics consignment. Maintain refrigeration at 4°C.',
      waypoints: [
        { name: 'Parramatta Depot', time: '06:00 AM', passed: true },
        { name: 'Flemington Interchange', time: '09:30 AM', passed: true },
        { name: 'Strathfield Checkpoint', time: '12:15 PM', passed: true },
        { name: 'Sydney CBD Terminal', time: '01:45 PM', passed: false },
      ],
    },
    systemHealth: {
      engine: 'Healthy',
      brakes: 'Healthy',
      tires: 'Warning',
      battery: 'Healthy',
      transmission: 'Healthy',
    },
    recentAlerts: [
      { id: 'ALT-1', type: 'Tire Pressure Low', title: 'Rear axle 2 inner tire at 86 PSI (std 105 PSI)', time: '10:24 AM', severity: 'warning' },
      { id: 'ALT-2', type: 'Scheduled Maintenance', title: 'A-Service inspection due in 1,250 km', time: 'Yesterday', severity: 'info' },
      { id: 'ALT-3', type: 'Driver Break', title: '4h mandatory rest completed at Marulan service plaza', time: '08:15 AM', severity: 'low' },
    ],
    documents: [
      { id: 'DOC-1', title: 'National Identity Document', size: '32.5 kB', type: 'PDF', expiryDate: '2028-11-15' },
      { id: 'DOC-2', title: 'Heavy Combination (HC) Driving License', size: '48.2 kB', type: 'PDF', expiryDate: '2027-04-20' },
      { id: 'DOC-3', title: 'Commercial Freight SLA Agreement', size: '124.0 kB', type: 'PDF', expiryDate: '2026-12-31' },
      { id: 'DOC-4', title: 'Dangerous Goods & Reefer Certification', size: '64.1 kB', type: 'PDF', expiryDate: '2027-08-10' },
    ],
    cargoItems: [
      { id: 'c1', code: 'CRG15', label: 'Solar Inverters & Batteries', length_cm: 120, width_cm: 100, height_cm: 110, weight_kg: 500, quantity: 4, color: '#0891b2', status: 'Loaded', destination: 'Sydney, NSW', gridSlot: { row: 0, col: 0, tier: 0 }, placements: [{ x: 100, y: 50, z: 50 }, { x: 230, y: 50, z: 50 }] },
      { id: 'c2', code: 'CRG17', label: 'Medical Diagnostic Units', length_cm: 120, width_cm: 100, height_cm: 110, weight_kg: 500, quantity: 3, color: '#0284c7', status: 'Loaded', destination: 'Sydney, NSW', gridSlot: { row: 0, col: 1, tier: 0 }, placements: [{ x: 360, y: 50, z: 50 }] },
      { id: 'c3', code: 'CRG20', label: 'Precision CNC Parts', length_cm: 120, width_cm: 100, height_cm: 110, weight_kg: 500, quantity: 4, color: '#2563eb', status: 'Loaded', destination: 'Sydney, NSW', gridSlot: { row: 0, col: 2, tier: 0 }, placements: [{ x: 490, y: 50, z: 50 }] },
      { id: 'c4', code: 'CRG21', label: 'Telecommunications Racks', length_cm: 120, width_cm: 120, height_cm: 120, weight_kg: 700, quantity: 2, color: '#7c3aed', status: 'Loaded', destination: 'Sydney, NSW', gridSlot: { row: 1, col: 0, tier: 0 }, placements: [{ x: 620, y: 50, z: 50 }] },
      { id: 'c5', code: 'CRG12', label: 'Optical Network Hardware', length_cm: 100, width_cm: 80, height_cm: 90, weight_kg: 300, quantity: 3, color: '#059669', status: 'Loaded', destination: 'Sydney, NSW', gridSlot: { row: 1, col: 1, tier: 0 }, placements: [{ x: 750, y: 50, z: 50 }] },
      { id: 'c6', code: 'CRG14', label: 'Heavy Industrial Transformers', length_cm: 140, width_cm: 110, height_cm: 130, weight_kg: 950, quantity: 2, color: '#d97706', status: 'Loaded', destination: 'Sydney, NSW', gridSlot: { row: 1, col: 2, tier: 0 }, placements: [{ x: 890, y: 50, z: 50 }] },
      { id: 'c7', code: 'CRG19', label: 'Server Blade Assemblies', length_cm: 110, width_cm: 90, height_cm: 100, weight_kg: 450, quantity: 3, color: '#ea580c', status: 'Loaded', destination: 'Sydney, NSW', gridSlot: { row: 1, col: 3, tier: 0 }, placements: [{ x: 1020, y: 50, z: 50 }] },
      { id: 'c8', code: 'CRG15B', label: 'Automotive Engine Castings', length_cm: 160, width_cm: 120, height_cm: 140, weight_kg: 1500, quantity: 2, color: '#dc2626', status: 'Loaded', destination: 'Sydney, NSW', gridSlot: { row: 2, col: 0, tier: 0 }, placements: [{ x: 1160, y: 50, z: 50 }] },
      { id: 'c9', code: 'CRG096', label: 'Lithium Battery Packs', length_cm: 120, width_cm: 80, height_cm: 70, weight_kg: 156, quantity: 6, color: '#10b981', status: 'Delivered', destination: 'Sydney, NSW', gridSlot: { row: 2, col: 1, tier: 0 }, placements: [] },
      { id: 'c10', code: 'CRG065', label: 'Refrigerated Pharma Crates', length_cm: 180, width_cm: 100, height_cm: 90, weight_kg: 260, quantity: 4, color: '#f59e0b', status: 'In Transit', destination: 'Melbourne, VIC', gridSlot: { row: 2, col: 2, tier: 0 }, placements: [] },
      { id: 'c11', code: 'CRG134', label: 'Semiconductor Silicon Wafers', length_cm: 100, width_cm: 70, height_cm: 60, weight_kg: 120, quantity: 5, color: '#06b6d4', status: 'Delivered', destination: 'Sydney, NSW', gridSlot: { row: 2, col: 3, tier: 0 }, placements: [] },
    ],
  },
  {
    id: 'scania-r500-v8',
    name: 'Scania R500 V8 Streamline',
    plate_number: 'B 5678 DEF',
    vin: 'YS2R6X20005829104',
    make: 'Scania',
    model: 'R500 V8',
    year: 2023,
    type: 'SEMI_TRACTOR',
    ownership: 'OWNED',
    status: 'ON_ROUTE',
    statusLabel: 'On Route',
    photoUrl: '/images/freight/scania-r500.jpg',
    category: 'Heavy Truck',
    specs: {
      maxWeightKg: 28000,
      currentWeightKg: 22100,
      weightDeltaPct: 8,
      currentSpeedKmh: 82,
      fuelUsedL: 310,
      fuelLevelPct: 74,
      tripsCompleted: 14,
      mileageKm: 345620,
      engineHours: 7210,
      nextServiceKm: 3400,
      containerLengthCm: 1360,
      containerWidthCm: 248,
      containerHeightCm: 270,
      loadCapacityPct: 78,
      tempC: -18,
    },
    driver: {
      id: 'DRV-1029',
      name: 'Noah Bennett',
      phone: '+61 433 912 455',
      licenseNo: 'LIC-VIC-458120',
      sinceYear: 2018,
      rating: 4.8,
    },
    activeTrip: {
      id: 'TRP-MEL-8842',
      loadId: 'CRG412',
      origin: 'Port Melbourne Terminal',
      destination: 'Albury Freight Hub',
      distanceKm: 325,
      remainingKm: 94,
      timeSpent: '4h 30m',
      etaMinutes: 65,
      progressPct: 71,
      status: 'On Track',
      waypoints: [
        { name: 'Port Melbourne', time: '07:00 AM', passed: true },
        { name: 'Seymour Bypass', time: '09:15 AM', passed: true },
        { name: 'Euroa Highway Stop', time: '11:00 AM', passed: true },
        { name: 'Albury Freight Hub', time: '01:30 PM', passed: false },
      ],
    },
    systemHealth: { engine: 'Healthy', brakes: 'Healthy', tires: 'Healthy', battery: 'Healthy', transmission: 'Healthy' },
    recentAlerts: [
      { id: 'ALT-S1', type: 'Speed Advisory', title: 'En route average speed optimal at 82 km/h', time: '10 mins ago', severity: 'low' },
    ],
    documents: [
      { id: 'DOC-S1', title: 'Heavy Vehicle Accreditation', size: '44 kB', type: 'PDF', expiryDate: '2028-02-14' },
      { id: 'DOC-S2', title: 'Cold Chain Compliance SLA', size: '89 kB', type: 'PDF', expiryDate: '2027-05-19' },
    ],
    cargoItems: [
      { id: 'sc1', code: 'FZN01', label: 'Deep Frozen Seafood Pallets', length_cm: 120, width_cm: 100, height_cm: 120, weight_kg: 850, quantity: 12, color: '#0284c7', status: 'Loaded', destination: 'Albury Hub', placements: [{ x: 120, y: 50, z: 50 }, { x: 260, y: 50, z: 50 }] },
      { id: 'sc2', code: 'FZN02', label: 'Premium Dairy Butter Boxes', length_cm: 120, width_cm: 80, height_cm: 100, weight_kg: 620, quantity: 10, color: '#38bdf8', status: 'Loaded', destination: 'Albury Hub', placements: [{ x: 400, y: 50, z: 50 }] },
    ],
  },
  {
    id: 'ford-transit-cargo-2024',
    name: 'Ford Transit Cargo 2024',
    plate_number: 'B 2345 JKL',
    vin: '1FTBR1Y80PKA99214',
    make: 'Ford',
    model: 'Transit 350 High Roof',
    year: 2024,
    type: 'VAN',
    ownership: 'LEASED',
    status: 'OUT_FOR_ORDER',
    statusLabel: 'Out for order',
    photoUrl: '/images/freight/ford-transit.jpg',
    category: 'Cargo Van',
    specs: {
      maxWeightKg: 2209,
      currentWeightKg: 1502,
      weightDeltaPct: 5,
      currentSpeedKmh: 48,
      fuelUsedL: 42,
      fuelLevelPct: 82,
      tripsCompleted: 345,
      mileageKm: 56234,
      engineHours: 1950,
      nextServiceKm: 4200,
      containerLengthCm: 340,
      containerWidthCm: 178,
      containerHeightCm: 188,
      loadCapacityPct: 68,
      tempC: 18,
    },
    driver: {
      id: 'DRV-987623',
      name: 'Bessie Cooper',
      phone: '+1 (415) 882-9014',
      licenseNo: 'DL-CA-9938210',
      sinceYear: 2020,
      rating: 4.95,
    },
    activeTrip: {
      id: 'TRP-SFO-9912',
      loadId: 'ORD-7741',
      origin: 'Recology, San Mateo CA',
      destination: '1226 Dr. Menlo Park Road, CA',
      distanceKm: 42,
      remainingKm: 8,
      timeSpent: '1h 15m',
      etaMinutes: 22,
      progressPct: 80,
      status: 'On Track',
      notes: 'As we prepare for our upcoming move, please handle delicate architectural models with extra padding and verify door clearance on arrival.',
      waypoints: [
        { name: 'San Mateo Depot', time: '10:00 AM', passed: true },
        { name: 'Everton Hub', time: '10:35 AM', passed: true },
        { name: 'Menlo Park site', time: '11:15 AM', passed: false },
      ],
    },
    systemHealth: { engine: 'Healthy', brakes: 'Healthy', tires: 'Healthy', battery: 'Healthy', transmission: 'Healthy' },
    recentAlerts: [
      { id: 'ALT-T1', type: 'Check-in Confirmed', title: 'Last check-in 08:30am (12.02.24)', time: '08:30 AM', severity: 'info' },
    ],
    documents: [
      { id: 'DOC-T1', title: 'National ID Card', size: '32.5 kB', type: 'PDF', expiryDate: '2029-06-30' },
      { id: 'DOC-T2', title: 'Commercial Driving License', size: '32.5 kB', type: 'PDF', expiryDate: '2027-10-14' },
      { id: 'DOC-T3', title: 'Customer SLA Document', size: '32.5 kB', type: 'PDF', expiryDate: '2026-12-31' },
    ],
    cargoItems: [
      { id: 'ft1', code: 'PKG01', label: 'Architectural Presentation Models', length_cm: 100, width_cm: 80, height_cm: 70, weight_kg: 240, quantity: 2, color: '#2563eb', status: 'Loaded', destination: 'Menlo Park', placements: [{ x: 60, y: 30, z: 30 }] },
      { id: 'ft2', code: 'PKG02', label: 'Office CAD Workstations', length_cm: 90, width_cm: 60, height_cm: 60, weight_kg: 320, quantity: 4, color: '#3b82f6', status: 'Loaded', destination: 'Menlo Park', placements: [{ x: 180, y: 30, z: 30 }] },
      { id: 'ft3', code: 'PKG03', label: 'Drafting Table & Equipment', length_cm: 140, width_cm: 80, height_cm: 90, weight_kg: 410, quantity: 1, color: '#1d4ed8', status: 'Loaded', destination: 'Menlo Park', placements: [{ x: 280, y: 30, z: 30 }] },
    ],
  },
  {
    id: 'sprinter-316-cdi',
    name: 'Mercedes Sprinter 316 CDI',
    plate_number: 'SDN-0145236',
    vin: 'WDB9066331P849201',
    make: 'Mercedes-Benz',
    model: 'Sprinter 316 CDI',
    year: 2023,
    type: 'VAN',
    ownership: 'OWNED',
    status: 'ON_ROUTE',
    statusLabel: 'On Route',
    photoUrl: '/images/freight/sprinter-van.jpg',
    category: 'Cargo Van',
    specs: {
      maxWeightKg: 3500,
      currentWeightKg: 2180,
      weightDeltaPct: 3,
      currentSpeedKmh: 68,
      fuelUsedL: 65,
      fuelLevelPct: 75,
      tripsCompleted: 215,
      mileageKm: 89400,
      engineHours: 2480,
      nextServiceKm: 5600,
      containerLengthCm: 430,
      containerWidthCm: 180,
      containerHeightCm: 195,
      loadCapacityPct: 62,
    },
    driver: {
      id: 'DRV-4412',
      name: 'Liam Harper',
      phone: '+61 422 104 998',
      licenseNo: 'LIC-NSW-551092',
      sinceYear: 2021,
      rating: 4.88,
    },
    activeTrip: {
      id: 'TRP-SYD-1190',
      loadId: 'CRG552',
      origin: 'Mascot Airport Logistics Park',
      destination: 'North Sydney Tech Quarter',
      distanceKm: 28,
      remainingKm: 9,
      timeSpent: '45m',
      etaMinutes: 20,
      progressPct: 67,
      status: 'On Track',
      waypoints: [
        { name: 'Mascot Logistics Park', time: '01:00 PM', passed: true },
        { name: 'Sydney Harbour Tunnel', time: '01:30 PM', passed: true },
        { name: 'North Sydney Tech Quarter', time: '02:00 PM', passed: false },
      ],
    },
    systemHealth: { engine: 'Healthy', brakes: 'Healthy', tires: 'Healthy', battery: 'Healthy', transmission: 'Healthy' },
    recentAlerts: [],
    documents: [
      { id: 'DOC-SP1', title: 'Road Transport Authority Certificate', size: '36 kB', type: 'PDF', expiryDate: '2028-09-30' },
    ],
    cargoItems: [
      { id: 'sp1', code: 'AIR01', label: 'Air Express Courier Cartons', length_cm: 80, width_cm: 60, height_cm: 50, weight_kg: 180, quantity: 8, color: '#0ea5e9', status: 'Loaded', destination: 'North Sydney', placements: [{ x: 80, y: 40, z: 40 }] },
    ],
  },
  {
    id: 'canter-125',
    name: 'Mitsubishi Canter 125',
    plate_number: 'SDN-0526348',
    vin: 'FEB71ER-520194',
    make: 'Mitsubishi Fuso',
    model: 'Canter 125 Box',
    year: 2022,
    type: 'BOX_TRUCK',
    ownership: 'OWNED',
    status: 'LOADING',
    statusLabel: 'Loading',
    photoUrl: '/images/freight/canter-truck.jpg',
    category: 'Medium Truck',
    specs: {
      maxWeightKg: 7500,
      currentWeightKg: 4200,
      weightDeltaPct: 0,
      currentSpeedKmh: 0,
      fuelUsedL: 110,
      fuelLevelPct: 88,
      tripsCompleted: 142,
      mileageKm: 67891,
      engineHours: 3120,
      nextServiceKm: 2100,
      containerLengthCm: 550,
      containerWidthCm: 220,
      containerHeightCm: 225,
      loadCapacityPct: 56,
    },
    driver: {
      id: 'DRV-7718',
      name: 'Lucas Reed',
      phone: '+61 411 776 542',
      licenseNo: 'LIC-NSW-338291',
      sinceYear: 2020,
      rating: 4.75,
    },
    activeTrip: {
      id: 'TRP-CAN-4421',
      loadId: 'CRG881',
      origin: 'Chullora Distribution Yard',
      destination: 'Wollongong Commercial Harbor',
      distanceKm: 85,
      remainingKm: 85,
      timeSpent: '0m',
      etaMinutes: 90,
      progressPct: 10,
      status: 'Loading',
      notes: 'Pallet loading currently underway at Bay 4.',
      waypoints: [
        { name: 'Chullora Yard', time: 'Loading', passed: true },
        { name: 'Bulli Pass', time: 'Pending', passed: false },
        { name: 'Wollongong Harbor', time: 'Pending', passed: false },
      ],
    },
    systemHealth: { engine: 'Healthy', brakes: 'Healthy', tires: 'Healthy', battery: 'Healthy', transmission: 'Healthy' },
    recentAlerts: [
      { id: 'ALT-C1', type: 'Bay Assigned', title: 'Docking bay 04 cleared for heavy pallet loading', time: '15 mins ago', severity: 'info' },
    ],
    documents: [
      { id: 'DOC-C1', title: 'Medium Rigid (MR) Commercial Endorsement', size: '40 kB', type: 'PDF', expiryDate: '2028-04-18' },
    ],
    cargoItems: [
      { id: 'ct1', code: 'PRD01', label: 'Beverage & Bottling Crates', length_cm: 120, width_cm: 100, height_cm: 110, weight_kg: 650, quantity: 6, color: '#f97316', status: 'Loaded', destination: 'Wollongong', placements: [{ x: 120, y: 50, z: 50 }] },
    ],
  },
  {
    id: 'isuzu-dmax-lsu',
    name: 'Isuzu D-Max LS-U Utility',
    plate_number: 'SDN-0675123',
    vin: 'MPATFS85JNT021948',
    make: 'Isuzu',
    model: 'D-Max LS-U Crew Cab',
    year: 2024,
    type: 'PICKUP',
    ownership: 'OWNED',
    status: 'AVAILABLE',
    statusLabel: 'Available for assign',
    photoUrl: '/images/freight/isuzu-pickup.jpg',
    category: 'Utility Pickup',
    specs: {
      maxWeightKg: 1200,
      currentWeightKg: 320,
      weightDeltaPct: -2,
      currentSpeedKmh: 0,
      fuelUsedL: 28,
      fuelLevelPct: 92,
      tripsCompleted: 88,
      mileageKm: 24190,
      engineHours: 890,
      nextServiceKm: 5800,
      containerLengthCm: 155,
      containerWidthCm: 153,
      containerHeightCm: 90,
      loadCapacityPct: 25,
    },
    driver: {
      id: 'DRV-5501',
      name: 'Oliver Hayes',
      phone: '+61 405 321 789',
      licenseNo: 'LIC-NSW-112940',
      sinceYear: 2022,
      rating: 4.9,
    },
    activeTrip: {
      id: 'TRP-UTL-009',
      loadId: 'CRG119',
      origin: 'Penrith Regional Staging',
      destination: 'Blue Mountains Field Station',
      distanceKm: 54,
      remainingKm: 54,
      timeSpent: '0m',
      etaMinutes: 50,
      progressPct: 0,
      status: 'Scheduled',
      waypoints: [
        { name: 'Penrith Staging', time: 'Standby', passed: true },
        { name: 'Katoomba Lookout', time: 'Pending', passed: false },
      ],
    },
    systemHealth: { engine: 'Healthy', brakes: 'Healthy', tires: 'Healthy', battery: 'Healthy', transmission: 'Healthy' },
    recentAlerts: [],
    documents: [
      { id: 'DOC-U1', title: 'Fleet Safety Inspection Report', size: '28 kB', type: 'PDF', expiryDate: '2027-11-20' },
    ],
    cargoItems: [
      { id: 'ut1', code: 'TLS01', label: 'Field Calibration Survey Kit', length_cm: 80, width_cm: 60, height_cm: 40, weight_kg: 85, quantity: 2, color: '#14b8a6', status: 'Loaded', destination: 'Blue Mountains', placements: [{ x: 50, y: 30, z: 20 }] },
    ],
  },
];

export function getFleetVehicleById(id?: string): FleetVehicle {
  if (!id) return FLEET_VEHICLES[0];
  const query = id.toLowerCase().trim();
  const exact = FLEET_VEHICLES.find(v => v.id.toLowerCase() === query || v.plate_number.toLowerCase() === query);
  if (exact) return exact;
  const byMakeOrModel = FLEET_VEHICLES.find(v =>
    v.make.toLowerCase().includes(query) ||
    v.model.toLowerCase().includes(query) ||
    query.includes(v.make.toLowerCase()) ||
    v.type.toLowerCase().includes(query)
  );
  if (byMakeOrModel) return byMakeOrModel;
  return FLEET_VEHICLES[0];
}
