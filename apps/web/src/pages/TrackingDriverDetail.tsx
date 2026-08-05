import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import './TrackingDriverDetail.css';
import { PageHeader } from '../components/PageHeader.js';

interface DriverEnriched {
  id: string; name: string; phone: string | null; license_number: string | null;
  status: string; avatar_url: string | null; custom_id: string; email: string;
  joined_date: string; address: string;
}

interface VehicleEnriched {
  id: string; name: string; plate_number: string | null; custom_code: string;
  last_checking: string; capacity_kg: number; condition: string;
}

interface TripEnriched {
  id: string; origin: string | null; destination: string | null; status: string;
  created_at: string; delivery_id: string; distance_km: number | null;
  deliverable_items: number; total_issue: number; working_hours: number; overtime: number;
  fuel_purchase: number; fuel_per_litre: number; fleet_conditions: string;
  fleet_odometer: number; avg_daily_mileage: number; service_day: number;
  carrier_items: number; issued_items: number; refunded_items: number; delivery_accuracy: number;
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
            <div style={{ cursor: 'pointer', padding: 8, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8 }} onClick={() => navigate('/tracking/drivers')}>
              <Icon name="arrowLeft" size={16} color="var(--ink)" />
            </div>
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
            <div className="dd-alert-close" onClick={() => setDismissAlert(true)}><Icon name="x" size={16} /></div>
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
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>Cancel</button>
                  <button type="button" onClick={saveDriver} disabled={savingDriver}
                    style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--teal)', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', opacity: savingDriver ? 0.6 : 1 }}>
                    {savingDriver ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            <div className="dd-courier-top">
              <img src={driver.avatar_url || 'https://i.pravatar.cc/150'} alt={driver.name} className="dd-courier-avatar" />
              <div>
                {editingDriver ? (
                  <input value={driverForm.name || ''} onChange={e => setDriverForm({ ...driverForm, name: e.target.value })}
                    style={{ fontSize: 16, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontFamily: 'var(--font)', color: 'var(--ink)', width: '100%' }} />
                ) : (
                  <div className="dd-courier-name">{driver.name}</div>
                )}
                <div className="dd-courier-badges">
                  <span className="dd-courier-badge">Courier Code: {driver.custom_id}</span>
                  <span className="dd-courier-badge">Joined {new Date(driver.joined_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
            <div className="dd-info-grid">
              <div className="dd-info-item">
                <span className="dd-info-label">Email</span>
                <span className="dd-info-value">{driver.email}</span>
              </div>
              <div className="dd-info-item">
                <span className="dd-info-label">Address</span>
                <span className="dd-info-value">{driver.address}</span>
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
                <span className="dd-info-label">Last Checking</span>
                <span className="dd-info-value">{vehicle ? vehicle.last_checking : '—'}</span>
              </div>
              <div className="dd-info-item">
                <span className="dd-info-label">Fleet Capacity</span>
                <span className="dd-info-value">{vehicle ? `${vehicle.capacity_kg} kg` : '—'}</span>
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
          
          <div className="dd-tabs-header">
            {['Courier Report', 'Delivery Route', 'Delivery Issue', 'Fleet Issue'].map(tab => (
              <div key={tab} className={`dd-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab}
              </div>
            ))}
          </div>

          <div className="dd-report-list">
            {activeTab === 'Courier Report' && trips.length === 0 && <div style={{ color: 'var(--ink3)' }}>No recent deliveries found.</div>}
            {activeTab === 'Courier Report' && trips.map(t => (
              <div key={t.id} className="dd-report-item">
                <div className="dd-report-header" style={{ cursor: 'pointer' }} onClick={() => toggleTrip(t.id)}>
                  <div>
                    <div className="dd-route-title">{t.origin || 'Unknown'} <Icon name="arrowRight" size={14} style={{ margin: '0 8px', color: 'var(--ink3)' }}/> {t.destination || 'Unknown'}</div>
                    <div className="dd-route-meta">
                      <span>{new Date(t.created_at).toLocaleDateString()}</span>
                      <span style={{ color: 'var(--border2)' }}>|</span>
                      <span>{t.distance_km || 0} Miles Distance</span>
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
                    <div className="dd-metrics-row">
                      <div className="dd-metric">
                        <span className="dd-metric-label">Delivery ID</span>
                        <span className="dd-metric-val">{t.delivery_id}</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Total Delivery Mileage</span>
                        <span className="dd-metric-val">{t.distance_km || 0} m</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Deliverable Items</span>
                        <span className="dd-metric-val">{t.deliverable_items} Items</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Total Issue</span>
                        <span className="dd-metric-val">{t.total_issue} Cases</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Total Working Hours</span>
                        <span className="dd-metric-val">{t.working_hours} hr</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Overtime Delivery</span>
                        <span className="dd-metric-val" style={{ color: 'var(--red)' }}>{t.overtime} hr</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Fuel Purchase</span>
                        <span className="dd-metric-val">{t.fuel_purchase.toFixed(3)} L</span>
                      </div>
                      <div className="dd-metric">
                        <span className="dd-metric-label">Fuel Per Litre</span>
                        <span className="dd-metric-val">${t.fuel_per_litre.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="dd-nested-cards">
                      <div className="dd-ncard">
                        <div className="dd-ncard-title">Fleet Information</div>
                        <div className="dd-ncard-grid">
                          <div className="dd-ncard-item">
                            <span className="dd-ncard-label">Conditions</span>
                            <span className="dd-ncard-val">{t.fleet_conditions}</span>
                          </div>
                          <div className="dd-ncard-item">
                            <span className="dd-ncard-label">Fleet Odometer</span>
                            <span className="dd-ncard-val">{t.fleet_odometer.toLocaleString()} Miles</span>
                          </div>
                          <div className="dd-ncard-item">
                            <span className="dd-ncard-label">Avg. Daily Mileage</span>
                            <span className="dd-ncard-val">{t.avg_daily_mileage} Miles</span>
                          </div>
                          <div className="dd-ncard-item">
                            <span className="dd-ncard-label">Service Day</span>
                            <span className="dd-ncard-val">{t.service_day} Days Remaining</span>
                          </div>
                        </div>
                      </div>
                      <div className="dd-ncard">
                        <div className="dd-ncard-title">Deliverable Items Informations</div>
                        <div className="dd-ncard-grid cols-4">
                          <div className="dd-ncard-item">
                            <span className="dd-ncard-label">Carrier Items</span>
                            <span className="dd-ncard-val">{t.carrier_items} Items</span>
                          </div>
                          <div className="dd-ncard-item">
                            <span className="dd-ncard-label">Issued Items</span>
                            <span className="dd-ncard-val">{t.issued_items} Items</span>
                          </div>
                          <div className="dd-ncard-item">
                            <span className="dd-ncard-label">Refunded Items</span>
                            <span className="dd-ncard-val">{t.refunded_items} Items</span>
                          </div>
                          <div className="dd-ncard-item">
                            <span className="dd-ncard-label">Delivery Accuracy</span>
                            <span className="dd-ncard-val"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#10b981' }}><Icon name="star" size={12} duotone /> {t.delivery_accuracy}</span> / 5.0</span>
                          </div>
                        </div>
                      </div>
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
