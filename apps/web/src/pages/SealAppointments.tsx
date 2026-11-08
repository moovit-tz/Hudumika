import { Card } from '../components/ui/card.js';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { SealAppointment } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Banner } from '../components/ui/alert.js';
import { SectionLoading, ButtonSpinner } from '../components/ui/spinner.js';
import { DatePicker, toDateOnlyString, parseDateOnly } from '../components/ui/date-picker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { SearchToolbar, SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { ListPagination, paginate, useListPagination } from '../components/ui/list-pagination.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { showConfirm } from '../lib/confirm.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import { cn } from '../lib/utils.js';
import './Seal.css';

const closed = (status: string) => ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status);

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CHECKED_IN: 'Checked In',
  AT_DOCK: 'At Dock',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
};

// Simplified colour palette – only brand and gray tokens to ensure high contrast and calm UI
const STATUS_VARIANT: Record<string, 'brand' | 'gray'> = {
  SCHEDULED: 'brand',
  CHECKED_IN: 'brand',
  AT_DOCK: 'brand',
  COMPLETED: 'brand',
  CANCELLED: 'gray',
  NO_SHOW: 'gray',
};

const STATUS_OPTIONS = [
  { value: '__all__', label: 'All Statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'CHECKED_IN', label: 'Checked In' },
  { value: 'AT_DOCK', label: 'At Dock' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No Show' },
];

const TYPE_OPTIONS = [
  { value: '__all__', label: 'All Visit Types' },
  { value: 'INBOUND', label: 'Inbound Receiving' },
  { value: 'OUTBOUND', label: 'Outbound Dispatch' },
];

export function SealAppointments() {
  const [scope] = useSealCompartmentId();
  const navigate = useNavigate();
  const [query, setQuery] = useSearchParams();
  const isMobile = useIsMobile();

  const [date, setDate] = useState<Date | undefined>(() => parseDateOnly(query.get('date') ?? '') ?? new Date());
  const [rows, setRows] = useState<SealAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [typeFilter, setTypeFilter] = useState('__all__');

  const { page, setPage, pageSize, setPageSize } = useListPagination(10);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (scope) params.set('compartment_id', scope);
    if (date) {
      const from = new Date(date);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      params.set('from', from.toISOString());
      params.set('to', to.toISOString());
    }
    apiFetch(`/v1/seal/appointments?${params}`)
      .then(data => {
        if (active) {
          setRows(Array.isArray(data) ? data : []);
          setError(null);
        }
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, date, version]);

  async function change(id: string, status: string) {
    if (status === 'CANCELLED' || status === 'NO_SHOW') {
      const ok = await showConfirm(
        status === 'CANCELLED'
          ? 'Are you sure you want to cancel this scheduled appointment?'
          : 'Mark this arrival as No Show?',
        {
          title: status === 'CANCELLED' ? 'Cancel Appointment' : 'Mark No Show',
          confirmLabel: status === 'CANCELLED' ? 'Cancel Appointment' : 'Confirm No Show',
        }
      );
      if (!ok) return;
    }

    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/v1/seal/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setVersion(v => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Appointment update failed.');
    } finally {
      setBusy(null);
    }
  }

  // KPI Calculations
  const scheduledCount = rows.filter(r => r.status === 'SCHEDULED').length;
  const inProgressCount = rows.filter(r => ['CHECKED_IN', 'AT_DOCK'].includes(r.status)).length;
  const completedCount = rows.filter(r => r.status === 'COMPLETED').length;

  const filtered = rows.filter(r => {
    const matchSearch =
      !search ||
      (r.reference ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.consignment_ref ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.vehicle_plate ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.driver_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.compartment_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.notes ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === '__all__' || r.status === statusFilter;
    const matchType = typeFilter === '__all__' || r.appointment_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const { visible: pagedRows } = paginate(filtered, page, pageSize);

  function handleDateChange(newDate: Date | undefined) {
    setDate(newDate);
    if (newDate) {
      setQuery({ date: toDateOnlyString(newDate) });
    } else {
      setQuery({});
    }
  }

  function handleSelectToday() {
    handleDateChange(new Date());
  }

  function handleSelectAllDates() {
    handleDateChange(undefined);
  }

  function renderRowActions(row: SealAppointment, isMobileCard = false) {
    const isClosed = closed(row.status);
    const isActionBusy = busy === row.id;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {row.status === 'SCHEDULED' && (
          <Button
            size="sm"
            disabled={isActionBusy}
            onClick={() => change(row.id, 'CHECKED_IN')}
          >
            {isActionBusy ? <ButtonSpinner /> : null}
            <span>Check In</span>
          </Button>
        )}
        {row.status === 'CHECKED_IN' && (
          <Button
            size="sm"
            disabled={isActionBusy}
            onClick={() => change(row.id, 'AT_DOCK')}
          >
            {isActionBusy ? <ButtonSpinner /> : null}
            <span>At Dock</span>
          </Button>
        )}
        {['CHECKED_IN', 'AT_DOCK'].includes(row.status) && (
          <Button
            size="sm"
            disabled={isActionBusy}
            onClick={() => change(row.id, 'COMPLETED')}
          >
            {isActionBusy ? <ButtonSpinner /> : null}
            <span>Complete</span>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Appointment options">
              <Icon name="moreHorizontal" size={15} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {!isClosed && (
              <DropdownMenuItem onClick={() => navigate(`/seal/appointments/${row.id}/edit`)}>
                <Icon name="edit" size={14} /> Edit Visit Details
              </DropdownMenuItem>
            )}
            {row.status === 'SCHEDULED' && (
              <DropdownMenuItem onClick={() => change(row.id, 'NO_SHOW')}>
                <Icon name="alertCircle" size={14} /> Mark as No Show
              </DropdownMenuItem>
            )}
            {!isClosed && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => change(row.id, 'CANCELLED')}
                  className="text-red-600 focus:text-red-600"
                >
                  <Icon name="trash" size={14} /> Cancel Appointment
                </DropdownMenuItem>
              </>
            )}
            {isClosed && (
              <DropdownMenuItem onClick={() => navigate(`/seal/appointments/${row.id}/edit`)}>
                <Icon name="fileText" size={14} /> View Archived Record
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={[
          { label: 'SEAL', to: '/seal' },
          'Appointments',
        ]}
        titlePlain="Gate"
        titleEm="appointments"
        subtitle="Schedule arrivals and departures, manage dock slots, and track driver check-ins."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={() => setVersion(v => v + 1)}>
              <Icon name="refresh" size={14} />
              <span>Refresh</span>
            </Button>
            <Button size="sm" onClick={() => navigate('/seal/appointments/new')}>
              <Icon name="plus" size={14} />
              <span>New Appointment</span>
            </Button>
          </div>
        }
      />

      {error && (
        <Banner variant="error" style={{ marginBottom: 16 }}>
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setVersion(v => v + 1)}>
            Retry
          </Button>
        </Banner>
      )}

      {/* KPI Metrics Row */}
      <div style={{ marginBottom: 20 }}>
        <MetricsRow
          cards={[
            {
              title: 'Scheduled Visits',
              value: String(scheduledCount),
              icon: 'calendar',
              barHighlight: 'var(--teal)',
              sub1Label: 'Pending Arrival',
              sub1Value: date ? `Scheduled on ${date.toLocaleDateString()}` : 'Awaiting arrival',
            },
            {
              title: 'At Gate / Dock',
              value: String(inProgressCount),
              icon: 'truck',
              barHighlight: 'var(--teal)',
              sub1Label: 'Active Operations',
              sub1Value: 'Vehicles currently on-site',
            },
            {
              title: 'Completed',
              value: String(completedCount),
              icon: 'checkCircle',
              barHighlight: 'var(--teal)',
              sub1Label: 'Departed',
              sub1Value: 'Finished processing',
            },
            {
              title: 'Total in View',
              value: String(rows.length),
              icon: 'layers',
              barHighlight: 'var(--teal)',
              sub1Label: 'Audited Visits',
              sub1Value: scope ? 'Filtered by warehouse' : 'All warehouse perimeters',
            },
          ]}
        />
      </div>

      <div className="seal-appointments-toolbar" role="region" aria-label="Appointment filters">
        <div className="seal-scope-pill" role="group" aria-label="Schedule scope">
          <button data-ui-native-button=""
            type="button"
            className={cn(
              'seal-scope-btn',
              date && toDateOnlyString(date) === toDateOnlyString(new Date()) && 'seal-scope-btn-active'
            )}
            onClick={handleSelectToday}
          >
            Today
          </button>
          <button data-ui-native-button=""
            type="button"
            className={cn('seal-scope-btn', date === undefined && 'seal-scope-btn-active')}
            onClick={handleSelectAllDates}
          >
            All Dates
          </button>
        </div>

        <div className="seal-appointments-date">
          <DatePicker
            date={date}
            onChange={handleDateChange}
            placeholder="Custom date"
            triggerClassName="h-[var(--ctl-h-sm,32px)] min-h-[var(--ctl-h-sm,32px)] py-0 text-xs font-semibold rounded-full border-border bg-background px-3 shadow-sm hover:border-primary/40"
          />
        </div>

        <SingleSelectFilter
          label="Status"
          value={statusFilter === '__all__' ? null : statusFilter}
          options={STATUS_OPTIONS.filter(option => option.value !== '__all__')}
          onChange={value => setStatusFilter(value ?? '__all__')}
          allLabel="All Statuses"
        />

        <SingleSelectFilter
          label="Type"
          value={typeFilter === '__all__' ? null : typeFilter}
          options={TYPE_OPTIONS.filter(option => option.value !== '__all__')}
          onChange={value => setTypeFilter(value ?? '__all__')}
          allLabel="All Visit Types"
        />

        <div className="seal-appointments-search">
          <SearchToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search driver, vehicle plate, reference or notes…"
            activeFilterCount={
              (statusFilter !== '__all__' ? 1 : 0) +
              (typeFilter !== '__all__' ? 1 : 0) +
              (date !== undefined && toDateOnlyString(date) !== toDateOnlyString(new Date()) ? 1 : 0)
            }
          />
        </div>
      </div>

      {/* Main List Surface: Mobile Cards vs Desktop Table */}
      {loading ? (
        <div className="seal-card" style={{ padding: 24 }}>
          <SectionLoading label="Loading gate appointments…" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="seal-card" style={{ padding: 32 }}>
          <div className="seal-empty">
            {rows.length === 0
              ? 'No appointments recorded for this date and warehouse scope. Click "New Appointment" to schedule an arrival.'
              : 'No appointments match your filter or search query.'}
          </div>
        </div>
      ) : isMobile ? (
        /* Mobile-Friendly Stacked Card View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pagedRows.map(row => (
            <div
              key={row.id}
              className="seal-card"
              style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* Header: Date, Time & Status Badges */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge variant="gray">
                    <Icon
                      name={row.appointment_type === 'INBOUND' ? 'arrowDown' : 'arrowUp'}
                      size={12}
                      style={{ marginRight: 4 }}
                    />
                    {row.appointment_type}
                  </Badge>
                  <span
                    className="seal-mono"
                    style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}
                  >
                    {new Date(row.scheduled_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    {new Date(row.scheduled_at).toLocaleDateString()}
                  </span>
                </div>
                <Badge variant={STATUS_VARIANT[row.status] ?? 'gray'}>
                  {STATUS_LABELS[row.status] ?? row.status.replaceAll('_', ' ')}
                </Badge>
              </div>

              {/* Warehouse & Consignment/Reference */}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                  {row.compartment_name ?? 'Warehouse Perimeter'}
                </div>
                {(row.reference || row.consignment_ref) && (
                  <div className="seal-mono" style={{ fontSize: 12, color: 'var(--teal)', marginTop: 2 }}>
                    Ref: <strong>{row.reference ?? row.consignment_ref}</strong>
                  </div>
                )}
              </div>

              {/* Driver & Vehicle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  background: 'var(--card-sunken, var(--bg))',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12.5,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {row.driver_name ? (
                    <PersonAvatar kind="drivers" name={row.driver_name} size={28} />
                  ) : (
                    <Icon name="truck" size={18} style={{ color: 'var(--ink3)' }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                      {row.driver_name ?? 'Driver unassigned'}
                    </div>
                    {row.vehicle_plate && (
                      <div className="seal-mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>
                        Plate: {row.vehicle_plate}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes */}
              {row.notes && (
                <div style={{ fontSize: 12, color: 'var(--ink2)', fontStyle: 'italic' }}>
                  "{row.notes}"
                </div>
              )}

              {/* Mobile Actions Toolbar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 10,
                  borderTop: '1px solid var(--border)',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  Actions
                </span>
                {renderRowActions(row, true)}
              </div>
            </div>
          ))}

          <div className="seal-card" style={{ padding: '8px 16px' }}>
            <ListPagination
              total={filtered.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 15, 25, 50]}
              noun="appointments"
            />
          </div>
        </div>
      ) : (
        /* Desktop Table View */
        <div className="seal-card">
          <div className="seal-card-body">
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Scheduled Time</th>
                  <th>Type & Facility</th>
                  <th>Vehicle & Driver</th>
                  <th>Reference & Notes</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <div className="seal-mono" style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
                        {new Date(row.scheduled_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                        {new Date(row.scheduled_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Badge variant="gray">
                          <Icon
                            name={row.appointment_type === 'INBOUND' ? 'arrowDown' : 'arrowUp'}
                            size={11}
                            style={{ marginRight: 3 }}
                          />
                          {row.appointment_type}
                        </Badge>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3 }}>
                        {row.compartment_name ?? 'Warehouse Perimeter'}
                      </div>
                    </td>
                    <td>
                      {row.driver_name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <PersonAvatar kind="drivers" name={row.driver_name} size={24} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12.5 }}>{row.driver_name}</div>
                            {row.vehicle_plate && (
                              <div className="seal-mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>
                                {row.vehicle_plate}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Unassigned driver</span>
                          {row.vehicle_plate && (
                            <div className="seal-mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>
                              Plate: {row.vehicle_plate}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <div
                        className="seal-mono"
                        style={{ fontWeight: 600, color: 'var(--teal)', fontSize: 12.5 }}
                      >
                        {row.reference ?? row.consignment_ref ?? '—'}
                      </div>
                      {row.notes && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: 'var(--ink3)',
                            maxWidth: 240,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: 2,
                          }}
                        >
                          {row.notes}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANT[row.status] ?? 'gray'}>
                        {STATUS_LABELS[row.status] ?? row.status.replaceAll('_', ' ')}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {renderRowActions(row, false)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: '0 20px 16px' }}>
              <ListPagination
                total={filtered.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[10, 15, 25, 50]}
                noun="appointments"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Multi-Step Appointment Creation & Edit Form ─────────────────────────────
export function SealAppointmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [scope] = useSealCompartmentId();

  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [warehouse, setWarehouse] = useState(scope ?? '');
  const [type, setType] = useState('INBOUND');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState('09:00');
  const [plate, setPlate] = useState('');
  const [driver, setDriver] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [recordLoaded, setRecordLoaded] = useState(!id);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setRecordLoaded(!id);
    Promise.all([
      apiFetch('/v1/seal/compartments'),
      id ? apiFetch(`/v1/seal/appointments/${id}`) : Promise.resolve(null),
    ])
      .then(([facilities, appointment]: [Array<{ id: string; name: string }>, SealAppointment | null]) => {
        if (!active) return;
        setWarehouses(facilities);
        if (!id && facilities.length === 1) setWarehouse(facilities[0].id);
        if (appointment) {
          setRecordLoaded(true);
          setWarehouse(appointment.compartment_id);
          setType(appointment.appointment_type);
          const scheduled = new Date(appointment.scheduled_at);
          setDate(scheduled);
          setTime(
            `${String(scheduled.getHours()).padStart(2, '0')}:${String(scheduled.getMinutes()).padStart(2, '0')}`
          );
          setPlate(appointment.vehicle_plate ?? '');
          setDriver(appointment.driver_name ?? '');
          setReference(appointment.reference ?? '');
          setNotes(appointment.notes ?? '');
        }
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function submit() {
    if (!warehouse || !date || !/^\d{2}:\d{2}$/.test(time)) {
      setError('Please choose a warehouse, scheduled date and time.');
      return;
    }
    if (step >= 1 && !plate.trim() && !driver.trim()) {
      setError('Please enter at least a vehicle plate number or driver name.');
      return;
    }
    setError(null);
    if (step < 2) {
      setStep(s => s + 1);
      return;
    }

    const scheduled = new Date(date);
    const [hour, minute] = time.split(':').map(Number);
    scheduled.setHours(hour, minute, 0, 0);

    setBusy(true);
    try {
      await apiFetch(id ? `/v1/seal/appointments/${id}` : '/v1/seal/appointments', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(id ? {} : { compartmentId: warehouse }),
          appointmentType: type,
          scheduledAt: scheduled.toISOString(),
          vehiclePlate: plate.trim() || null,
          driverName: driver.trim() || null,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      navigate(`/seal/appointments?date=${toDateOnlyString(date)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save appointment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={[
          { label: 'SEAL', to: '/seal' },
          { label: 'Appointments', to: '/seal/appointments' },
          id ? 'Edit' : 'New',
        ]}
        titlePlain={id ? 'Edit' : 'New'}
        titleEm="appointment"
        variant="create"
        backTo="/seal/appointments"
      />

      {error && (
        <Banner variant="error" style={{ marginBottom: 16 }}>
          {error}
        </Banner>
      )}

      {loading ? (
        <div className="seal-card" style={{ padding: 24 }}>
          <SectionLoading label="Loading appointment form…" />
        </div>
      ) : recordLoaded ? (
        <form
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
          style={{ maxWidth: 800 }}
        >
          <div className="seal-card" style={{ marginBottom: 16 }}>
            {/* Step Bar */}
            <div
              className="seal-card-hdr"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <h3 className="seal-card-title">
                {id ? 'Reschedule or Update Appointment' : 'Schedule New Gate Visit'}
              </h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['1. Schedule & Facility', '2. Vehicle & Driver', '3. Review & Notes'].map((label, i) => (
                  <Button
                    key={label}
                    type="button"
                    variant={step === i ? 'default' : 'outline'}
                    size="xs"
                    disabled={i > step || busy}
                    onClick={() => setStep(i)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div style={{ padding: 20 }}>
              {/* Step 0: Schedule & Warehouse */}
              {step === 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <div>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Warehouse Facility
                    </label>
                    <Combobox
                      value={warehouse}
                      onChange={setWarehouse}
                      disabled={!!id}
                      options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                      placeholder="Choose warehouse"
                    />
                  </div>

                  <div>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Visit Direction
                    </label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INBOUND">Inbound Receiving</SelectItem>
                        <SelectItem value="OUTBOUND">Outbound Dispatch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Scheduled Date
                    </label>
                    <DatePicker date={date} onChange={setDate} triggerClassName="w-full" />
                  </div>

                  <div>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Expected Arrival Time
                    </label>
                    <Input
                      type="time"
                      value={time}
                      onChange={e => setTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Step 1: Vehicle & Driver */}
              {step === 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <div>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Vehicle Registration Plate
                    </label>
                    <Input
                      value={plate}
                      maxLength={40}
                      onChange={e => setPlate(e.target.value)}
                      placeholder="e.g. T 482 DFP"
                    />
                  </div>

                  <div>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Driver Full Name
                    </label>
                    <Input
                      value={driver}
                      maxLength={200}
                      onChange={e => setDriver(e.target.value)}
                      placeholder="e.g. Juma Hamisi"
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Consignment / Document Reference (optional)
                    </label>
                    <Input
                      value={reference}
                      maxLength={200}
                      onChange={e => setReference(e.target.value)}
                      placeholder="e.g. BL-DSM-8820, Delivery Order No."
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Review & Notes */}
              {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      padding: 16,
                      background: 'var(--card-sunken, var(--bg))',
                      borderRadius: 'var(--r)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>
                      Appointment Summary
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
                      {warehouses.find(w => w.id === warehouse)?.name} · {type}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 2 }}>
                      Scheduled for {date?.toLocaleDateString()} at {time}
                    </div>
                    <div className="seal-mono" style={{ fontSize: 12.5, color: 'var(--ink)', marginTop: 6 }}>
                      Vehicle: <strong>{plate || 'Unspecified'}</strong> · Driver: <strong>{driver || 'Unassigned'}</strong>
                      {reference && ` · Ref: ${reference}`}
                    </div>
                  </div>

                  <div>
                    <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                      Gate & Dock Instructions / Notes
                    </label>
                    <Textarea
                      rows={3}
                      value={notes}
                      maxLength={5000}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Dock bay requirements, seal checks, container numbers..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Stepper Navigation Actions */}
            <div
              style={{
                padding: '16px 20px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <Button asChild variant="outline" size="sm" type="button">
                <Link to="/seal/appointments">Cancel</Link>
              </Button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {step > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setStep(s => s - 1)}
                  >
                    Back
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? <ButtonSpinner /> : null}
                  <span>{busy ? 'Saving…' : step === 2 ? (id ? 'Save Changes' : 'Schedule Visit') : 'Next Step'}</span>
                </Button>
              </div>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
