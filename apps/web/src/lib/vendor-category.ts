export function vendorCategory(type: string) {
  const categories: Record<string, { notes: string; hint: string; activity: string; path: string; label: string }> = {
    PARTS_SUPPLIER: { notes: 'Parts supplied & purchasing terms', hint: 'Part families, supported makes, warranty, lead times and agreed purchasing terms', activity: 'Stock items', path: '/tracking/parts', label: 'Spare parts' },
    WORKSHOP: { notes: 'Workshop services & terms', hint: 'Repair specialities, supported makes, service warranty and agreed labour terms', activity: 'Service records', path: '/tracking/maintenance', label: 'Maintenance' },
    FUEL_STATION: { notes: 'Fuel services & account terms', hint: 'Fuel types, locations, fuel-card arrangements and agreed billing terms', activity: 'Fuel logs', path: '/tracking/fuel', label: 'Fuel logs' },
    FINANCING: { notes: 'Finance products & eligibility', hint: 'Eligible vehicles, security requirements and source; record rates only from an actual quotation', activity: 'Finance agreements', path: '/finance/bills', label: 'Finance bills' },
    LEASING: { notes: 'Lease products & responsibilities', hint: 'Vehicle classes, lease options, maintenance responsibilities and source; terms require an agreement', activity: 'Lease agreements', path: '/finance/bills', label: 'Lease bills' },
    VEHICLE_HIRE: { notes: 'Hire fleet & rental terms', hint: 'Vehicle classes, operating areas, driver options and source; availability and rates require confirmation', activity: 'Hire agreements', path: '/tracking/vehicles', label: 'Vehicles' },
    INSURANCE: { notes: 'Cover & claims services', hint: 'Cover types, claims contacts and policy references; premiums and limits require a policy', activity: 'Policies', path: '/tracking/documents', label: 'Insurance documents' },
  };
  const specialities: Record<string, [string, string, string]> = {
    SERVICE_CENTRE: ['Manufacturer servicing', 'Supported makes, authorisation evidence, warranty servicing and booking contacts', '/tracking/maintenance'],
    TYRE_SERVICES: ['Tyres & fitting', 'Tyre sizes, makes, alignment, balancing, retreading and warranty terms', '/tracking/parts'],
    RECOVERY: ['Roadside & recovery', 'Coverage area, emergency contact, hours, towing capacity and call-out terms', '/tracking/issues'],
    BODYWORK: ['Bodywork & fabrication', 'Body and trailer repairs, modifications, supported equipment and warranty', '/tracking/maintenance'],
    AUTO_ELECTRICAL: ['Electrical & diagnostics', 'Diagnostic equipment, supported makes, batteries and electrical specialities', '/tracking/maintenance'],
    TELEMATICS: ['Tracking services', 'Device models, installation, connectivity, subscription terms and support contacts', '/tracking/devices'],
    INSPECTION: ['Inspection & testing', 'Inspection scope, authorisation evidence, report references and booking contacts', '/tracking/documents'],
    VEHICLE_DEALER: ['Vehicle sales', 'Vehicle makes and classes, warranty and after-sales services', '/tracking/vehicles'],
    TRANSPORTER: ['Haulage services', 'Equipment, corridors, operating areas and transporter profile reference', '/tracking/transporters'],
    DRIVER_TRAINING: ['Driver training', 'Courses, licence classes, instructor qualifications and certification evidence', '/tracking/drivers'],
  };
  const service = specialities[type];
  if (service) return { notes: service[0], hint: service[1], activity: 'Linked service records', path: service[2], label: service[0] };
  return categories[type] || { notes: 'Services & agreed terms', hint: 'Services provided and verified commercial terms', activity: 'Expense records', path: '/tracking/expenses/new', label: 'Record expense' };
}
export function vendorActivity(v: { vendor_type: string; maintenance_count?: number; parts_count?: number; fuel_logs_count?: number; expenses_count?: number }) {
  const value = v.vendor_type === 'WORKSHOP' ? v.maintenance_count : v.vendor_type === 'PARTS_SUPPLIER' ? v.parts_count : v.vendor_type === 'FUEL_STATION' ? v.fuel_logs_count : v.vendor_type === 'OTHER' ? v.expenses_count : undefined;
  return value === undefined ? 'Not linked' : String(value);
}
