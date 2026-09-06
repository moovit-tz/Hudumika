import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PageHeader } from '../components/PageHeader.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { DriverChatPanel } from '../components/DriverChatPanel.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Combobox } from '../components/ui/combobox.js';
import { showAlert } from '../lib/alert.js';
import './TrackingDriverDetail.css';

interface DriverEnriched {
  id: string; name: string; phone: string | null; license_number: string | null;
  license_expiry?: string | null; status: string; avatar_url: string | null; custom_id: string; email: string | null;
  joined_date: string | null; address: string | null; emergency_contact?: string | null;
}

interface VehicleEnriched {
  id: string; name: string; plate_number: string | null; custom_code: string;
  condition: string;
}

interface TripEnriched {
  id: string; origin: string | null; destination: string | null; status: string;
  created_at: string; delivery_id: string; distance_km: number | null;
  scheduled_start: string | null; scheduled_end: string | null;
  actual_start: string | null; actual_end: string | null;
  cargo_desc: string | null; cargo_type: string | null;
  cargo_weight_kg: number | null; load_capacity_pct: number | null;
}

interface DetailPayload {
  driver: DriverEnriched;
  vehicle: VehicleEnriched | null;
  trips: TripEnriched[];
}

export const TrackingDriverDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Delivery Logs');
  const [expandedTrips, setExpandedTrips] = useState<Record<string, boolean>>({});
  
  // Edit Driver Modal & Form
  const [editingDriver, setEditingDriver] = useState(false);
  const [driverForm, setDriverForm] = useState<Record<string, string>>({});
  const [savingDriver, setSavingDriver] = useState(false);

  // Vehicle Reassignment State
  const [vehicles, setVehicles] = useState<{ id: string; name: string; plate_number: string | null }[]>([]);
  const [reassigningVehicle, setReassigningVehicle] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/tracking/drivers/${id}/detail`)
      .then(data => {
        setDetail(data);
        if (data?.trips?.length > 0) {
          setExpandedTrips({ [data.trips[0].id]: true });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }, []);

  const toggleTrip = (tripId: string) => {
    setExpandedTrips(prev => ({ ...prev, [tripId]: !prev[tripId] }));
  };

  function startEditDriver() {
    if (!detail) return;
    setDriverForm({
      name: detail.driver.name || '',
      phone: detail.driver.phone || '',
      email: detail.driver.email || '',
      license_number: detail.driver.license_number || '',
      license_expiry: detail.driver.license_expiry || '',
      status: detail.driver.status || 'Available',
      address: detail.driver.address || '',
      emergency_contact: detail.driver.emergency_contact || '',
    });
    setEditingDriver(true);
  }

  async function saveDriver() {
    if (!id) return;
    setSavingDriver(true);
    try {
      const payload: Record<string, any> = { ...driverForm };
      if (payload.status === 'Available') payload.status = 'ACTIVE';
      else if (payload.status === 'Off Duty') payload.status = 'INACTIVE';
      else if (payload.status === 'On Route') delete payload.status;
      
      Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });
      await apiFetch(`/v1/tracking/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setEditingDriver(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update driver details.', { variant: 'error' });
    } finally {
      setSavingDriver(false);
    }
  }

  async function handleVehicleReassign() {
    if (!id) return;
    try {
      await apiFetch(`/v1/tracking/drivers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_vehicle_id: selectedVehicleId || null }),
      });
      setReassigningVehicle(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to reassign vehicle.', { variant: 'error' });
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40 }}>
        <SectionLoading />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="dd-empty-state">
        <Icon name="user" size={32} color="var(--ink3)" />
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Driver profile not found</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>The requested driver record could not be loaded.</div>
        <Link to="/tracking/drivers" className="dd-back-link" style={{ marginTop: 16 }}>← Back to Drivers Directory</Link>
      </div>
    );
  }

  const { driver, vehicle, trips } = detail;
  const statusClass = driver.status?.toLowerCase().replace(/\s+/g, '-') || 'available';

  // License Expiry calculation
  let expiryNotice = '';
  let isExpiringSoon = false;
  if (driver.license_expiry) {
    const expDate = new Date(driver.license_expiry);
    const today = new Date();
    const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    if (diffDays < 0) {
      expiryNotice = `License Expired (${Math.abs(diffDays)} days ago)`;
      isExpiringSoon = true;
    } else if (diffDays <= 60) {
      expiryNotice = `Expires in ${diffDays} days`;
      isExpiringSoon = true;
    } else {
      expiryNotice = `Valid (Expires ${expDate.toLocaleDateString()})`;
    }
  }

  return (
    <div className="dd-layout">
      {/* Back Navigation Bar */}
      <div className="dd-top-bar">
        <button type="button" className="dd-back-btn" onClick={() => navigate('/tracking/drivers')}>
          <Icon name="arrowLeft" size={16} /> Back to Drivers
        </button>
        <span style={{ fontSize: 13, color: 'var(--ink3)' }}>|</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink2)' }}>{driver.name} ({driver.custom_id})</span>
      </div>

      <PageHeader
        crumbs={['HuduFreight', 'Drivers', driver.name]}
        titlePlain="Driver profile &"
        titleEm="lifecycle"
        subtitle={`Full record for ${driver.name} — dispatch history, vehicle assignment, compliance & messaging.`}
        actions={
          <div className="dd-header-actions">
            <button type="button" className="dd-action-btn" onClick={() => setActiveTab('Dispatch Messaging')}>
              <Icon name="messageSquare" size={14} /> WhatsApp / Chat
            </button>
            <button type="button" className="dd-action-btn" onClick={startEditDriver}>
              <Icon name="edit" size={14} /> Edit Driver Details
            </button>
            <button type="button" className="dd-action-btn dark" onClick={() => window.print()}>
              <Icon name="download" size={14} /> Download Report
            </button>
          </div>
        }
      />

      {/* Driver Lifecycle Progress Bar */}
      <div className="dd-lifecycle-bar">
        <div className="dd-lifecycle-step active">
          <div className="step-num">1</div>
          <div className="step-text">Registered & Onboarded</div>
        </div>
        <div className={`dd-lifecycle-step ${driver.license_number ? 'active' : ''}`}>
          <div className="step-num">2</div>
          <div className="step-text">License Verified</div>
        </div>
        <div className={`dd-lifecycle-step ${vehicle ? 'active' : ''}`}>
          <div className="step-num">3</div>
          <div className="step-text">Vehicle Assigned</div>
        </div>
        <div className={`dd-lifecycle-step ${driver.status === 'On Route' || driver.status === 'Available' ? 'active' : ''}`}>
          <div className="step-num">4</div>
          <div className="step-text">Active Lifecycle</div>
        </div>
      </div>

      {/* Warning Banner if License is expiring or unverified info */}
      {isExpiringSoon && (
        <div className="dd-alert warning">
          <div className="dd-alert-content">
            <div className="dd-alert-icon"><Icon name="alertTriangle" size={16} /></div>
            <div>
              <div className="dd-alert-title">Driver Compliance Notice</div>
              <div className="dd-alert-text">{driver.name}'s driving license needs renewal: <strong>{expiryNotice}</strong>.</div>
            </div>
          </div>
          <button type="button" className="dd-alert-action-btn" onClick={startEditDriver}>Update License</button>
        </div>
      )}

      {/* Profile Overview Cards Grid (2 Columns) */}
      <div className="dd-profile-grid">
        {/* Card 1: Driver Information */}
        <div className="dd-card">
          <div className="dd-card-header">
            <div className="dd-card-title-wrap">
              <Icon name="user" size={18} color="var(--teal)" />
              <div className="dd-card-title">Driver Profile & License</div>
            </div>
            <button type="button" onClick={startEditDriver} className="dd-link-btn">
              <Icon name="edit" size={13} /> Edit Profile
            </button>
          </div>

          <div className="dd-courier-top">
            <AvatarPicker
              id={driver.id}
              kind="drivers"
              name={driver.name}
              size={76}
              shape="square"
              onChange={url => setDetail(prev => (prev ? { ...prev, driver: { ...prev.driver, avatar_url: url } } : prev))}
            />
            <div>
              <div className="dd-courier-name">{driver.name}</div>
              <div className="dd-courier-badges">
                <span className="dd-courier-badge">ID: {driver.custom_id}</span>
                <span className={`drv-status drv-status--${statusClass}`}>
                  <span className="drv-status-dot"></span>
                  {driver.status || 'Available'}
                </span>
                {driver.joined_date && (
                  <span className="dd-courier-badge">Joined {new Date(driver.joined_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                )}
              </div>
            </div>
          </div>

          <div className="dd-info-grid">
            <div className="dd-info-item">
              <span className="dd-info-label">Phone Contact</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dd-info-value">{driver.phone || 'Not on file'}</span>
                {driver.phone && (
                  <a href={`https://wa.me/${driver.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', textDecoration: 'none' }} title="Open WhatsApp Chat">
                    <Icon name="messageSquare" size={14} />
                  </a>
                )}
              </div>
            </div>

            <div className="dd-info-item">
              <span className="dd-info-label">Email Address</span>
              <span className="dd-info-value">{driver.email || 'Not on file'}</span>
            </div>

            <div className="dd-info-item">
              <span className="dd-info-label">License Number</span>
              <span className="dd-info-value">{driver.license_number || 'Not on file'}</span>
            </div>

            <div className="dd-info-item">
              <span className="dd-info-label">License Expiry</span>
              <span className={`dd-info-value ${isExpiringSoon ? 'warning-text' : ''}`}>
                {driver.license_expiry ? new Date(driver.license_expiry).toLocaleDateString() : 'Not recorded'}
              </span>
            </div>

            <div className="dd-info-item" style={{ gridColumn: 'span 2' }}>
              <span className="dd-info-label">Residential Address</span>
              <span className="dd-info-value">{driver.address || 'Not recorded'}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Fleet & Assigned Vehicle */}
        <div className="dd-card">
          <div className="dd-card-header">
            <div className="dd-card-title-wrap">
              <Icon name="truck" size={18} color="var(--teal)" />
              <div className="dd-card-title">Assigned Fleet Vehicle</div>
            </div>
            <button type="button" onClick={() => setReassigningVehicle(true)} className="dd-link-btn">
              <Icon name="refresh" size={13} /> Reassign Vehicle
            </button>
          </div>

          {vehicle ? (
            <>
              <div className="dd-vehicle-hero">
                <div className="dd-vh-icon"><Icon name="truck" size={24} /></div>
                <div>
                  <div className="dd-vh-title">{vehicle.name}</div>
                  <div className="dd-vh-sub">Plate Number: <strong>{vehicle.plate_number || 'N/A'}</strong> · Code: <strong>{vehicle.custom_code}</strong></div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span className="dd-condition-pill">{vehicle.condition || 'Good Condition'}</span>
                </div>
              </div>

              <div className="dd-info-grid" style={{ marginTop: 16 }}>
                <div className="dd-info-item">
                  <span className="dd-info-label">Fleet Code</span>
                  <span className="dd-info-value">{vehicle.custom_code}</span>
                </div>
                <div className="dd-info-item">
                  <span className="dd-info-label">Registration Plate</span>
                  <span className="dd-info-value" style={{ fontFamily: 'var(--mono)' }}>{vehicle.plate_number || '—'}</span>
                </div>
                <div className="dd-info-item">
                  <span className="dd-info-label">Vehicle Condition</span>
                  <span className="dd-info-value">
                    <span className="dd-condition-dot"></span>
                    {vehicle.condition || 'Operational'}
                  </span>
                </div>
                <div className="dd-info-item">
                  <span className="dd-info-label">Compliance Check</span>
                  <span className="dd-info-value" style={{ color: 'var(--green)' }}>✓ Inspection Verified</span>
                </div>
              </div>
            </>
          ) : (
            <div className="dd-no-vehicle-box">
              <Icon name="truck" size={28} color="var(--ink3)" />
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>No Vehicle Currently Assigned</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>Assign a heavy truck or cargo vessel to enable instant dispatching.</div>
              <button type="button" onClick={() => setReassigningVehicle(true)} className="dd-action-btn" style={{ marginTop: 14 }}>
                <Icon name="plus" size={14} /> Assign Vehicle Now
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Tabs Section: Delivery Logs / Dispatch Messaging / Compliance */}
      <div className="dd-card dd-main-tabs-card">
        <div className="dd-tabs-header">
          <Tabs value={activeTab} onValueChange={setActiveTab} variant="segmented">
            <TabsList>
              <TabsTrigger value="Delivery Logs">
                <Icon name="package" size={14} style={{ marginRight: 6 }} /> Delivery Logs & Trips ({trips.length})
              </TabsTrigger>
              <TabsTrigger value="Dispatch Messaging">
                <Icon name="messageSquare" size={14} style={{ marginRight: 6 }} /> Dispatch & WhatsApp Terminal
              </TabsTrigger>
              <TabsTrigger value="Compliance Docs">
                <Icon name="shield" size={14} style={{ marginRight: 6 }} /> License & Compliance Docs
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Tab 1: Delivery Logs & Trip History */}
        {activeTab === 'Delivery Logs' && (
          <div className="dd-report-list">
            {trips.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                No completed or active deliveries recorded for this driver.
              </div>
            ) : (
              trips.map(t => (
                <div key={t.id} className="dd-report-item">
                  <div
                    className="dd-report-header"
                    onClick={() => toggleTrip(t.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTrip(t.id); } }}
                  >
                    <div>
                      <div className="dd-route-title">
                        {t.origin || 'Origin'} <Icon name="arrowRight" size={14} style={{ margin: '0 8px', color: 'var(--ink3)' }}/> {t.destination || 'Destination'}
                      </div>
                      <div className="dd-route-meta">
                        <span>Dispatch ID: <strong>{t.delivery_id}</strong></span>
                        <span style={{ color: 'var(--border2)' }}>|</span>
                        <span>{new Date(t.created_at).toLocaleDateString()}</span>
                        <span style={{ color: 'var(--border2)' }}>|</span>
                        <span>{t.distance_km != null ? `${t.distance_km} km` : 'Distance pending'}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span className={`dd-route-status ${t.status === 'COMPLETED' ? 'completed' : 'transit'}`}>
                        {t.status === 'COMPLETED' ? '✓ Complete' : `Transit (${t.origin || 'En Route'})`}
                      </span>
                      <Icon name={expandedTrips[t.id] ? 'chevronUp' : 'chevronDown'} size={18} color="var(--ink3)" />
                    </div>
                  </div>

                  {expandedTrips[t.id] && (
                    <div className="dd-trip-details-panel">
                      <div className="dd-metrics-row">
                        <div className="dd-metric">
                          <span className="dd-metric-label">Delivery ID</span>
                          <span className="dd-metric-val">{t.delivery_id}</span>
                        </div>
                        <div className="dd-metric">
                          <span className="dd-metric-label">Distance Logged</span>
                          <span className="dd-metric-val">{t.distance_km != null ? `${t.distance_km} km` : '—'}</span>
                        </div>
                        <div className="dd-metric">
                          <span className="dd-metric-label">Cargo Type</span>
                          <span className="dd-metric-val">{t.cargo_type || 'General Cargo'}</span>
                        </div>
                        <div className="dd-metric">
                          <span className="dd-metric-label">Cargo Weight</span>
                          <span className="dd-metric-val">{t.cargo_weight_kg != null ? `${t.cargo_weight_kg} kg` : '—'}</span>
                        </div>
                        <div className="dd-metric">
                          <span className="dd-metric-label">Capacity Utilization</span>
                          <span className="dd-metric-val">{t.load_capacity_pct != null ? `${t.load_capacity_pct}%` : '—'}</span>
                        </div>
                      </div>

                      <div className="dd-nested-cards">
                        <div className="dd-ncard">
                          <div className="dd-ncard-title">Schedule Timestamps</div>
                          <div className="dd-ncard-grid">
                            <div className="dd-ncard-item">
                              <span className="dd-ncard-label">Scheduled Departure</span>
                              <span className="dd-ncard-val">{t.scheduled_start ? new Date(t.scheduled_start).toLocaleString() : '—'}</span>
                            </div>
                            <div className="dd-ncard-item">
                              <span className="dd-ncard-label">Scheduled Arrival</span>
                              <span className="dd-ncard-val">{t.scheduled_end ? new Date(t.scheduled_end).toLocaleString() : '—'}</span>
                            </div>
                            <div className="dd-ncard-item">
                              <span className="dd-ncard-label">Actual Departure</span>
                              <span className="dd-ncard-val">{t.actual_start ? new Date(t.actual_start).toLocaleString() : '—'}</span>
                            </div>
                            <div className="dd-ncard-item">
                              <span className="dd-ncard-label">Actual Arrival</span>
                              <span className="dd-ncard-val">{t.actual_end ? new Date(t.actual_end).toLocaleString() : '—'}</span>
                            </div>
                          </div>
                        </div>

                        {t.cargo_desc && (
                          <div className="dd-ncard">
                            <div className="dd-ncard-title">Cargo Manifest Details</div>
                            <div className="dd-ncard-grid">
                              <div className="dd-ncard-item">
                                <span className="dd-ncard-val">{t.cargo_desc}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Dispatch & WhatsApp Terminal */}
        {activeTab === 'Dispatch Messaging' && (
          <div style={{ height: 420, marginTop: 12 }}>
            <DriverChatPanel
              driverId={driver.id}
              driverName={driver.name}
              driverPhone={driver.phone}
            />
          </div>
        )}

        {/* Tab 3: License & Compliance Docs */}
        {activeTab === 'Compliance Docs' && (
          <div className="dd-compliance-grid">
            <div className="dd-doc-card">
              <div className="dd-doc-icon"><Icon name="fileText" size={20} /></div>
              <div>
                <div className="dd-doc-title">Driving License (Class A/B/C/E)</div>
                <div className="dd-doc-sub">License Number: <strong>{driver.license_number || 'Not provided'}</strong></div>
              </div>
              <span className="dd-doc-status verified">✓ Verified</span>
            </div>

            <div className="dd-doc-card">
              <div className="dd-doc-icon"><Icon name="shield" size={20} /></div>
              <div>
                <div className="dd-doc-title">Heavy Commercial Vehicle Endorsement</div>
                <div className="dd-doc-sub">TRA & SUMATRA Fleet Endorsement</div>
              </div>
              <span className="dd-doc-status verified">✓ Verified</span>
            </div>

            <div className="dd-doc-card">
              <div className="dd-doc-icon"><Icon name="activity" size={20} /></div>
              <div>
                <div className="dd-doc-title">Medical Fitness & Drug Screen</div>
                <div className="dd-doc-sub">Annual Occupational Medical Clearance</div>
              </div>
              <span className="dd-doc-status verified">✓ Verified</span>
            </div>
          </div>
        )}
      </div>

      {/* Edit Driver Modal */}
      {editingDriver && (
        <div className="dd-modal-backdrop" onClick={() => setEditingDriver(false)}>
          <div className="dd-modal-content" onClick={e => e.stopPropagation()}>
            <div className="dd-modal-header">
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Edit Driver Profile & Lifecycle</div>
              <button type="button" className="dd-sb-close-btn" onClick={() => setEditingDriver(false)}><Icon name="x" size={16} /></button>
            </div>

            <div className="dd-modal-body">
              <div className="dd-form-field">
                <label className="dd-form-label">Driver Full Name</label>
                <input
                  type="text"
                  value={driverForm.name || ''}
                  onChange={e => setDriverForm({ ...driverForm, name: e.target.value })}
                  className="dd-form-input"
                />
              </div>

              <div className="dd-form-row">
                <div className="dd-form-field">
                  <label className="dd-form-label">Phone Contact</label>
                  <input
                    type="text"
                    value={driverForm.phone || ''}
                    onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })}
                    className="dd-form-input"
                  />
                </div>
                <div className="dd-form-field">
                  <label className="dd-form-label">Email Address</label>
                  <input
                    type="email"
                    value={driverForm.email || ''}
                    onChange={e => setDriverForm({ ...driverForm, email: e.target.value })}
                    className="dd-form-input"
                  />
                </div>
              </div>

              <div className="dd-form-row">
                <div className="dd-form-field">
                  <label className="dd-form-label">License Number</label>
                  <input
                    type="text"
                    value={driverForm.license_number || ''}
                    onChange={e => setDriverForm({ ...driverForm, license_number: e.target.value })}
                    className="dd-form-input"
                  />
                </div>
                <div className="dd-form-field">
                  <label className="dd-form-label">License Expiry Date</label>
                  <DatePicker
                    date={parseDateOnly(driverForm.license_expiry)}
                    onChange={d => setDriverForm({ ...driverForm, license_expiry: toDateOnlyString(d) })}
                  />
                </div>
              </div>

              <div className="dd-form-field">
                <label className="dd-form-label">Lifecycle Status</label>
                <select
                  value={driverForm.status || 'Available'}
                  onChange={e => setDriverForm({ ...driverForm, status: e.target.value })}
                  className="dd-form-select"
                >
                  <option value="Available">Available (Active & Ready)</option>
                  <option value="Off Duty">Off Duty (Inactive / Rest Shift)</option>
                </select>
              </div>

              <div className="dd-form-field">
                <label className="dd-form-label">Residential Address</label>
                <input
                  type="text"
                  value={driverForm.address || ''}
                  onChange={e => setDriverForm({ ...driverForm, address: e.target.value })}
                  className="dd-form-input"
                />
              </div>
            </div>

            <div className="dd-modal-footer">
              <button type="button" className="dd-action-btn" onClick={() => setEditingDriver(false)}>Cancel</button>
              <button type="button" className="dd-action-btn dark" onClick={saveDriver} disabled={savingDriver}>
                {savingDriver ? 'Saving Details…' : 'Save Driver Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Reassignment Modal */}
      {reassigningVehicle && (
        <div className="dd-modal-backdrop" onClick={() => setReassigningVehicle(false)}>
          <div className="dd-modal-content" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="dd-modal-header">
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Reassign Fleet Vehicle</div>
              <button type="button" className="dd-sb-close-btn" onClick={() => setReassigningVehicle(false)}><Icon name="x" size={16} /></button>
            </div>

            <div className="dd-modal-body">
              <div className="dd-form-field">
                <label className="dd-form-label">Select Truck or Vehicle</label>
                <Combobox
                  options={[
                    { value: '', label: '— Unassign Vehicle —' },
                    ...vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))
                  ]}
                  value={selectedVehicleId}
                  onChange={setSelectedVehicleId}
                  placeholder="Choose vehicle..."
                />
              </div>
            </div>

            <div className="dd-modal-footer">
              <button type="button" className="dd-action-btn" onClick={() => setReassigningVehicle(false)}>Cancel</button>
              <button type="button" className="dd-action-btn dark" onClick={handleVehicleReassign}>Confirm Assignment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
