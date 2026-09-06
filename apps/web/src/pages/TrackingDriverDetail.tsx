import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import './TrackingDriverDetail.css';
import { PageHeader } from '../components/PageHeader.js';
import { AvatarPicker } from '../components/AvatarPicker.js';

interface DriverEnriched {
  id: string; name: string; phone: string | null; license_number: string | null;
  status: string; avatar_url: string | null; custom_id: string; email: string | null;
  joined_date: string | null; address: string | null;
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
  const [activeTab, setActiveTab] = useState('Courier Report');
  const [dismissAlert, setDismissAlert] = useState(false);
  const [expandedTrips, setExpandedTrips] = useState<Record<string, boolean>>({});
  const [editingDriver, setEditingDriver] = useState(false);
  const [driverForm, setDriverForm] = useState<Record<string, string>>({});
  const [savingDriver, setSavingDriver] = useState(false);

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/tracking/drivers/${id}/detail`)
      .then(data => {
        setDetail(data);
        // Expand the first trip by default
        if (data?.trips?.length > 0) {
          setExpandedTrips({ [data.trips[0].id]: true });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  const toggleTrip = (tripId: string) => {
    setExpandedTrips(prev => ({ ...prev, [tripId]: !prev[tripId] }));
  };

  function startEditDriver() {
    setDriverForm({
      name: driver.name || '',
      phone: driver.phone || '',
      license_number: driver.license_number || '',
      status: driver.status || 'Available',
    });
    setEditingDriver(true);
  }

  async function saveDriver() {
    setSavingDriver(true);
    try {
      const payload: Record<string, any> = { ...driverForm };
      // Map display status back to DB status
      if (payload.status === 'Available') payload.status = 'ACTIVE';
      else if (payload.status === 'Off Duty') payload.status = 'INACTIVE';
      else if (payload.status === 'On Route') delete payload.status; // Can't set this directly
      Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });
      await apiFetch(`/v1/tracking/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setEditingDriver(false);
      reload();
    } catch (err) {
      console.error('Failed to save driver', err);
    } finally {
      setSavingDriver(false);
    }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--ink3)' }}>Loading profile...</div>;
  if (!detail) return <div style={{ padding: 40, color: 'var(--ink3)' }}>Profile not found.</div>;

  const { driver, vehicle, trips } = detail;

  return (
    <div className="dd-layout">
      <div className="dd-main">
        {/* Header */}
        <div className="dd-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button type="button" aria-label="Back to drivers" style={{ cursor: 'pointer', padding: 8, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8 }} onClick={() => navigate('/tracking/drivers')}>
              <Icon name="arrowLeft" size={16} color="var(--ink)" />
            </button>
            <div className="dd-search-bar">
              <Icon name="search" size={16} color="var(--ink3)" />
              <input placeholder="Search Stock or Orders" />
            </div>
          </div>
          <div className="dd-header-actions">
            <button className="dd-action-btn">
              Delivery Logs <Icon name="chevronDown" size={14} />
            </button>
            <button className="dd-action-btn">
              <Icon name="download" size={14} /> Download Delivery Report
            </button>
            <button className="dd-action-btn dark">
              <Icon name="sliders" size={14} /> Customize Widget
            </button>
          </div>
        </div>

        {/* Alert */}
        {!dismissAlert && (
          <div className="dd-alert">
            <div className="dd-alert-content">
              <div className="dd-alert-icon"><Icon name="alertTriangle" size={16} /></div>
              <div className="dd-alert-text">{driver.name} has some unverified information</div>
            </div>
            <button type="button" aria-label="Dismiss" className="dd-alert-close" onClick={() => setDismissAlert(true)}><Icon name="x" size={16} /></button>
          </div>
        )}

        {/* Profile Info Cards */}
        <div className="dd-profile-grid">
          {/* Courier Info */}
          <div className="dd-card">
            <div className="dd-card-header">
              <PageHeader
                crumbs={['HuduFreight', 'Driver']}
                titlePlain="Driver"
                titleEm="profile"
              />
              {!editingDriver ? (
                <button type="button" onClick={startEditDriver}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Icon name="edit" size={13} /> Edit
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setEditingDriver(false)}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 12px', cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
                  <button type="button" onClick={saveDriver} disabled={savingDriver}
                    style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--primary-foreground))', background: 'hsl(var(--primary))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 12px', cursor: 'pointer', opacity: savingDriver ? 0.6 : 1, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    {savingDriver ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            <div className="dd-courier-top">
              {/* A driver with no picture used to be given a stranger's face from
                  i.pravatar.cc — a stock photo fetched from an external
                  service and shown as if it were this person. Initials are the
                  honest rendering, and the camera button means a real picture
                  can now actually be set (drivers.avatar_url was read here and
                  by FleetOps and Tracking, but nothing anywhere could write
                  it). */}
              <AvatarPicker id={driver.id} kind="drivers" name={driver.name} size={80} shape="square"
                onChange={url => setDetail(prev => (prev ? { ...prev, driver: { ...prev.driver, avatar_url: url } } : prev))} />
              <div>
                {editingDriver ? (
                  <input value={driverForm.name || ''} onChange={e => setDriverForm({ ...driverForm, name: e.target.value })}
                    style={{ fontSize: 16, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontFamily: 'var(--font)', color: 'var(--ink)', width: '100%' }} />
                ) : (
                  <div className="dd-courier-name">{driver.name}</div>
                )}
                <div className="dd-courier-badges">
                  <span className="dd-courier-badge">Courier Code: {driver.custom_id}</span>
                  {driver.joined_date && (
                    <span className="dd-courier-badge">Joined {new Date(driver.joined_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="dd-info-grid">
              <div className="dd-info-item">
                <span className="dd-info-label">Email</span>
                <span className="dd-info-value">{driver.email || 'Not on file'}</span>
              </div>
              <div className="dd-info-item">
                <span className="dd-info-label">Address</span>
                <span className="dd-info-value">{driver.address || 'Not on file'}</span>
              </div>
              <div className="dd-info-item">
                <span className="dd-info-label">Phone Number</span>
                {editingDriver ? (
                  <input value={driverForm.phone || ''} onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })}
                    style={{ fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontFamily: 'var(--font)', color: 'var(--ink)', width: '100%' }} />
                ) : (
                  <span className="dd-info-value">{driver.phone || 'N/A'}</span>
                )}
              </div>
              <div className="dd-info-item">
                <span className="dd-info-label">License Number</span>
                {editingDriver ? (
                  <input value={driverForm.license_number || ''} onChange={e => setDriverForm({ ...driverForm, license_number: e.target.value })}
                    style={{ fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontFamily: 'var(--font)', color: 'var(--ink)', width: '100%' }} />
                ) : (
                  <span className="dd-info-value">{driver.license_number || 'N/A'}</span>
                )}
              </div>
            </div>
          </div>

          {/* Fleet Info */}
          <div className="dd-card">
            <div className="dd-card-header">
              <div className="dd-card-title">Fleet Information</div>
              <Icon name="moreHorizontal" size={20} color="var(--ink3)" />
            </div>
            <div className="dd-fleet-top">
              <div className="dd-fleet-minikcard">
                <div className="dd-fleet-icon"><Icon name="clipboard" size={16} /></div>
                <div>
                  <div className="dd-fleet-minikcard-title">Checking History</div>
                  <div className="dd-fleet-minikcard-sub">Daily, Weekly & Monthly Report</div>
                </div>
              </div>
              <div className="dd-fleet-minikcard">
                <div className="dd-fleet-icon"><Icon name="fileText" size={16} /></div>
                <div>
                  <div className="dd-fleet-minikcard-title">Legal Documents</div>
                  <div className="dd-fleet-minikcard-sub">Includes Vehicle Registration</div>
                </div>
              </div>
            </div>
            <div className="dd-fleet-grid">
              <div className="dd-info-item">
                <span className="dd-info-label">Fleet Brand</span>
                <span className="dd-info-value">{vehicle ? vehicle.name.split(' ')[0] : '—'}</span>
              </div>
              <div className="dd-info-item">
                <span className="dd-info-label">Fleet Model</span>
                <span className="dd-info-value">{vehicle ? vehicle.name : '—'}</span>
              </div>
              <div className="dd-info-item">
                <span className="dd-info-label">Fleet Code</span>
                <span className="dd-info-value">{vehicle ? vehicle.custom_code : '—'}</span>
              </div>
              <div className="dd-info-item">
                <span className="dd-info-label">Plate Number</span>
                <span className="dd-info-value">{vehicle?.plate_number || '—'}</span>
              </div>
              <div className="dd-info-item">
                <span className="dd-info-label">Fleet Condition</span>
                <span className="dd-info-value">
                  {vehicle && <span className="dd-condition-dot"></span>}
                  {vehicle ? vehicle.condition : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics & Analytics */}
        <div className="dd-stats-section">
          <div className="dd-card-header" style={{ padding: '24px 24px 16px', marginBottom: 0 }}>
            <div className="dd-card-title">Courier Statistics & Analytics</div>
            <div className="dd-search-bar" style={{ width: 220, padding: '6px 12px' }}>
              <input placeholder="26 May - 30 May" style={{ fontSize: 13 }} readOnly />
              <Icon name="calendar" size={14} color="var(--ink3)" />
            </div>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} variant="segmented">
            <TabsList>
              {['Courier Report', 'Delivery Route', 'Delivery Issue', 'Fleet Issue'].map(tab => (
                <TabsTrigger key={tab} value={tab}>{tab}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="dd-report-list">
            {activeTab === 'Courier Report' && trips.length === 0 && <div style={{ color: 'var(--ink3)' }}>No recent deliveries found.</div>}
            {activeTab === 'Courier Report' && trips.map(t => (
              <div key={t.id} className="dd-report-item">
                <div className="dd-report-header" style={{ cursor: 'pointer' }} onClick={() => toggleTrip(t.id)}
                  role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTrip(t.id); } }}>
                  <div>
                    <div className="dd-route-title">{t.origin || 'Unknown'} <Icon name="arrowRight" size={14} style={{ margin: '0 8px', color: 'var(--ink3)' }}/> {t.destination || 'Unknown'}</div>
                    <div className="dd-route-meta">
                      <span>{new Date(t.created_at).toLocaleDateString()}</span>
                      <span style={{ color: 'var(--border2)' }}>|</span>
                      <span>{t.distance_km != null ? `${t.distance_km} km` : 'Distance not logged'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span className={`dd-route-status ${t.status === 'COMPLETED' ? 'completed' : 'transit'}`}>
                      {t.status === 'COMPLETED' ? 'Complete' : `Transit On ${t.origin || 'Route'}`}
                    </span>
                    <Icon name={expandedTrips[t.id] ? 'chevronUp' : 'chevronDown'} size={20} color="var(--ink3)" />
                  </div>
                </div>

                {expandedTrips[t.id] && (
                  <>
                    {/* Every figure here comes straight off the trip row. This
                        used to be a fixed set of invented numbers (item
                        counts, a "fuel per litre" cost in dollars, an
                        odometer in miles) attached to every trip regardless
                        of driver or route — bulk-freight trucking has no
                        "deliverable items"/"cases" concept in the first
                        place, and none of it was ever computed from anything. */}
                    <div className="dd-metrics-row">
                      <div className="dd-metric">
                        <span className="dd-metric-label">Trip ID</span>
                        <span className="dd-metric-val">{t.delivery_id}</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Distance</span>
                        <span className="dd-metric-val">{t.distance_km != null ? `${t.distance_km} km` : 'Not logged'}</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Cargo Type</span>
                        <span className="dd-metric-val">{t.cargo_type || '—'}</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Cargo Weight</span>
                        <span className="dd-metric-val">{t.cargo_weight_kg != null ? `${t.cargo_weight_kg} kg` : '—'}</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Load Capacity Used</span>
                        <span className="dd-metric-val">{t.load_capacity_pct != null ? `${t.load_capacity_pct}%` : '—'}</span>
                      </div>
                    </div>

                    <div className="dd-nested-cards">
                      <div className="dd-ncard">
                        <div className="dd-ncard-title">Schedule</div>
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
                          <div className="dd-ncard-title">Cargo Description</div>
                          <div className="dd-ncard-grid">
                            <div className="dd-ncard-item">
                              <span className="dd-ncard-val">{t.cargo_desc}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
