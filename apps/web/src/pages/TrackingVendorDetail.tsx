import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FLEET_PARTNER_CATEGORIES, type FleetPartnerCategory } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { Icon, type IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { ResponsiveTable } from '../components/ui/responsive-table.js';
import { Banner } from '../components/ui/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { vendorCategory } from '../lib/vendor-category.js';
import './FreightOperations.css';
import './TrackingVendorDetail.css';

interface Vendor {
  id: string;
  tenant_id?: string;
  name: string;
  vendor_type: string;
  service_capabilities?: string[];
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface MaintenanceRecord {
  id: string;
  service_type: string;
  cost: number | null;
  service_date: string;
  next_due_date: string | null;
  vehicle_name?: string;
  vehicle_plate?: string;
}

interface SparePart {
  id: string;
  part_name: string;
  part_number: string | null;
  category: string | null;
  quantity: number;
  unit_cost: number | null;
  reorder_level: number;
}

interface FuelLog {
  id: string;
  liters: number;
  cost: number | null;
  logged_at: string;
  vehicle_name?: string;
  vehicle_plate?: string;
}

interface Expense {
  id: string;
  category: string;
  amount: number;
  expense_date: string;
  description: string | null;
  vehicle_name?: string;
  vehicle_plate?: string;
}

interface VendorDetailData {
  vendor: Vendor;
  maintenance: MaintenanceRecord[];
  parts: SparePart[];
  fuel: FuelLog[];
  expenses: Expense[];
}

interface FleetVehicle {
  id: string;
  name: string;
  plate_number: string;
}

function getVendorCategoryIcon(type: string): IconName {
  switch (type) {
    case 'WORKSHOP':
    case 'BODYWORK':
      return 'tool';
    case 'SERVICE_CENTRE':
      return 'shield';
    case 'PARTS_SUPPLIER':
      return 'package';
    case 'TYRE_SERVICES':
      return 'circle';
    case 'FUEL_STATION':
      return 'zap';
    case 'LEASING':
    case 'FINANCING':
      return 'dollarSign';
    case 'VEHICLE_HIRE':
    case 'VEHICLE_DEALER':
    case 'TRANSPORTER':
    case 'RECOVERY':
      return 'truck';
    case 'INSURANCE':
      return 'shield';
    case 'INSPECTION':
      return 'checkCircle';
    case 'TELEMATICS':
      return 'compass';
    case 'DRIVER_TRAINING':
      return 'userCheck';
    default:
      return 'briefcase';
  }
}

function getVendorTypeMeta(type: string) {
  const match = FLEET_PARTNER_CATEGORIES.find(c => c.type === type);
  return {
    type,
    label: match?.label || type.replace(/_/g, ' '),
    icon: getVendorCategoryIcon(type),
    colorClass: type,
  };
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `TZS ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `TZS ${(amount / 1_000).toFixed(0)}k`;
  return `TZS ${Math.round(amount).toLocaleString()}`;
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink2)',
  display: 'block',
  marginBottom: 4,
};

/* ── MODAL: EDIT VENDOR PARTICULARS ───────────────────────────────────────── */
function EditVendorModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(vendor.name);
  const [vendorType, setVendorType] = useState(vendor.vendor_type);
  const [capabilities, setCapabilities] = useState<string[]>(vendor.service_capabilities || []);
  const [phone, setPhone] = useState(vendor.phone || '');
  const [email, setEmail] = useState(vendor.email || '');
  const [address, setAddress] = useState(vendor.address || '');
  const [notes, setNotes] = useState(vendor.notes || '');
  const [active, setActive] = useState(vendor.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleCap = (cap: string) => {
    setCapabilities(prev => prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Vendor company name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/v1/tracking/vendors/${vendor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          vendor_type: vendorType,
          service_capabilities: capabilities,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          active,
        }),
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update vendor record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogTitle>Edit Vendor Particulars</DialogTitle>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          <div>
            <label style={labelStyle}>Company / Facility Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Primary Classification *</label>
              <Select value={vendorType} onValueChange={setVendorType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FLEET_PARTNER_CATEGORIES.map(c => (
                    <SelectItem key={c.type} value={c.type}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={labelStyle}>Telephone Number</label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+255..." />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Email Address</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@domain.com" />
            </div>
            <div>
              <label style={labelStyle}>Depot / Physical Address</label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Plot, Street, City" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Additional Service Capabilities</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, maxHeight: 150, overflowY: 'auto', padding: 10, background: 'var(--bg)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
              {FLEET_PARTNER_CATEGORIES.filter(c => c.type !== vendorType).map(c => (
                <label key={c.type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <Checkbox checked={capabilities.includes(c.type)} onCheckedChange={() => toggleCap(c.type)} />
                  <span style={{ color: 'var(--ink)' }}>{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Agreed Commercial Terms &amp; Scope Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface))', color: 'var(--ink)', fontFamily: 'inherit' }}
              placeholder="Commercial rates, warranties, account reference, contact persons..."
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <Checkbox id="edit-vendor-active" checked={active} onCheckedChange={checked => setActive(Boolean(checked))} />
            <label htmlFor="edit-vendor-active" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
              Active partner account (operational in fleet modules)
            </label>
          </div>

          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', background: 'var(--red-l)', padding: '8px 12px', borderRadius: 'var(--r-sm)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── MODAL: QUICK EXPENSE ──────────────────────────────────────────────────── */
function QuickExpenseModal({
  vendor,
  vehicles,
  onClose,
  onSaved,
}: {
  vendor: Vendor;
  vehicles: FleetVehicle[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [category, setCategory] = useState('MAINTENANCE');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [billable, setBillable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(amount);
    if (!val || val <= 0) { setError('Please enter a valid expense amount.'); return; }
    if (!vehicleId) { setError('Please select a vehicle asset.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/v1/tracking/vehicles/${vehicleId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          category,
          amount: val,
          expense_date: expenseDate,
          description: description.trim() || `Fleet expense at ${vendor.name}`,
          vendor_id: vendor.id,
          billable,
        }),
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent style={{ maxWidth: 480 }}>
        <DialogTitle>Log Fleet Expense · {vendor.name}</DialogTitle>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          <div>
            <label style={labelStyle}>Fleet Vehicle *</label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle..." /></SelectTrigger>
              <SelectContent>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Expense Category *</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  <SelectItem value="PARTS">Spare Parts</SelectItem>
                  <SelectItem value="FUEL">Fuel &amp; Fluids</SelectItem>
                  <SelectItem value="INSURANCE">Insurance</SelectItem>
                  <SelectItem value="LEASE">Lease / Hire</SelectItem>
                  <SelectItem value="TAX_PERMIT">Tax &amp; Permits</SelectItem>
                  <SelectItem value="TOLL">Toll &amp; Weighbridge</SelectItem>
                  <SelectItem value="OTHER">Other Operational</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={labelStyle}>Amount (TZS) *</label>
              <Input type="number" min="1" step="100" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 250000" required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Expense Date *</label>
              <Input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <Checkbox checked={billable} onCheckedChange={c => setBillable(Boolean(c))} />
                <span style={{ color: 'var(--ink)' }}>Billable to transport job</span>
              </label>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description / Reference Note</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={`Invoice # / service details`} />
          </div>

          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', background: 'var(--red-l)', padding: '8px 12px', borderRadius: 'var(--r-sm)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !amount || !vehicleId}>
              {saving ? 'Recording…' : 'Record Expense'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── MODAL: QUICK MAINTENANCE WORK ORDER ──────────────────────────────────── */
function QuickMaintenanceModal({
  vendor,
  vehicles,
  onClose,
  onSaved,
}: {
  vendor: Vendor;
  vehicles: FleetVehicle[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [serviceType, setServiceType] = useState('ROUTINE_SERVICE');
  const [cost, setCost] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [nextDueDate, setNextDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId) { setError('Please select a vehicle asset.'); return; }
    if (!serviceType) { setError('Service type is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/v1/tracking/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicleId,
          vendor_id: vendor.id,
          service_type: serviceType,
          description: description.trim() || `Workshop service by ${vendor.name}`,
          cost: cost ? Number(cost) : undefined,
          odometer_km: odometerKm ? Number(odometerKm) : undefined,
          service_date: serviceDate,
          next_due_date: nextDueDate || undefined,
          status: 'COMPLETED',
        }),
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record maintenance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent style={{ maxWidth: 500 }}>
        <DialogTitle>Log Workshop Maintenance · {vendor.name}</DialogTitle>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          <div>
            <label style={labelStyle}>Serviced Vehicle *</label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle..." /></SelectTrigger>
              <SelectContent>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Service Category *</label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROUTINE_SERVICE">Routine Scheduled PM</SelectItem>
                  <SelectItem value="OIL_AND_FILTER">Engine Oil &amp; Filter</SelectItem>
                  <SelectItem value="BRAKE_SERVICE">Brake Pads &amp; Discs</SelectItem>
                  <SelectItem value="TYRE_REPLACEMENT">Tyre Change / Alignment</SelectItem>
                  <SelectItem value="TRANSMISSION">Gearbox &amp; Clutch</SelectItem>
                  <SelectItem value="ELECTRICAL">Electrical &amp; Battery</SelectItem>
                  <SelectItem value="BODY_REPAIR">Bodywork &amp; Panel</SelectItem>
                  <SelectItem value="OVERHAUL">Full Engine Overhaul</SelectItem>
                  <SelectItem value="EMERGENCY_REPAIR">Emergency Breakdown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={labelStyle}>Total Cost (TZS)</label>
              <Input type="number" min="0" step="1000" value={cost} onChange={e => setCost(e.target.value)} placeholder="e.g. 450000" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Service Date *</label>
              <Input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Next PM Due Date</label>
              <Input type="date" value={nextDueDate} onChange={e => setNextDueDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Odometer Reading at Service (km)</label>
            <Input type="number" min="0" value={odometerKm} onChange={e => setOdometerKm(e.target.value)} placeholder="e.g. 54200" />
          </div>

          <div>
            <label style={labelStyle}>Work Order Description / Mechanic Notes</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Replaced fuel filter, synthetic oil 5W-30..." />
          </div>

          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', background: 'var(--red-l)', padding: '8px 12px', borderRadius: 'var(--r-sm)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !vehicleId || !serviceType}>
              {saving ? 'Recording…' : 'Save Work Order'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── MODAL: QUICK FUEL LOG ────────────────────────────────────────────────── */
function QuickFuelModal({
  vendor,
  vehicles,
  onClose,
  onSaved,
}: {
  vendor: Vendor;
  vehicles: FleetVehicle[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [liters, setLiters] = useState('');
  const [cost, setCost] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [station, setStation] = useState(vendor.name);
  const [loggedAt, setLoggedAt] = useState(new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const l = Number(liters);
    if (!l || l <= 0) { setError('Please enter valid fuel liters dispensed.'); return; }
    if (!vehicleId) { setError('Please select a vehicle asset.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/v1/tracking/fuel', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicleId,
          vendor_id: vendor.id,
          liters: l,
          cost: cost ? Number(cost) : undefined,
          odometer_km: odometerKm ? Number(odometerKm) : undefined,
          station: station.trim() || vendor.name,
          logged_at: loggedAt ? new Date(loggedAt).toISOString() : new Date().toISOString(),
        }),
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to log fuel dispense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent style={{ maxWidth: 480 }}>
        <DialogTitle>Log Fuel Dispense · {vendor.name}</DialogTitle>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          <div>
            <label style={labelStyle}>Refueled Vehicle *</label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle..." /></SelectTrigger>
              <SelectContent>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name} ({v.plate_number})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Volume (Liters) *</label>
              <Input type="number" min="0.1" step="0.1" value={liters} onChange={e => setLiters(e.target.value)} placeholder="e.g. 75.5" required />
            </div>
            <div>
              <label style={labelStyle}>Total Cost (TZS)</label>
              <Input type="number" min="0" step="500" value={cost} onChange={e => setCost(e.target.value)} placeholder="e.g. 245000" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Odometer Reading (km)</label>
              <Input type="number" min="0" value={odometerKm} onChange={e => setOdometerKm(e.target.value)} placeholder="e.g. 54200" />
            </div>
            <div>
              <label style={labelStyle}>Station / Pump Facility</label>
              <Input value={station} onChange={e => setStation(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Dispense Date &amp; Time *</label>
            <Input type="datetime-local" value={loggedAt} onChange={e => setLoggedAt(e.target.value)} required />
          </div>

          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', background: 'var(--red-l)', padding: '8px 12px', borderRadius: 'var(--r-sm)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !liters || !vehicleId}>
              {saving ? 'Recording…' : 'Record Dispense'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── MODAL: QUICK PART CATALOGING ─────────────────────────────────────────── */
function QuickPartModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [category, setCategory] = useState('FILTERS');
  const [quantity, setQuantity] = useState('10');
  const [unitCost, setUnitCost] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName.trim()) { setError('Part description/name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/v1/tracking/parts', {
        method: 'POST',
        body: JSON.stringify({
          part_name: partName.trim(),
          part_number: partNumber.trim() || undefined,
          category,
          quantity: Number(quantity) || 0,
          unit_cost: unitCost ? Number(unitCost) : undefined,
          reorder_level: Number(reorderLevel) || 5,
          vendor_id: vendor.id,
        }),
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to catalog spare part.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent style={{ maxWidth: 480 }}>
        <DialogTitle>Stock Spare Part · {vendor.name}</DialogTitle>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          <div>
            <label style={labelStyle}>Part Name &amp; Description *</label>
            <Input value={partName} onChange={e => setPartName(e.target.value)} placeholder="e.g. Heavy Duty Oil Filter LF16015" required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Part SKU / Number</label>
              <Input value={partNumber} onChange={e => setPartNumber(e.target.value)} placeholder="OEM Part #" />
            </div>
            <div>
              <label style={labelStyle}>Component Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FILTERS">Filters &amp; Intakes</SelectItem>
                  <SelectItem value="BRAKES">Brakes &amp; Hydraulics</SelectItem>
                  <SelectItem value="TYRES">Tyres &amp; Wheels</SelectItem>
                  <SelectItem value="ENGINE">Engine &amp; Cooling</SelectItem>
                  <SelectItem value="ELECTRICAL">Electrical &amp; Lighting</SelectItem>
                  <SelectItem value="SUSPENSION">Suspension &amp; Steering</SelectItem>
                  <SelectItem value="LUBRICANTS">Oils &amp; Lubricants</SelectItem>
                  <SelectItem value="BODY">Body &amp; Hardware</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div>
              <label style={labelStyle}>Initial Units</label>
              <Input type="number" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Unit Cost (TZS)</label>
              <Input type="number" min="0" step="500" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="e.g. 45000" />
            </div>
            <div>
              <label style={labelStyle}>Reorder Alert</label>
              <Input type="number" min="1" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} required />
            </div>
          </div>

          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', background: 'var(--red-l)', padding: '8px 12px', borderRadius: 'var(--r-sm)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !partName.trim()}>
              {saving ? 'Stocking…' : 'Add to Warehouse'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
   MAIN COMPONENT: TRACKING VENDOR DETAIL (UX & UI Lead Redesign)
   ========================================================================= */
export const TrackingVendorDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<VendorDetailData | null>(null);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'maintenance' | 'parts' | 'fuel' | 'expenses'>('overview');

  // Modals state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [showPartModal, setShowPartModal] = useState(false);

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    apiFetch(`/v1/tracking/vendors/${id}`)
      .then(res => setData(res as VendorDetailData))
      .catch(e => setError(e.message || 'Could not load vendor particulars.'))
      .finally(() => setLoading(false));

    apiFetch('/v1/tracking/vehicles')
      .then((res: any) => setVehicles(Array.isArray(res) ? res : (res?.data ?? [])))
      .catch(() => setVehicles([]));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  async function handleDelete() {
    if (!data) return;
    if (!(await showConfirm(`Remove vendor "${data.vendor.name}"? Linked vehicle, parts, and fuel logs will be preserved.`, { confirmLabel: 'Remove Vendor' }))) {
      return;
    }
    try {
      await apiFetch(`/v1/tracking/vendors/${data.vendor.id}`, { method: 'DELETE' });
      navigate('/tracking/vendors');
    } catch (err: any) {
      setError(err.message || 'Failed to remove vendor.');
    }
  }

  if (loading) {
    return (
      <div className="freight-workspace">
        <PageHeader
          crumbs={['HuduFreight', 'Vehicle Vendors']}
          titlePlain="Vendor"
          titleEm="dossier."
          backTo="/tracking/vendors"
          backLabel="Vendors"
        />
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)' }}>
          Loading vendor particulars…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="freight-workspace">
        <PageHeader
          crumbs={['HuduFreight', 'Vehicle Vendors']}
          titlePlain="Vendor"
          titleEm="dossier."
          backTo="/tracking/vendors"
          backLabel="Vendors"
        />
        <Banner variant="error">{error || 'Vendor profile not found.'}</Banner>
      </div>
    );
  }

  const { vendor, maintenance, parts, fuel, expenses } = data;
  const category = vendorCategory(vendor.vendor_type);
  const meta = getVendorTypeMeta(vendor.vendor_type);

  // Financial & Operational Aggregates
  const totalMaintenanceCost = maintenance.reduce((sum, m) => sum + (m.cost ?? 0), 0);
  const totalFuelCost = fuel.reduce((sum, f) => sum + (f.cost ?? 0), 0);
  const totalExpensesCost = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSpend = totalMaintenanceCost + totalFuelCost + totalExpensesCost;
  const totalEngagements = maintenance.length + parts.length + fuel.length + expenses.length;
  const totalPartsValue = parts.reduce((sum, p) => sum + (p.quantity * (p.unit_cost ?? 0)), 0);

  // Dynamic Contextual Subtitle
  const getContextSubtitle = () => {
    switch (vendor.vendor_type) {
      case 'LEASING':
      case 'FINANCING':
        return `Commercial Fleet Partner · Vehicle asset financing, full-maintenance leasing, and capital facilities.`;
      case 'WORKSHOP':
      case 'SERVICE_CENTRE':
        return `Authorized Fleet Service Facility · Scheduled maintenance, mechanical repairs, and overhaul work orders.`;
      case 'PARTS_SUPPLIER':
      case 'TYRE_SERVICES':
        return `Fleet Spare Parts Supplier · OEM & aftermarket inventory, warehouse catalog, and supply chain fulfillment.`;
      case 'FUEL_STATION':
        return `Designated Fueling Station · Commercial bunkering, dispense logs, and fleet fuel card integration.`;
      case 'VEHICLE_HIRE':
        return `Fleet Rental & Auxiliary Capacity · Temporary vehicle hire, replacement equipment, and spot contracts.`;
      case 'INSURANCE':
        return `Fleet Underwriter & Risk Carrier · Policy coverage, transit insurance, and comprehensive hull protection.`;
      default:
        return `Registered fleet service provider (${meta.label}) — category-specific services and recorded activity.`;
    }
  };

  return (
    <div className="trk-vendor-detail-container">
      {/* Active Modals */}
      {showEditModal && (
        <EditVendorModal
          vendor={vendor}
          onClose={() => setShowEditModal(false)}
          onSaved={reload}
        />
      )}

      {showExpenseModal && (
        <QuickExpenseModal
          vendor={vendor}
          vehicles={vehicles}
          onClose={() => setShowExpenseModal(false)}
          onSaved={reload}
        />
      )}

      {showMaintenanceModal && (
        <QuickMaintenanceModal
          vendor={vendor}
          vehicles={vehicles}
          onClose={() => setShowMaintenanceModal(false)}
          onSaved={reload}
        />
      )}

      {showFuelModal && (
        <QuickFuelModal
          vendor={vendor}
          vehicles={vehicles}
          onClose={() => setShowFuelModal(false)}
          onSaved={reload}
        />
      )}

      {showPartModal && (
        <QuickPartModal
          vendor={vendor}
          onClose={() => setShowPartModal(false)}
          onSaved={reload}
        />
      )}

      {/* Top Page Header with Standard Hudumika Heading Hierarchy */}
      <PageHeader
        crumbs={['HuduFreight', 'Vehicle Vendors', vendor.name]}
        titlePlain="Vendor"
        titleEm="dossier."
        backTo="/tracking/vendors"
        backLabel="Vendors"
        subtitle={getContextSubtitle()}
        actions={
          <div className="trk-vd-header-actions">
            <Button variant="outline" asChild>
              <Link to="/finance/bills" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="fileText" size={14} /> FinOps Bills
              </Link>
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowEditModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="edit" size={14} /> Edit Details
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="plus" size={14} /> Record Entry <Icon name="chevronDown" size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" style={{ minWidth: 200 }}>
                <DropdownMenuItem onClick={() => setShowExpenseModal(true)}>
                  <Icon name="dollarSign" size={14} style={{ marginRight: 8 }} /> Log Fleet Expense
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowMaintenanceModal(true)}>
                  <Icon name="tool" size={14} style={{ marginRight: 8 }} /> Log Work Order / Service
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowFuelModal(true)}>
                  <Icon name="zap" size={14} style={{ marginRight: 8 }} /> Log Fuel Dispense
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowPartModal(true)}>
                  <Icon name="package" size={14} style={{ marginRight: 8 }} /> Stock Spare Part
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              onClick={handleDelete}
              style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="trash" size={14} /> Remove
            </Button>
          </div>
        }
      />

      {/* Executive Vendor Dossier Hero Card */}
      <div className="trk-vd-dossier-card">
        <div className="trk-vd-dossier-main">
          {/* Category Insignia */}
          <div className={`trk-vd-avatar-lg ${meta.colorClass}`}>
            <Icon name={meta.icon} size={32} />
          </div>

          {/* Central Particulars */}
          <div className="trk-vd-hero-meta">
            <div className="trk-vd-name-row">
              <h1 className="trk-vd-name">{vendor.name}</h1>
              <div className="trk-vd-badges">
                <span className={`trk-vd-status-badge ${vendor.active ? 'is-active' : 'is-inactive'}`}>
                  {vendor.active && <span className="trk-vd-pulse-dot" />}
                  {vendor.active ? 'Active Partner' : 'Inactive'}
                </span>
                <span className="trk-vd-category-pill">{meta.label}</span>
                {vendor.service_capabilities?.map(cap => (
                  <span key={cap} className="trk-vd-capability-tag">
                    {getVendorTypeMeta(cap).label}
                  </span>
                ))}
              </div>
            </div>

            {/* Contact Pills */}
            <div className="trk-vd-contact-pills">
              {vendor.phone ? (
                <div className="trk-vd-contact-pill">
                  <Icon name="phone" size={14} color="var(--teal)" />
                  <a href={`tel:${vendor.phone}`}>{vendor.phone}</a>
                </div>
              ) : (
                <div className="trk-vd-contact-pill" style={{ color: 'var(--ink3)' }}>
                  <Icon name="phone" size={14} />
                  <span>No phone recorded</span>
                </div>
              )}

              {vendor.email && (
                <div className="trk-vd-contact-pill">
                  <Icon name="mail" size={14} color="var(--teal)" />
                  <a href={`mailto:${vendor.email}`}>{vendor.email}</a>
                </div>
              )}

              {vendor.address && (
                <div className="trk-vd-contact-pill">
                  <Icon name="mapPin" size={14} color="var(--teal)" />
                  <span>{vendor.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Direct Communications Box */}
          <div className="trk-vd-direct-comms">
            {vendor.phone && (
              <a href={`tel:${vendor.phone}`} className="trk-vd-comm-btn primary">
                <Icon name="phone" size={14} /> Call Facility
              </a>
            )}
            {vendor.email && (
              <a href={`mailto:${vendor.email}`} className="trk-vd-comm-btn">
                <Icon name="mail" size={14} color="var(--teal)" /> Send Email
              </a>
            )}
          </div>
        </div>

        {/* Integrated Quick-Action Bar */}
        <div className="trk-vd-quick-actions-bar">
          <div className="trk-vd-action-group">
            <button type="button" className="trk-vd-btn primary" onClick={() => setShowExpenseModal(true)}>
              <Icon name="dollarSign" size={13} /> + Expense
            </button>
            <button type="button" className="trk-vd-btn" onClick={() => setShowMaintenanceModal(true)}>
              <Icon name="tool" size={13} color="var(--teal)" /> + Work Order
            </button>
            <button type="button" className="trk-vd-btn" onClick={() => setShowFuelModal(true)}>
              <Icon name="zap" size={13} color="var(--gold)" /> + Fuel
            </button>
            <button type="button" className="trk-vd-btn" onClick={() => setShowPartModal(true)}>
              <Icon name="package" size={13} color="var(--teal)" /> + Part
            </button>
            <button type="button" className="trk-vd-btn" onClick={() => setShowEditModal(true)}>
              <Icon name="edit" size={13} /> Edit Particulars
            </button>
          </div>

          <div className="trk-vd-meta-info">
            <span>Enrolled: {new Date(vendor.created_at).toLocaleDateString()}</span>
            <span>·</span>
            <span>Profile Updated: {new Date(vendor.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* 4-Metric Executive KPI Grid */}
      <div className="trk-vd-kpi-grid">
        {/* Metric 1: Total Recorded Spend */}
        <div className="trk-vd-kpi-card spend">
          <div className="trk-vd-kpi-top">
            <span className="trk-vd-kpi-lbl">TOTAL SPEND (LIFETIME)</span>
            <Icon name="dollarSign" size={16} className="trk-vd-kpi-icon" />
          </div>
          <div className="trk-vd-kpi-val">{formatCurrency(totalSpend)}</div>
          <div className="trk-vd-kpi-sub">
            {totalSpend > 0 ? 'Maintenance, fuel & direct expenses' : 'No recorded financial balance'}
          </div>
        </div>

        {/* Metric 2: Operational Engagements */}
        <div className="trk-vd-kpi-card records">
          <div className="trk-vd-kpi-top">
            <span className="trk-vd-kpi-lbl">RECORDED OPERATIONS</span>
            <Icon name="clipboardList" size={16} className="trk-vd-kpi-icon" />
          </div>
          <div className="trk-vd-kpi-val">{totalEngagements} Records</div>
          <div className="trk-vd-kpi-sub">
            {maintenance.length} work orders · {parts.length} parts · {fuel.length} fuel logs
          </div>
        </div>

        {/* Metric 3: Specialization */}
        <div className="trk-vd-kpi-card category">
          <div className="trk-vd-kpi-top">
            <span className="trk-vd-kpi-lbl">SPECIALIZATION</span>
            <Icon name="tag" size={16} className="trk-vd-kpi-icon" />
          </div>
          <div className="trk-vd-kpi-val" style={{ fontSize: 18 }}>{meta.label}</div>
          <div className="trk-vd-kpi-sub">
            {vendor.service_capabilities?.length ? `${vendor.service_capabilities.length} verified capabilities` : 'Commercial fleet partner'}
          </div>
        </div>

        {/* Metric 4: Account Status & Terms */}
        <div className="trk-vd-kpi-card compliance">
          <div className="trk-vd-kpi-top">
            <span className="trk-vd-kpi-lbl">CONTRACT STATUS</span>
            <Icon name="shield" size={16} className="trk-vd-kpi-icon" />
          </div>
          <div className="trk-vd-kpi-val" style={{ fontSize: 18, color: vendor.active ? 'var(--green)' : 'var(--ink3)' }}>
            {vendor.active ? 'Active Partner' : 'Inactive'}
          </div>
          <div className="trk-vd-kpi-sub">
            Invoiced via FinOps supplier ledger
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={v => setActiveTab(v as any)}
        variant="segmented"
      >
        <TabsList wrap>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance History ({maintenance.length})</TabsTrigger>
          <TabsTrigger value="parts">Parts Catalog ({parts.length})</TabsTrigger>
          <TabsTrigger value="fuel">Fuel Dispenses ({fuel.length})</TabsTrigger>
          <TabsTrigger value="expenses">Logged Expenses ({expenses.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── TAB 1: OVERVIEW & PARTICULARS ──────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="trk-vd-overview-grid">
          {/* Facility Particulars Card */}
          <SectionCard
            title="Facility &amp; Commercial Particulars"
            action={
              <Button size="sm" variant="outline" onClick={() => setShowEditModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="edit" size={13} /> Edit
              </Button>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="trk-vd-prop-row">
                <span className="trk-vd-prop-label">Company Name</span>
                <span className="trk-vd-prop-value">{vendor.name}</span>
              </div>
              <div className="trk-vd-prop-row">
                <span className="trk-vd-prop-label">Primary Role</span>
                <span className="trk-vd-prop-value">{meta.label}</span>
              </div>
              <div className="trk-vd-prop-row">
                <span className="trk-vd-prop-label">Additional Services</span>
                <span className="trk-vd-prop-value">
                  {vendor.service_capabilities?.length
                    ? vendor.service_capabilities.map(type => getVendorTypeMeta(type).label).join(' · ')
                    : 'None specified'}
                </span>
              </div>
              <div className="trk-vd-prop-row">
                <span className="trk-vd-prop-label">Telephone</span>
                <span className="trk-vd-prop-value">
                  {vendor.phone ? <a href={`tel:${vendor.phone}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{vendor.phone}</a> : '—'}
                </span>
              </div>
              <div className="trk-vd-prop-row">
                <span className="trk-vd-prop-label">Email Address</span>
                <span className="trk-vd-prop-value">
                  {vendor.email ? <a href={`mailto:${vendor.email}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{vendor.email}</a> : '—'}
                </span>
              </div>
              <div className="trk-vd-prop-row">
                <span className="trk-vd-prop-label">Depot / Physical Address</span>
                <span className="trk-vd-prop-value">{vendor.address || '—'}</span>
              </div>
              <div className="trk-vd-prop-row">
                <span className="trk-vd-prop-label">Account Status</span>
                <span className="trk-vd-prop-value">
                  <Badge variant={vendor.active ? 'success' : 'gray'}>
                    {vendor.active ? 'Active Partner' : 'Inactive Record'}
                  </Badge>
                </span>
              </div>
              <div className="trk-vd-prop-row">
                <span className="trk-vd-prop-label">Enrolled Date</span>
                <span className="trk-vd-prop-value">{new Date(vendor.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </SectionCard>

          {/* Commercial Terms & FinOps Integration */}
          <SectionCard title="Agreed Terms &amp; FinOps Integration">
            <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{category.notes}:</div>
              <p style={{ margin: '0 0 14px', background: 'var(--bg)', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                {vendor.notes || 'No custom commercial terms or service agreement logged. Click "Edit" to record terms.'}
              </p>

              <div style={{ background: 'var(--bg)', padding: 14, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                  <Icon name="checkCircle" size={16} color="var(--green)" />
                  <span>Central FinOps Supplier Ledger</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: 0 }}>
                  Supplier bills, payment vouchers, and tax invoices are matched and reconciled in FinOps. Payments to this partner reflect across automated bank rails.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="outline" asChild size="sm">
                  <Link to="/finance/bills" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="fileText" size={14} /> Open FinOps Bills
                  </Link>
                </Button>
                <Button variant="outline" asChild size="sm">
                  <Link to={category.path} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="externalLink" size={14} /> Open {category.label}
                  </Link>
                </Button>
              </div>
            </div>
          </SectionCard>

          {/* Connected Logistics Modules */}
          <div style={{ gridColumn: '1 / -1' }}>
            <SectionCard title="Connected Logistics Modules">
              <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '0 0 10px' }}>
                Jump directly to connected operational modules associated with this partner's capability profile:
              </p>
            <div className="trk-vd-conn-grid">
              <Link to="/finance/bills" className="trk-vd-conn-card">
                <Icon name="fileText" size={18} color="var(--teal)" />
                <div>
                  <div>Supplier Bills</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>FinOps AP Ledger</div>
                </div>
              </Link>
              <Link to="/tracking/maintenance" className="trk-vd-conn-card">
                <Icon name="tool" size={18} color="var(--teal)" />
                <div>
                  <div>Workshop PM</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>{maintenance.length} logged services</div>
                </div>
              </Link>
              <Link to="/tracking/parts" className="trk-vd-conn-card">
                <Icon name="package" size={18} color="var(--teal)" />
                <div>
                  <div>Warehouse Parts</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>{parts.length} catalog items</div>
                </div>
              </Link>
              <Link to="/tracking/fuel" className="trk-vd-conn-card">
                <Icon name="zap" size={18} color="var(--gold)" />
                <div>
                  <div>Fuel Management</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>{fuel.length} dispense logs</div>
                </div>
              </Link>
              <Link to="/tracking/vehicles" className="trk-vd-conn-card">
                <Icon name="truck" size={18} color="var(--green)" />
                <div>
                  <div>Fleet Assets</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>{vehicles.length} active units</div>
                </div>
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
      )}

      {/* ── TAB 2: MAINTENANCE HISTORY ────────────────────────────────────── */}
      {activeTab === 'maintenance' && (
        <SectionCard
          title="Workshop Maintenance &amp; Work Orders"
          action={
            <Button size="sm" onClick={() => setShowMaintenanceModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={13} /> Log Work Order
            </Button>
          }
        >
          {maintenance.length === 0 ? (
            <div className="trk-vd-empty-state">
              <Icon name="tool" size={32} />
              <div>No workshop service work orders logged with this facility yet.</div>
              <Button size="sm" variant="outline" onClick={() => setShowMaintenanceModal(true)}>
                + Record First Work Order
              </Button>
            </div>
          ) : (
            <div className="trk-vd-table-wrap">
              <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Service Performed</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Vehicle</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Service Date</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Next Due</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.map(m => (
                    <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>{m.service_type}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>
                        {m.vehicle_name ? `${m.vehicle_name} (${m.vehicle_plate || 'No plate'})` : 'Fleet Asset'}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{new Date(m.service_date).toLocaleDateString()}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>
                        {m.next_due_date ? new Date(m.next_due_date).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                        {m.cost != null ? formatCurrency(m.cost) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── TAB 3: PARTS CATALOG ─────────────────────────────────────────── */}
      {activeTab === 'parts' && (
        <SectionCard
          title="Warehouse Spare Parts Supplied"
          action={
            <Button size="sm" onClick={() => setShowPartModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={13} /> Stock Spare Part
            </Button>
          }
        >
          {parts.length === 0 ? (
            <div className="trk-vd-empty-state">
              <Icon name="package" size={32} />
              <div>No spare parts catalogued under this supplier yet.</div>
              <Button size="sm" variant="outline" onClick={() => setShowPartModal(true)}>
                + Add Part to Catalog
              </Button>
            </div>
          ) : (
            <div className="trk-vd-table-wrap">
              <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Part Name &amp; SKU</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Category</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Stock Qty</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.part_name}</div>
                        {p.part_number && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>SKU: {p.part_number}</div>}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{p.category || 'General'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>
                        <span style={{ color: p.quantity <= p.reorder_level ? 'var(--red)' : 'var(--ink)' }}>
                          {p.quantity} units
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--ink2)' }}>
                        {p.unit_cost != null ? formatCurrency(p.unit_cost) : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                        {p.unit_cost != null ? formatCurrency(p.quantity * p.unit_cost) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── TAB 4: FUEL LOGS ──────────────────────────────────────────────── */}
      {activeTab === 'fuel' && (
        <SectionCard
          title="Fuel Dispenses &amp; Station History"
          action={
            <Button size="sm" onClick={() => setShowFuelModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={13} /> Log Dispense
            </Button>
          }
        >
          {fuel.length === 0 ? (
            <div className="trk-vd-empty-state">
              <Icon name="zap" size={32} />
              <div>No fuel dispense logs recorded at this facility.</div>
              <Button size="sm" variant="outline" onClick={() => setShowFuelModal(true)}>
                + Record Fuel Dispense
              </Button>
            </div>
          ) : (
            <div className="trk-vd-table-wrap">
              <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Vehicle</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Dispense Date</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Volume (Liters)</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {fuel.map(f => (
                    <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>
                        {f.vehicle_name ? `${f.vehicle_name} (${f.vehicle_plate || 'No plate'})` : 'Fleet Vehicle'}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{new Date(f.logged_at).toLocaleString()}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>
                        {f.liters} L
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                        {f.cost != null ? formatCurrency(f.cost) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── TAB 5: EXPENSES ───────────────────────────────────────────────── */}
      {activeTab === 'expenses' && (
        <SectionCard
          title="Direct Fleet Expenses Logged"
          action={
            <Button size="sm" onClick={() => setShowExpenseModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={13} /> Log Expense
            </Button>
          }
        >
          {expenses.length === 0 ? (
            <div className="trk-vd-empty-state">
              <Icon name="dollarSign" size={32} />
              <div>No direct expenses logged against this vendor yet.</div>
              <Button size="sm" variant="outline" onClick={() => setShowExpenseModal(true)}>
                + Record Fleet Expense
              </Button>
            </div>
          ) : (
            <div className="trk-vd-table-wrap">
              <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Category &amp; Description</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Vehicle</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{e.category}</div>
                        {e.description && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{e.description}</div>}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>
                        {e.vehicle_name ? `${e.vehicle_name} (${e.vehicle_plate || 'No plate'})` : 'Fleet General'}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{new Date(e.expense_date).toLocaleDateString()}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>
                        {formatCurrency(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
};

export default TrackingVendorDetail;
